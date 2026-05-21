const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// ============================================
// POSTOJEĆE RUTE (identične)
// ============================================

router.get('/', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const { status, vehicle_id, mechanic_id } = req.query;
    let query = `SELECT s.*, v.manufacturer, v.model, v.chassis_number, u.name as mechanic_name 
                 FROM services s 
                 LEFT JOIN vehicles v ON s.vehicle_id = v.id 
                 LEFT JOIN users u ON s.mechanic_id = u.id 
                 WHERE 1=1`;
    const params = [];

    if (status) { query += ' AND s.status = ?'; params.push(status); }
    if (vehicle_id) { query += ' AND s.vehicle_id = ?'; params.push(vehicle_id); }
    if (mechanic_id) { query += ' AND s.mechanic_id = ?'; params.push(mechanic_id); }

    query += ' ORDER BY s.service_date DESC';

    const [services] = await pool.execute(query, params);
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

router.get('/:id', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const [services] = await pool.execute(
      `SELECT s.*, v.manufacturer, v.model, v.license_plate, u.name as mechanic_name 
       FROM services s 
       LEFT JOIN vehicles v ON s.vehicle_id = v.id 
       LEFT JOIN users u ON s.mechanic_id = u.id 
       WHERE s.id = ?`,
      [req.params.id]
    );

    if (services.length === 0) return res.status(404).json({ error: 'Service not found' });

    const service = services[0];

    const [parts] = await pool.execute(
      `SELECT sp.*, p.name as part_name, p.part_number 
       FROM service_parts sp 
       JOIN warehouse p ON sp.part_id = p.id 
       WHERE sp.service_id = ?`,
      [req.params.id]
    );

    // NOVO: Dohvati plaćanja mehaničaru
    const [payments] = await pool.execute(
      `SELECT * FROM mechanic_payments WHERE service_id = ? ORDER BY payment_date DESC`,
      [req.params.id]
    );

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const laborCost = parseFloat(service.labor_cost || 0);
    const remainingDebt = laborCost - totalPaid;

    service.parts_used = parts;
    service.mechanic_payments = payments;
    service.mechanic_total_paid = totalPaid;
    service.mechanic_remaining_debt = remainingDebt > 0 ? remainingDebt : 0;

    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

router.post('/', authenticate, authorizeEntity('services'), authorize(['services.create']), async (req, res) => {
  try {
    const { vehicle_id, service_type, description, service_date, estimated_cost } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO services (vehicle_id, service_type, description, service_date, estimated_cost, status, created_by) 
       VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`,
      [vehicle_id, service_type, description, service_date, estimated_cost, req.user.id]
    );

    res.status(201).json({ id: result.insertId, message: 'Service scheduled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to schedule service' });
  }
});

router.put('/:id/confirm', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'mechanic') {
      return res.status(403).json({ error: 'Only mechanics can confirm services' });
    }

    await pool.execute(
      'UPDATE services SET status = ?, mechanic_id = ?, confirmed_at = NOW() WHERE id = ?',
      ['confirmed', req.user.id, req.params.id]
    );

    res.json({ message: 'Service confirmed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm service' });
  }
});

// ============================================
// ISPRAVLJENA COMPLETE RUTA - s total_cost
// ============================================

router.put('/:id/complete', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const { work_description, labor_cost, mileage, parts_used } = req.body;

    const [serviceData] = await pool.execute(
      'SELECT vehicle_id FROM services WHERE id = ?',
      [req.params.id]
    );

    if (serviceData.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const vehicleId = serviceData[0].vehicle_id;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [vehicleData] = await connection.execute(
        'SELECT mileage, total_expenses FROM vehicles WHERE id = ?',
        [vehicleId]
      );
      const previousMileage = vehicleData[0]?.mileage || 0;
      const currentExpenses = vehicleData[0]?.total_expenses || 0;

      // Izračunaj ukupno dijelova
      let partsTotal = 0;
      if (parts_used && parts_used.length > 0) {
        for (const part of parts_used) {
          const [stock] = await connection.execute(
            'SELECT quantity, unit_price FROM warehouse WHERE id = ?',
            [part.part_id]
          );

          if (stock.length === 0 || stock[0].quantity < part.quantity) {
            throw new Error(`Nedovoljna zaliha za dio: ${part.name || part.part_id}`);
          }

          const unitPrice = part.unit_price || stock[0].unit_price;
          const partTotal = part.quantity * unitPrice;
          partsTotal += partTotal;

          await connection.execute(
            'INSERT INTO service_parts (service_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
            [req.params.id, part.part_id, part.quantity, unitPrice]
          );

          await connection.execute(
            'UPDATE warehouse SET quantity = quantity - ? WHERE id = ?',
            [part.quantity, part.part_id]
          );
        }
      }

      const laborCostNum = parseFloat(labor_cost || 0);
      const totalCost = laborCostNum + partsTotal;

      // NOVO: Spremi total_cost
      await connection.execute(
        'UPDATE services SET status = ?, work_description = ?, labor_cost = ?, total_cost = ?, completed_at = NOW(), previous_mileage = ? WHERE id = ?',
        ['completed', work_description, laborCostNum, totalCost, previousMileage, req.params.id]
      );

      if (mileage && mileage > 0) {
        await connection.execute(
          'UPDATE vehicles SET mileage = ? WHERE id = ?',
          [mileage, vehicleId]
        );
      }

      // NOVO: Ažuriraj financije vozila
      const newExpenses = currentExpenses + totalCost;
      await connection.execute(
        `UPDATE vehicles 
         SET total_expenses = ?,
             total_profit = total_income - ?
         WHERE id = ?`,
        [newExpenses, newExpenses, vehicleId]
      );

      await connection.commit();
      res.json({ message: 'Service completed successfully', total_cost: totalCost });

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Complete service error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete service' });
  }
});

router.delete('/:id', authenticate, authorizeEntity('services'), authorize(['services.delete']), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [serviceRows] = await connection.execute(
      'SELECT * FROM services WHERE id = ?',
      [req.params.id]
    );
    
    if (serviceRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Service not found' });
    }

    const service = serviceRows[0];
    const vehicleId = service.vehicle_id;

    const [partsUsed] = await connection.execute(
      'SELECT part_id, quantity FROM service_parts WHERE service_id = ?',
      [req.params.id]
    );

    for (const part of partsUsed) {
      await connection.execute(
        'UPDATE warehouse SET quantity = quantity + ? WHERE id = ?',
        [part.quantity, part.part_id]
      );
    }

    // NOVO: Vrati troškove ako je bio completed
    if (service.status === 'completed' && service.total_cost > 0) {
      await connection.execute(
        `UPDATE vehicles 
         SET total_expenses = total_expenses - ?,
             total_profit = total_income - (total_expenses - ?)
         WHERE id = ?`,
        [service.total_cost, service.total_cost, vehicleId]
      );
    }

    if (service.status === 'completed' && service.previous_mileage !== null) {
      await connection.execute(
        'UPDATE vehicles SET mileage = ? WHERE id = ?',
        [service.previous_mileage, vehicleId]
      );
    }

    await connection.execute('DELETE FROM services WHERE id = ?', [req.params.id]);

    await connection.commit();
    connection.release();

    res.json({ 
      message: 'Service deleted successfully',
      partsReturned: partsUsed.length,
      mileageReverted: service.status === 'completed' && service.previous_mileage !== null
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// ============================================
// NOVO: MECHANIC PAYMENTS
// ============================================

router.post('/:id/mechanic-payments', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const { amount, payment_date, note } = req.body;
    const serviceId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const [service] = await pool.execute(
      'SELECT mechanic_id, labor_cost FROM services WHERE id = ?',
      [serviceId]
    );

    if (service.length === 0) return res.status(404).json({ error: 'Service not found' });
    if (!service[0].mechanic_id) return res.status(400).json({ error: 'No mechanic assigned' });

    const mechanicId = service[0].mechanic_id;
    const laborCost = parseFloat(service[0].labor_cost || 0);

    // Provjeri prethodna plaćanja
    const [paidSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total FROM mechanic_payments WHERE service_id = ?',
      [serviceId]
    );
    const alreadyPaid = parseFloat(paidSum[0].total);
    const remaining = laborCost - alreadyPaid;

    if (parseFloat(amount) > remaining) {
      return res.status(400).json({ 
        error: `Amount exceeds remaining debt. Remaining: ${remaining.toFixed(2)} €` 
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO mechanic_payments (mechanic_id, service_id, amount, payment_date, note)
       VALUES (?, ?, ?, ?, ?)`,
      [mechanicId, serviceId, amount, payment_date || new Date(), note || null]
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Payment recorded',
      remaining: remaining - parseFloat(amount)
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

router.get('/mechanic-debts/:mechanicId', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const [debts] = await pool.execute(`
      SELECT 
        s.id as service_id,
        s.description,
        s.work_description,
        s.labor_cost,
        s.completed_at,
        s.total_cost,
        v.manufacturer,
        v.model,
        v.license_plate,
        COALESCE(SUM(mp.amount), 0) as total_paid,
        (s.labor_cost - COALESCE(SUM(mp.amount), 0)) as remaining
      FROM services s
      JOIN vehicles v ON s.vehicle_id = v.id
      LEFT JOIN mechanic_payments mp ON s.id = mp.service_id
      WHERE s.mechanic_id = ? AND s.status = 'completed'
      GROUP BY s.id
      HAVING remaining > 0
      ORDER BY s.completed_at DESC
    `, [req.params.mechanicId]);

    res.json(debts);
  } catch (error) {
    console.error('Fetch mechanic debts error:', error);
    res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

module.exports = router;

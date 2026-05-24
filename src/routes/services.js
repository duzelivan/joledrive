const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// Helper: get mechanic role for a service
async function getMechanicRole(connection, serviceId) {
  const [rows] = await connection.execute(
    'SELECT s.mechanic_id, u.role FROM services s LEFT JOIN users u ON s.mechanic_id = u.id WHERE s.id = ?',
    [serviceId]
  );
  return rows[0]?.role || 'mechanic';
}

// Helper: calculate total expense based on mechanic role
function calculateExpense(laborCost, partsTotal, mechanicRole) {
  // Admin: only parts count as expense (admin labor is "free" for the company)
  // Mechanic: labor + parts count as expense
  const effectiveLabor = mechanicRole === 'admin' ? 0 : parseFloat(laborCost || 0);
  return effectiveLabor + partsTotal;
}

// NOVO: Dohvati SVE plaćanja mehaničaru (za prikaz u kartici)
router.get('/mechanic-payments/all', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const [payments] = await pool.execute(
      `SELECT mp.*, u.name as mechanic_name 
       FROM mechanic_payments mp
       LEFT JOIN users u ON mp.mechanic_id = u.id
       ORDER BY mp.payment_date DESC`
    );
    res.json(payments);
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.get('/', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const { status, vehicle_id, mechanic_id } = req.query;
    let query = `SELECT s.*, v.manufacturer, v.model, v.chassis_number, v.license_plate, u.name as mechanic_name 
                 FROM services s 
                 LEFT JOIN vehicles v ON s.vehicle_id = v.id 
                 LEFT JOIN users u ON s.mechanic_id = u.id 
                 WHERE 1=1`;
    const params = [];

    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }
    if (vehicle_id) {
      query += ' AND s.vehicle_id = ?';
      params.push(vehicle_id);
    }
    if (mechanic_id) {
      query += ' AND s.mechanic_id = ?';
      params.push(mechanic_id);
    }

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

    // Get mechanic role
    let mechanicRole = 'mechanic';
    if (service.mechanic_id) {
      const [mechanicData] = await pool.execute('SELECT role FROM users WHERE id = ?', [service.mechanic_id]);
      mechanicRole = mechanicData[0]?.role || 'mechanic';
    }

    // Calculate costs
    const partsTotal = parts.reduce((sum, part) => sum + (part.quantity * part.unit_price), 0);
    const laborCost = parseFloat(service.labor_cost || 0);
    
    // Puni trošak (labor + parts) - informativno
    service.total_cost = laborCost + partsTotal;
    
    // Effective trošak koji ide u obračun (admin = samo dijelovi, mech = rad + dijelovi)
    service.effective_cost = calculateExpense(service.labor_cost, partsTotal, mechanicRole);
    service.parts_total = partsTotal;
    service.labor_counted = mechanicRole === 'admin' ? 0 : laborCost;
    service.mechanic_role = mechanicRole;
    service.parts_used = parts;

    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// NOVO: Plaćanje prema mehaničaru (bez servisa)
router.post('/mechanic-payments/by-mechanic', authenticate, authorize(['admin']), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { mechanic_id, amount, payment_date, note } = req.body;

    // Provjeri mehaničara
    const [mechanicRows] = await connection.execute(
      'SELECT id, name, role FROM users WHERE id = ? AND role = ?',
      [mechanic_id, 'mechanic']
    );

    if (mechanicRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Mechanic not found' });
    }

    // Provjeri dugovanje (samo rad mehaničara, ne admina)
    const [debtResult] = await connection.execute(
      `SELECT 
        COALESCE(SUM(CASE WHEN u.role != 'admin' THEN s.labor_cost ELSE 0 END), 0) as total_labor,
        (SELECT COALESCE(SUM(amount), 0) FROM mechanic_payments WHERE mechanic_id = ?) as total_paid
       FROM services s
       JOIN users u ON s.mechanic_id = u.id
       WHERE s.mechanic_id = ? AND s.status = 'completed'`,
      [mechanic_id, mechanic_id]
    );

    const totalLabor = parseFloat(debtResult[0].total_labor);
    const totalPaid = parseFloat(debtResult[0].total_paid);
    const remainingDebt = totalLabor - totalPaid;

    if (parseFloat(amount) > remainingDebt) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ 
        error: `Payment exceeds debt. Current debt: €${remainingDebt.toFixed(2)}` 
      });
    }

    // Umetni plaćanje bez service_id (NULL)
    const [result] = await connection.execute(
      `INSERT INTO mechanic_payments (mechanic_id, service_id, amount, payment_date, note, created_by) 
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [mechanic_id, amount, payment_date || new Date(), note || null, req.user.id]
    );

    await connection.commit();
    connection.release();

    res.json({ 
      id: result.insertId,
      message: 'Payment recorded successfully',
      amount: parseFloat(amount),
      remaining_debt: remainingDebt - parseFloat(amount)
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Mechanic payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

router.post('/', authenticate, authorizeEntity('services'), authorize(['services.create']), async (req, res) => {
  try {
    const { vehicle_id, service_type, description, service_date, estimated_cost } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO services (vehicle_id, service_type, description, service_date, status, created_by) 
       VALUES (?, ?, ?, ?, 'scheduled', ?)`,
      [vehicle_id, service_type, description, service_date, req.user.id]
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

router.put('/:id/complete', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const { work_description, labor_cost, mileage, parts_used } = req.body;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [serviceData] = await connection.execute(
        'SELECT vehicle_id, mechanic_id FROM services WHERE id = ?',
        [req.params.id]
      );

      if (serviceData.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ error: 'Service not found' });
      }

      const vehicleId = serviceData[0].vehicle_id;
      const mechanicId = serviceData[0].mechanic_id;

      // Get mechanic role
      const [mechanicData] = await connection.execute(
        'SELECT role FROM users WHERE id = ?',
        [mechanicId]
      );
      const mechanicRole = mechanicData[0]?.role || 'mechanic';

      const [vehicleData] = await connection.execute(
        'SELECT mileage FROM vehicles WHERE id = ?',
        [vehicleId]
      );
      const previousMileage = vehicleData[0]?.mileage || 0;

      await connection.execute(
        'UPDATE services SET status = ?, work_description = ?, labor_cost = ?, completed_at = NOW(), previous_mileage = ? WHERE id = ?',
        ['completed', work_description, labor_cost, previousMileage, req.params.id]
      );

      if (mileage && mileage > 0) {
        await connection.execute(
          'UPDATE vehicles SET mileage = ? WHERE id = ?',
          [mileage, vehicleId]
        );
      }

      let partsTotal = 0;
      if (parts_used && parts_used.length > 0) {
        for (const part of parts_used) {
          const [stock] = await connection.execute(
            'SELECT quantity FROM warehouse WHERE id = ?',
            [part.part_id]
          );

          if (stock.length === 0 || stock[0].quantity < part.quantity) {
            throw new Error(`Nedovoljna zaliha za dio: ${part.name}`);
          }

          await connection.execute(
            'INSERT INTO service_parts (service_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
            [req.params.id, part.part_id, part.quantity, part.unit_price]
          );

          await connection.execute(
            'UPDATE warehouse SET quantity = quantity - ? WHERE id = ?',
            [part.quantity, part.part_id]
          );

          partsTotal += part.quantity * part.unit_price;
        }
      }

      // Admin: only parts count as expense
      // Mechanic: labor + parts count as expense
      const totalServiceCost = calculateExpense(labor_cost, partsTotal, mechanicRole);

      await connection.execute(
        'UPDATE vehicles SET total_expenses = total_expenses + ? WHERE id = ?',
        [totalServiceCost, vehicleId]
      );
      await connection.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [vehicleId]
      );

      await connection.commit();
      connection.release();
      
      res.json({ 
        message: 'Service completed successfully',
        total_cost: totalServiceCost,
        parts_cost: partsTotal,
        labor_cost: mechanicRole === 'admin' ? 0 : parseFloat(labor_cost || 0)
      });

    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
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

    const [partsUsed] = await connection.execute(
      'SELECT part_id, quantity, unit_price FROM service_parts WHERE service_id = ?',
      [req.params.id]
    );

    for (const part of partsUsed) {
      await connection.execute(
        'UPDATE warehouse SET quantity = quantity + ? WHERE id = ?',
        [part.quantity, part.part_id]
      );
    }

    if (service.status === 'completed' && service.previous_mileage !== null) {
      await connection.execute(
        'UPDATE vehicles SET mileage = ? WHERE id = ?',
        [service.previous_mileage, service.vehicle_id]
      );
    }

    if (service.status === 'completed') {
      // Get mechanic role to calculate correct reversal amount
      const mechanicRole = await getMechanicRole(connection, req.params.id);
      
      const partsTotal = partsUsed.reduce((sum, part) => sum + (part.quantity * part.unit_price), 0);
      const totalServiceCost = calculateExpense(service.labor_cost, partsTotal, mechanicRole);

      await connection.execute(
        'UPDATE vehicles SET total_expenses = total_expenses - ? WHERE id = ?',
        [totalServiceCost, service.vehicle_id]
      );
      await connection.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [service.vehicle_id]
      );
    }

    // Obriši povezana plaćanja mehaničaru
    await connection.execute('DELETE FROM mechanic_payments WHERE service_id = ?', [req.params.id]);

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
// PLAĆANJA MEHANIČARU - ISPRAVLJENO
// ============================================

// Dohvati sva plaćanja mehaničaru po servisu
router.get('/:id/mechanic-payments', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const [payments] = await pool.execute(
      `SELECT mp.*, u.name as mechanic_name 
       FROM mechanic_payments mp
       LEFT JOIN users u ON mp.mechanic_id = u.id
       WHERE mp.service_id = ?
       ORDER BY mp.payment_date DESC`,
      [req.params.id]
    );
    res.json(payments);
  } catch (error) {
    console.error('Get mechanic payments error:', error);
    res.status(500).json({ error: 'Failed to fetch mechanic payments' });
  }
});

// Zabilježi novo plaćanje mehaničaru (s validacijom)
router.post('/:id/mechanic-payments', authenticate, authorizeEntity('services'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { amount, payment_date, note } = req.body;
    const serviceId = req.params.id;

    // Provjeri servis i mehaničarovu rolu
    const [serviceRows] = await connection.execute(
      `SELECT s.mechanic_id, s.labor_cost, s.vehicle_id, u.role 
       FROM services s 
       LEFT JOIN users u ON s.mechanic_id = u.id
       WHERE s.id = ?`,
      [serviceId]
    );

    if (serviceRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Service not found' });
    }

    const service = serviceRows[0];
    
    if (!service.mechanic_id) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'No mechanic assigned to this service' });
    }

    // Admin services have no mechanic debt (labor_cost = 0 for debt calc)
    const effectiveLaborCost = service.role === 'admin' ? 0 : parseFloat(service.labor_cost || 0);

    // Provjeri da uplata ne prelazi dugovanje za ovaj servis
    const [servicePaymentsResult] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) as total_paid 
       FROM mechanic_payments 
       WHERE service_id = ?`,
      [serviceId]
    );

    const alreadyPaid = parseFloat(servicePaymentsResult[0].total_paid);
    const remainingForService = effectiveLaborCost - alreadyPaid;

    if (parseFloat(amount) > remainingForService) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ 
        error: `Payment exceeds remaining debt for this service. Remaining: €${remainingForService.toFixed(2)}` 
      });
    }

    // Umetni plaćanje
    const [result] = await connection.execute(
      `INSERT INTO mechanic_payments (mechanic_id, service_id, amount, payment_date, note, created_by) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [service.mechanic_id, serviceId, amount, payment_date || new Date(), note || null, req.user.id]
    );

    await connection.commit();
    connection.release();

    res.json({ 
      id: result.insertId,
      message: 'Payment recorded successfully',
      amount: parseFloat(amount),
      remaining_for_service: remainingForService - parseFloat(amount)
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Mechanic payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Obriši plaćanje mehaničaru (samo admin)
router.delete('/mechanic-payments/:paymentId', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM mechanic_payments WHERE id = ?',
      [req.params.paymentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// Endpoint za ukupno dugovanje mehaničaru (samo za mehaničare, ne admine)
router.get('/mechanic-debt/:mechanicId', authenticate, authorizeEntity('services'), async (req, res) => {
  try {
    const mechanicId = req.params.mechanicId;

    // Provjeri je li korisnik mehaničar (ne admin)
    const [userCheck] = await pool.execute(
      'SELECT role FROM users WHERE id = ?',
      [mechanicId]
    );

    if (userCheck.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ako je admin, vrati 0 dugovanje (admin nema labor debt)
    if (userCheck[0].role === 'admin') {
      return res.json({
        mechanic_id: mechanicId,
        total_labor: 0,
        total_paid: 0,
        remaining_debt: 0,
        note: 'Admin has no labor debt'
      });
    }

    const [laborResult] = await pool.execute(
      `SELECT COALESCE(SUM(labor_cost), 0) as total_labor 
       FROM services 
       WHERE mechanic_id = ? AND status = 'completed'`,
      [mechanicId]
    );

    const [paymentResult] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) as total_paid 
       FROM mechanic_payments 
       WHERE mechanic_id = ?`,
      [mechanicId]
    );

    const totalLabor = parseFloat(laborResult[0].total_labor);
    const totalPaid = parseFloat(paymentResult[0].total_paid);
    const remainingDebt = totalLabor - totalPaid;

    res.json({
      mechanic_id: mechanicId,
      total_labor: totalLabor,
      total_paid: totalPaid,
      remaining_debt: remainingDebt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mechanic debt' });
  }
});

module.exports = router;

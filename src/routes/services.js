const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all services
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, vehicle_id, mechanic_id } = req.query;
    let query = `SELECT s.*, v.manufacturer, v.model, v.chassis_number, u.name as mechanic_name 
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

// Get single service with parts used
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [services] = await pool.execute(
      `SELECT s.*, v.manufacturer, v.model, u.name as mechanic_name 
       FROM services s 
       LEFT JOIN vehicles v ON s.vehicle_id = v.id 
       LEFT JOIN users u ON s.mechanic_id = u.id 
       WHERE s.id = ?`,
      [req.params.id]
    );

    if (services.length === 0) return res.status(404).json({ error: 'Service not found' });

    const service = services[0];

    // Get parts used
    const [parts] = await pool.execute(
      `SELECT sp.*, p.name as part_name, p.part_number 
       FROM service_parts sp 
       JOIN warehouse p ON sp.part_id = p.id 
       WHERE sp.service_id = ?`,
      [req.params.id]
    );

    service.parts_used = parts;
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// Create service (schedule appointment)
router.post('/', authenticate, authorize(['services.create']), async (req, res) => {
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

// Confirm service (mechanic)
router.put('/:id/confirm', authenticate, async (req, res) => {
  try {
    // Check if user is mechanic or admin
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

// Complete service
router.put('/:id/complete', authenticate, async (req, res) => {
  try {
    const { work_description, labor_cost, mileage, parts_used } = req.body;

    // Dohvati vehicle_id za ažuriranje kilometraže
    const [serviceData] = await pool.execute(
      'SELECT vehicle_id FROM services WHERE id = ?',
      [req.params.id]
    );

    if (serviceData.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const vehicleId = serviceData[0].vehicle_id;

    // Započni transakciju
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Dohvati TRENUTNU kilometražu vozila prije ažuriranja
      const [vehicleData] = await connection.execute(
        'SELECT mileage FROM vehicles WHERE id = ?',
        [vehicleId]
      );
      const previousMileage = vehicleData[0]?.mileage || 0;

      // 2. Ažuriraj servis - spremi previous_mileage
      await connection.execute(
        'UPDATE services SET status = ?, work_description = ?, labor_cost = ?, completed_at = NOW(), previous_mileage = ? WHERE id = ?',
        ['completed', work_description, labor_cost, previousMileage, req.params.id]
      );

      // 3. Ažuriraj kilometražu vozila ako je poslana
      if (mileage && mileage > 0) {
        await connection.execute(
          'UPDATE vehicles SET mileage = ? WHERE id = ?',
          [mileage, vehicleId]
        );
      }

      // 4. Dodaj dijelove i razduži skladište
      if (parts_used && parts_used.length > 0) {
        for (const part of parts_used) {
          // Provjeri dostupnost
          const [stock] = await connection.execute(
            'SELECT quantity FROM warehouse WHERE id = ?',
            [part.part_id]
          );

          if (stock.length === 0 || stock[0].quantity < part.quantity) {
            throw new Error(`Nedovoljna zaliha za dio: ${part.name}`);
          }

          // Dodaj u service_parts
          await connection.execute(
            'INSERT INTO service_parts (service_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
            [req.params.id, part.part_id, part.quantity, part.unit_price]
          );

          // Razduži skladište
          await connection.execute(
            'UPDATE warehouse SET quantity = quantity - ? WHERE id = ?',
            [part.quantity, part.part_id]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Service completed successfully' });

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

// ============================================
// NOVO: Delete service with rollback
// ============================================
router.delete('/:id', authenticate, authorize(['services.delete']), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Dohvati servis
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

    // 2. Dohvati dijelove korištene u servisu
    const [partsUsed] = await connection.execute(
      'SELECT part_id, quantity FROM service_parts WHERE service_id = ?',
      [req.params.id]
    );

    // 3. Vrati dijelove na skladište
    for (const part of partsUsed) {
      await connection.execute(
        'UPDATE warehouse SET quantity = quantity + ? WHERE id = ?',
        [part.quantity, part.part_id]
      );
    }

    // 4. Vrati kilometražu vozila (ako je servis bio završen i imao previous_mileage)
    if (service.status === 'completed' && service.previous_mileage !== null) {
      await connection.execute(
        'UPDATE vehicles SET mileage = ? WHERE id = ?',
        [service.previous_mileage, service.vehicle_id]
      );
    }

    // 5. Obriši servis (service_parts se briše automatski CASCADE)
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

module.exports = router;

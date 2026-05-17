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
    const { work_description, labor_cost, parts_used } = req.body;

    await pool.execute(
      'UPDATE services SET status = ?, work_description = ?, labor_cost = ?, completed_at = NOW() WHERE id = ?',
      ['completed', work_description, labor_cost, req.params.id]
    );

    // Add parts used and deduct from warehouse
    if (parts_used && parts_used.length > 0) {
      for (const part of parts_used) {
        await pool.execute(
          'INSERT INTO service_parts (service_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [req.params.id, part.part_id, part.quantity, part.unit_price]
        );

        // Deduct from warehouse
        await pool.execute(
          'UPDATE warehouse SET quantity = quantity - ? WHERE id = ?',
          [part.quantity, part.part_id]
        );
      }
    }

    res.json({ message: 'Service completed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete service' });
  }
});

// Delete service
router.delete('/:id', authenticate, authorize(['services.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM services WHERE id = ?', [req.params.id]);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

module.exports = router;

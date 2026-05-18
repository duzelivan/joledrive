const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all vehicles with assigned user
router.get('/', authenticate, async (req, res) => {
  try {
    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_name 
       FROM vehicles v 
       LEFT JOIN users u ON v.assigned_to = u.id 
       ORDER BY v.created_at DESC`
    );
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

// Get single vehicle with service history
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_name 
       FROM vehicles v 
       LEFT JOIN users u ON v.assigned_to = u.id 
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (vehicles.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    const vehicle = vehicles[0];

    // Get service history
    const [services] = await pool.execute(
      `SELECT s.*, u.name as mechanic_name 
       FROM services s 
       LEFT JOIN users u ON s.mechanic_id = u.id 
       WHERE s.vehicle_id = ? ORDER BY s.service_date DESC`,
      [req.params.id]
    );

    vehicle.service_history = services;
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

// Create vehicle
router.post('/', authenticate, authorize(['vehicles.create']), async (req, res) => {
  try {
    const { manufacturer, model, license_plate, chassis_number, year, mileage,
      fuel_type, color, registration_date, yellow_card_date,
      pp_apparatus_date, image_url, notes, assigned_to } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO vehicles (manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color, 
        registration_date, yellow_card_date, pp_apparatus_date, image_url, notes, assigned_to) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color,
       registration_date, yellow_card_date, pp_apparatus_date, image_url, notes, assigned_to || null]
    );

    res.status(201).json({ id: result.insertId, message: 'Vehicle created successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'License plate or chassis number already exists' });
    }
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

// Update vehicle
router.put('/:id', authenticate, authorize(['vehicles.edit']), async (req, res) => {
  try {
    const { manufacturer, model, license_plate, chassis_number, year, mileage,
      fuel_type, color, registration_date, yellow_card_date,
      pp_apparatus_date, image_url, notes, assigned_to } = req.body;

    const updates = [];
    const values = [];

    if (manufacturer) { updates.push('manufacturer = ?'); values.push(manufacturer); }
    if (model) { updates.push('model = ?'); values.push(model); }
    if (license_plate) { updates.push('license_plate = ?'); values.push(license_plate); }
    if (chassis_number) { updates.push('chassis_number = ?'); values.push(chassis_number); }
    if (year) { updates.push('year = ?'); values.push(year); }
    if (mileage) { updates.push('mileage = ?'); values.push(mileage); }
    if (fuel_type) { updates.push('fuel_type = ?'); values.push(fuel_type); }
    if (color) { updates.push('color = ?'); values.push(color); }
    if (registration_date) { updates.push('registration_date = ?'); values.push(registration_date); }
    if (yellow_card_date) { updates.push('yellow_card_date = ?'); values.push(yellow_card_date); }
    if (pp_apparatus_date) { updates.push('pp_apparatus_date = ?'); values.push(pp_apparatus_date); }
    if (image_url) { updates.push('image_url = ?'); values.push(image_url); }
    if (notes) { updates.push('notes = ?'); values.push(notes); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(assigned_to || null); }

    values.push(req.params.id);

    await pool.execute(
      `UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'Vehicle updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// Delete vehicle
router.delete('/:id', authenticate, authorize(['vehicles.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

module.exports = router;

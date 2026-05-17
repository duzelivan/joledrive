const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const [vehicles] = await pool.execute(
      `SELECT v.*, 
        (SELECT COUNT(*) FROM services WHERE vehicle_id = v.id) as service_count
       FROM vehicles v ORDER BY v.created_at DESC`
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
      'SELECT * FROM vehicles WHERE id = ?',
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
    const {
      manufacturer, model, license_plate, chassis_number, year, mileage,
      fuel_type, color, registration_date, yellow_card_date,
      pp_apparatus_date, image_url, notes
    } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO vehicles (manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color, 
        registration_date, yellow_card_date, pp_apparatus_date, image_url, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color,
       registration_date, yellow_card_date, pp_apparatus_date, image_url, notes]
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
    const {
      manufacturer, model, license_plate, chassis_number, year, mileage,
      fuel_type, color, registration_date, yellow_card_date,
      pp_apparatus_date, image_url, notes
    } = req.body;

    await pool.execute(
      `UPDATE vehicles SET 
        manufacturer = ?, model = ?, license_plate = ?, chassis_number = ?, year = ?, mileage = ?,
        fuel_type = ?, color = ?, registration_date = ?, yellow_card_date = ?,
        pp_apparatus_date = ?, image_url = ?, notes = ?
       WHERE id = ?`,
      [manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color,
       registration_date, yellow_card_date, pp_apparatus_date, image_url, notes, req.params.id]
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

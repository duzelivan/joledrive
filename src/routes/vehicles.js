const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'vehicles');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'vehicle-' + unique + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPEG, PNG, WebP, GIF allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Upload endpoint — returns full URL
router.post('/upload', authenticate, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const imageUrl = `${protocol}://${host}/uploads/vehicles/${req.file.filename}`;
  res.json({ image_url: imageUrl, message: 'Image uploaded' });
});

router.get('/', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const active = req.query.active === '0' ? 0 : 1;
    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_name,
        (SELECT s.status FROM services s 
         WHERE s.vehicle_id = v.id 
         AND s.status IN ('scheduled', 'confirmed')
         ORDER BY s.service_date ASC
         LIMIT 1) as service_status
       FROM vehicles v 
       LEFT JOIN users u ON v.assigned_to = u.id 
       WHERE v.active = ?
       ORDER BY v.created_at DESC`,
      [active]
    );
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.put('/:id/archive', authenticate, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE vehicles SET active = 0 WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true, message: 'Vozilo arhivirano' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/restore', authenticate, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE vehicles SET active = 1 WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true, message: 'Vozilo aktivirano' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, authorizeEntity('vehicles'), async (req, res) => {
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

    const [services] = await pool.execute(
      `SELECT s.*, u.name as mechanic_name 
       FROM services s 
       LEFT JOIN users u ON s.mechanic_id = u.id 
       WHERE s.vehicle_id = ? ORDER BY s.service_date DESC`,
      [req.params.id]
    );

    const [invoices] = await pool.execute(
      `SELECT i.*, COALESCE(SUM(p.amount), 0) as paid_amount,
       (i.amount - COALESCE(SUM(p.amount), 0)) as remaining_amount
       FROM invoices i 
       LEFT JOIN invoice_payments p ON i.id = p.invoice_id
       WHERE i.vehicle_id = ? 
       GROUP BY i.id 
       ORDER BY i.created_at DESC`,
      [req.params.id]
    );

    const [documents] = await pool.execute(
      `SELECT d.*, u.name as uploaded_by_name
       FROM documents d 
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.vehicle_id = ? 
       ORDER BY d.created_at DESC`,
      [req.params.id]
    );

    const enrichedInvoices = invoices.map(inv => {
      const paid = parseFloat(inv.paid_amount || 0);
      const total = parseFloat(inv.amount);
      let status = 'unpaid';
      if (paid >= total) status = 'paid';
      else if (paid > 0) status = 'partial';
      return { ...inv, status };
    });

    vehicle.service_history = services;
    vehicle.invoices = enrichedInvoices;
    vehicle.documents = documents;

    res.json(vehicle);
  } catch (error) {
    console.error('Fetch vehicle detail error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle details' });
  }
});

router.post('/', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.create']), async (req, res) => {
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

router.put('/:id', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.edit']), async (req, res) => {
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

router.delete('/:id', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.delete']), async (req, res) => {
  try {
    // Delete associated image if exists
    const [vehicles] = await pool.execute('SELECT image_url FROM vehicles WHERE id = ?', [req.params.id]);
    if (vehicles[0]?.image_url?.startsWith('/uploads/')) {
      const imgPath = path.join(__dirname, '..', '..', vehicles[0].image_url);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    
    await pool.execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

module.exports = router;

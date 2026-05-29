const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// ============================================
// MULTER - Upload konfiguracija za slike vozila
// ============================================
const uploadDir = path.join(__dirname, '../../uploads/vehicles');

// Kreiraj direktorij ako ne postoji
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('[Upload] Created directory:', uploadDir);
} else {
  console.log('[Upload] Directory exists:', uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const manufacturer = (req.body.manufacturer || 'vehicle').replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_').substring(0, 40);
    const model = (req.body.model || '').replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_').substring(0, 40);
    const ext = path.extname(file.originalname).toLowerCase();
    const timestamp = Date.now();
    const baseName = model ? `${manufacturer}_${model}` : manufacturer;
    cb(null, `${baseName}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, GIF, WebP images are allowed'));
    }
  }
});

// ============================================
// ROUTES
// ============================================

router.get('/', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT v.*, u.name as assigned_name 
       FROM vehicles v 
       LEFT JOIN users u ON v.assigned_to = u.id`;
    const params = [];
    
    if (status === 'archived') {
      query += ` WHERE v.status = 'archived'`;
    } else if (status === 'active') {
      query += ` WHERE v.status = 'active'`;
    }
    
    query += ` ORDER BY v.created_at DESC`;
    
    const [vehicles] = await pool.execute(query, params);
    res.json(vehicles);
  } catch (error) {
    console.error('Fetch vehicles error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
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

    // Troškovi iz vehicle_expenses (servis, gorivo, registracija...)
    const [expenses] = await pool.execute(
      `SELECT * FROM vehicle_expenses
       WHERE vehicle_id = ?
       ORDER BY expense_date DESC`,
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
    vehicle.expenses = expenses;

    res.json(vehicle);
  } catch (error) {
    console.error('Fetch vehicle detail error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle details' });
  }
});

// ============================================
// UPLOAD SLIKE VOZILA
// ============================================
router.post('/upload-image', authenticate, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    // Provjeri da je file stvarno spremljen na disk
    const filePath = path.join(uploadDir, req.file.filename);
    if (!fs.existsSync(filePath)) {
      console.error('[Upload] File not found on disk:', filePath);
      return res.status(500).json({ error: 'File save failed' });
    }
    
    console.log('[Upload] Success:', req.file.filename, 'Size:', req.file.size, 'Path:', filePath);
    
    const imageUrl = `/uploads/vehicles/${req.file.filename}`;
    res.json({
      success: true,
      image_url: imageUrl,
      file_name: req.file.filename,
      file_size: req.file.size
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// ============================================
// BRISANJE SLIKE VOZILA
// ============================================
// ============================================
// DOHVATI SLIKU (base64) - radi na svim platformama
// ============================================
router.get('/image/:filename', authenticate, async (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.filename);
    
    // Sigurnosna provjera - samo uploads/vehicles/ dozvoljen
    const realUploadDir = fs.realpathSync(uploadDir);
    const realFilePath = fs.realpathSync(filePath);
    if (!realFilePath.startsWith(realUploadDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    
    const base64 = fileBuffer.toString('base64');
    res.json({
      success: true,
      dataUrl: `data:${mimeType};base64,${base64}`,
      filename: req.params.filename
    });
  } catch (error) {
    console.error('[Image] Error:', error);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

router.post('/delete-image', authenticate, async (req, res) => {
  try {
    const { image_path } = req.body;
    if (!image_path) {
      return res.status(400).json({ error: 'No image path provided' });
    }

    // Sigurnosna provjera - samo uploads/vehicles/ dozvoljen
    if (!image_path.startsWith('/uploads/vehicles/')) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    const filePath = path.join(__dirname, '../..', image_path);
    const realUploadDir = fs.realpathSync(uploadDir);
    const realFilePath = fs.existsSync(filePath) ? fs.realpathSync(filePath) : null;

    if (realFilePath && !realFilePath.startsWith(realUploadDir)) {
      return res.status(403).json({ error: 'Path not allowed' });
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: 'Image deleted' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
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
    if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url); }
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
    // Provjeri da li je vozilo zaduženo
    const [vehicle] = await pool.execute('SELECT assigned_to, manufacturer, model, license_plate FROM vehicles WHERE id = ?', [req.params.id]);
    if (vehicle.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    if (vehicle[0].assigned_to) {
      const [user] = await pool.execute('SELECT name FROM users WHERE id = ?', [vehicle[0].assigned_to]);
      return res.status(409).json({
        error: 'Vehicle is currently assigned',
        message: `Vozilo je zaduženo na korisnika: ${user[0]?.name || 'Nepoznati korisnik'}. Razdužite vozilo prije brisanja.`,
        assigned_to: vehicle[0].assigned_to
      });
    }

    // Prvo dohvati vozilo da provjerimo ima li sliku
    if (vehicle[0].image_url) {
      const imagePath = path.join(__dirname, '../..', vehicle[0].image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await pool.execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

// ============================================
// SERVISNA KNJIGA - sve informacije o vozilu
// ============================================
// ============================================
// ARHIVIRAJ / AKTIVIRAJ vozilo
// ============================================
router.put('/:id/archive', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.edit']), async (req, res) => {
  try {
    // Provjeri da li je vozilo zaduženo
    const [vehicle] = await pool.execute('SELECT assigned_to, manufacturer, model, license_plate FROM vehicles WHERE id = ?', [req.params.id]);
    if (vehicle.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    
    if (vehicle[0].assigned_to) {
      const [user] = await pool.execute('SELECT name FROM users WHERE id = ?', [vehicle[0].assigned_to]);
      return res.status(409).json({
        error: 'Vehicle is assigned',
        message: `Vozilo je zaduženo na korisnika: ${user[0]?.name || 'Nepoznati korisnik'}. Razdužite vozilo prije arhiviranja.`
      });
    }
    
    await pool.execute("UPDATE vehicles SET status = 'archived' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Vehicle archived successfully' });
  } catch (error) {
    console.error('Archive vehicle error:', error);
    res.status(500).json({ error: 'Failed to archive vehicle' });
  }
});

router.put('/:id/activate', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.edit']), async (req, res) => {
  try {
    await pool.execute("UPDATE vehicles SET status = 'active' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Vehicle activated successfully' });
  } catch (error) {
    console.error('Activate vehicle error:', error);
    res.status(500).json({ error: 'Failed to activate vehicle' });
  }
});

router.get('/:id/service-book', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    // 1. Podaci o vozilu
    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_user_name
       FROM vehicles v
       LEFT JOIN users u ON v.assigned_to = u.id
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (vehicles.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    const vehicle = vehicles[0];

    // 2. Servisi (najnoviji prvi)
    const [services] = await pool.execute(
      `SELECT s.*, u.name as mechanic_name
       FROM services s
       LEFT JOIN users u ON s.mechanic_id = u.id
       WHERE s.vehicle_id = ? AND s.status = 'completed'
       ORDER BY s.service_date DESC`,
      [req.params.id]
    );

    // Dohvati dijelove za svaki servis
    for (const svc of services) {
      const [parts] = await pool.execute(
        `SELECT sp.*, p.name as part_name, p.part_number
         FROM service_parts sp
         JOIN warehouse p ON sp.part_id = p.id
         WHERE sp.service_id = ?`,
        [svc.id]
      );
      svc.parts = parts;
    }

    // 3. Zaduženja / evidencija vožnji
    const [assignments] = await pool.execute(
      `SELECT va.*, u.name as user_name
       FROM vehicle_assignments va
       LEFT JOIN users u ON va.user_id = u.id
       WHERE va.vehicle_id = ?
       ORDER BY va.assigned_at DESC`,
      [req.params.id]
    );

    // 4. Troškovi
    const [expenses] = await pool.execute(
      `SELECT * FROM vehicle_expenses
       WHERE vehicle_id = ?
       ORDER BY expense_date DESC`,
      [req.params.id]
    );

    // 5. Prihodi (računi)
    const [income] = await pool.execute(
      `SELECT i.* FROM invoices i
       WHERE i.vehicle_id = ? AND i.invoice_type = 'income'
       ORDER BY i.created_at DESC`,
      [req.params.id]
    );

    // 6. Ukupne statistike
    const totalServices = services.length;
    const totalServiceCost = services.reduce((s, v) => s + parseFloat(v.total_cost || 0), 0);
    const totalExpenses = expenses.reduce((s, v) => s + parseFloat(v.amount || 0), 0);
    const totalIncome = income.reduce((s, v) => s + parseFloat(v.amount || 0), 0);

    res.json({
      vehicle,
      services,
      assignments,
      expenses,
      income,
      stats: {
        total_services: totalServices,
        total_service_cost: totalServiceCost,
        total_expenses: totalExpenses,
        total_income: totalIncome,
        total_km: assignments.reduce((s, a) => s + (a.end_mileage && a.start_mileage ? a.end_mileage - a.start_mileage : 0), 0)
      }
    });
  } catch (error) {
    console.error('Service book error:', error);
    res.status(500).json({ error: 'Failed to load service book' });
  }
});

module.exports = router;

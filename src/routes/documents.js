const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// SIGURNO: Whitelist za sortiranje
const ALLOWED_SORT = {
  'title': 'd.title ASC',
  'title_desc': 'd.title DESC',
  'date': 'd.created_at DESC',
  'date_asc': 'd.created_at ASC'
};

router.get('/', authenticate, authorizeEntity('documents'), async (req, res) => {
  try {
    const { search, type, vehicle_id, sort_by } = req.query;
    let query = `SELECT d.*, v.manufacturer, v.model, v.license_plate, u.name as user_name 
                 FROM documents d 
                 LEFT JOIN vehicles v ON d.vehicle_id = v.id 
                 LEFT JOIN users u ON d.user_id = u.id 
                 WHERE 1=1`;
    const params = [];

    if (search) {
      query += ' AND (d.title LIKE ? OR d.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      query += ' AND d.document_type = ?';
      params.push(type);
    }
    if (vehicle_id) {
      query += ' AND d.vehicle_id = ?';
      params.push(vehicle_id);
    }

    // SIGURNO: Koristi whitelist
    const sortClause = ALLOWED_SORT[sort_by] || ALLOWED_SORT['date'];
    query += ' ORDER BY ' + sortClause;

    const [documents] = await pool.execute(query, params);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/', authenticate, authorizeEntity('documents'), authorize(['documents.create']), async (req, res) => {
  try {
    const { title, description, document_type, file_path, file_size, file_type, vehicle_id, user_id } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO documents (title, description, document_type, file_path, file_size, file_type, vehicle_id, user_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, document_type, file_path, file_size, file_type, vehicle_id || null, user_id || null]
    );

    res.status(201).json({ id: result.insertId, file_path, message: 'Document saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save document' });
  }
});

router.delete('/:id', authenticate, authorizeEntity('documents'), authorize(['documents.delete']), async (req, res) => {
  try {
    const [docs] = await pool.execute('SELECT file_path FROM documents WHERE id = ?', [req.params.id]);
    if (docs.length > 0 && docs[0].file_path) {
      const fs = require('fs');
      const fullPath = path.join(__dirname, '../../', docs[0].file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await pool.execute('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;

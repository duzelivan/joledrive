const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Configure multer for file uploads
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Only images and documents are allowed'));
  }
});

// Get all documents
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, type, vehicle_id, sort_by } = req.query;
    let query = 'SELECT d.*, v.manufacturer, v.model FROM documents d LEFT JOIN vehicles v ON d.vehicle_id = v.id WHERE 1=1';
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

    query += ' ORDER BY ' + (sort_by === 'title' ? 'd.title' : 'd.created_at DESC');

    const [documents] = await pool.execute(query, params);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Upload document
router.post('/', authenticate, authorize(['documents.create']), upload.single('file'), async (req, res) => {
  try {
    const { title, description, document_type, vehicle_id, user_id } = req.body;
    const file_path = req.file ? `/uploads/documents/${req.file.filename}` : null;
    const file_size = req.file ? req.file.size : 0;
    const file_type = req.file ? req.file.mimetype : null;

    const [result] = await pool.execute(
      `INSERT INTO documents (title, description, document_type, file_path, file_size, file_type, vehicle_id, user_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, document_type, file_path, file_size, file_type, vehicle_id || null, user_id || null]
    );

    res.status(201).json({ id: result.insertId, file_path, message: 'Document uploaded successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Delete document
router.delete('/:id', authenticate, authorize(['documents.delete']), async (req, res) => {
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

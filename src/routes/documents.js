const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// ============================================
// Dohvati sve dokumente
// ============================================
router.get('/', authenticate, authorizeEntity('documents'), async (req, res) => {
  try {
    const { search, type, sort_by } = req.query;

    let query = `
      SELECT d.*, 
        v.manufacturer, v.model, v.license_plate,
        u.name as user_name
      FROM documents d
      LEFT JOIN vehicles v ON d.vehicle_id = v.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (d.title LIKE ? OR d.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      query += ' AND d.document_type = ?';
      params.push(type);
    }

    query += ' ORDER BY ';
    if (sort_by === 'title') {
      query += 'd.title ASC';
    } else {
      query += 'd.created_at DESC';
    }

    const [documents] = await pool.execute(query, params);
    res.json(documents);
  } catch (error) {
    console.error('Fetch documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ============================================
// Dohvati jedan dokument
// ============================================
router.get('/:id', authenticate, authorizeEntity('documents'), async (req, res) => {
  try {
    const [documents] = await pool.execute(
      `SELECT d.*, 
        v.manufacturer, v.model, v.license_plate,
        u.name as user_name
       FROM documents d
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );

    if (documents.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.json(documents[0]);
  } catch (error) {
    console.error('Fetch document error:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// ============================================
// Kreiraj novi dokument
// ============================================
router.post('/', authenticate, authorizeEntity('documents'), authorize(['documents.create']), async (req, res) => {
  try {
    const { title, description, document_type, vehicle_id, user_id, 
      file_path, file_size, file_type } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO documents (title, description, document_type, vehicle_id, user_id,
        file_path, file_size, file_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, description || null, document_type || 'other', vehicle_id || null, user_id || null,
        file_path || null, file_size || null, file_type || null
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Document created successfully' });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// ============================================
// UREDI DOKUMENT (NOVO)
// ============================================
router.put('/:id', authenticate, authorizeEntity('documents'), authorize(['documents.edit']), async (req, res) => {
  try {
    const { title, description, document_type, vehicle_id, user_id,
      file_path, file_size, file_type } = req.body;

    const updates = [];
    const values = [];

    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (document_type) { updates.push('document_type = ?'); values.push(document_type); }
    if (vehicle_id !== undefined) { updates.push('vehicle_id = ?'); values.push(vehicle_id || null); }
    if (user_id !== undefined) { updates.push('user_id = ?'); values.push(user_id || null); }
    if (file_path) { 
      updates.push('file_path = ?'); values.push(file_path);
      updates.push('file_size = ?'); values.push(file_size);
      updates.push('file_type = ?'); values.push(file_type);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);

    await pool.execute(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`, values);

    res.json({ message: 'Document updated successfully' });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ============================================
// Obriši dokument
// ============================================
router.delete('/:id', authenticate, authorizeEntity('documents'), authorize(['documents.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;

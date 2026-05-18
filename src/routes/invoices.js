const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all invoices with vehicle info
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, vehicle_id, search } = req.query;
    let query = `SELECT i.*, v.manufacturer, v.model, v.license_plate 
                 FROM invoices i 
                 LEFT JOIN vehicles v ON i.vehicle_id = v.id 
                 WHERE 1=1`;
    const params = [];

    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }
    if (vehicle_id) {
      query += ' AND i.vehicle_id = ?';
      params.push(vehicle_id);
    }
    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY i.created_at DESC';

    const [invoices] = await pool.execute(query, params);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Create invoice
router.post('/', authenticate, authorize(['invoices.create']), async (req, res) => {
  try {
    const {
      invoice_number, description, amount, vehicle_id, user_id,
      due_date, recurring_type, recurring_interval,
      file_path, file_size, file_type
    } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, user_id, 
        due_date, status, recurring_type, recurring_interval, file_path, file_size, file_type, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?)`,
      [invoice_number, description, amount, vehicle_id || null, user_id || null,
       due_date, recurring_type || null, recurring_interval || null,
       file_path || null, file_size || null, file_type || null, req.user.id]
    );

    res.status(201).json({ id: result.insertId, message: 'Invoice created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Mark as paid
router.put('/:id/pay', authenticate, authorize(['invoices.edit']), async (req, res) => {
  try {
    await pool.execute(
      'UPDATE invoices SET status = ?, paid_at = NOW() WHERE id = ?',
      ['paid', req.params.id]
    );
    res.json({ message: 'Invoice marked as paid' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Update invoice
router.put('/:id', authenticate, authorize(['invoices.edit']), async (req, res) => {
  try {
    const { invoice_number, description, amount, due_date, status } = req.body;
    await pool.execute(
      'UPDATE invoices SET invoice_number = ?, description = ?, amount = ?, due_date = ?, status = ? WHERE id = ?',
      [invoice_number, description, amount, due_date, status, req.params.id]
    );
    res.json({ message: 'Invoice updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Delete invoice
router.delete('/:id', authenticate, authorize(['invoices.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

module.exports = router;

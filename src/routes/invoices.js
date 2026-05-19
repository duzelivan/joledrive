const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all invoices with vehicle info + payment summary
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, vehicle_id, search } = req.query;
    let query = `SELECT i.*, v.manufacturer, v.model, v.license_plate,
                 COALESCE(SUM(p.amount), 0) as paid_amount,
                 (i.amount - COALESCE(SUM(p.amount), 0)) as remaining_amount
                 FROM invoices i 
                 LEFT JOIN vehicles v ON i.vehicle_id = v.id 
                 LEFT JOIN invoice_payments p ON i.id = p.invoice_id
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

    query += ' GROUP BY i.id ORDER BY i.created_at DESC';

    const [invoices] = await pool.execute(query, params);
    res.json(invoices);
  } catch (error) {
    console.error('Fetch invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get single invoice with payment history
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Invoice + vehicle
    const [invoiceRows] = await pool.execute(
      `SELECT i.*, v.manufacturer, v.model, v.license_plate
       FROM invoices i 
       LEFT JOIN vehicles v ON i.vehicle_id = v.id 
       WHERE i.id = ?`,
      [req.params.id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Payment history
    const [payments] = await pool.execute(
      `SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC`,
      [req.params.id]
    );

    const invoice = invoiceRows[0];
    const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    res.json({
      ...invoice,
      paid_amount: paidAmount,
      remaining_amount: parseFloat(invoice.amount) - paidAmount,
      payments: payments
    });
  } catch (error) {
    console.error('Fetch invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
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
        due_date, status, recurring_type, recurring_interval, file_path, file_size, file_type, 
        created_by, paid_amount, remaining_amount) 
       VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, 0.00, ?)`,
      [invoice_number, description, amount, vehicle_id || null, user_id || null,
       due_date, recurring_type || null, recurring_interval || null,
       file_path || null, file_size || null, file_type || null, req.user.id, amount]
    );

    res.status(201).json({ id: result.insertId, message: 'Invoice created successfully' });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Add partial payment
router.post('/:id/payments', authenticate, authorize(['invoices.edit']), async (req, res) => {
  try {
    const { amount, payment_date, payment_method, notes } = req.body;
    const invoiceId = req.params.id;

    // Dohvati trenutni račun
    const [invoiceRows] = await pool.execute(
      'SELECT * FROM invoices WHERE id = ?', [invoiceId]
    );
    
    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];
    const totalAmount = parseFloat(invoice.amount);
    
    // Dohvati ukupno plaćeno do sada
    const [paymentSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
      [invoiceId]
    );
    const currentlyPaid = parseFloat(paymentSum[0].total_paid);
    const newPaid = currentlyPaid + parseFloat(amount);

    // Validacija
    if (newPaid > totalAmount) {
      return res.status(400).json({ 
        error: `Payment exceeds remaining amount. Remaining: ${(totalAmount - currentlyPaid).toFixed(2)} €` 
      });
    }

    // Zabilježi uplatu
    await pool.execute(
      `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, notes) 
       VALUES (?, ?, ?, ?, ?)`,
      [invoiceId, amount, payment_date || new Date(), payment_method || 'transfer', notes || null]
    );

    // Ažuriraj status računa
    let newStatus = 'partial';
    let remaining = totalAmount - newPaid;
    
    if (remaining <= 0) {
      newStatus = 'paid';
      remaining = 0;
    }

    await pool.execute(
      `UPDATE invoices SET status = ?, paid_amount = ?, remaining_amount = ?, paid_at = ? WHERE id = ?`,
      [newStatus, newPaid, remaining, newStatus === 'paid' ? new Date() : null, invoiceId]
    );

    res.json({ 
      message: newStatus === 'paid' ? 'Invoice fully paid' : 'Partial payment recorded',
      paid_amount: newPaid,
      remaining_amount: remaining,
      status: newStatus
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Mark as fully paid (stara ruta, sada koristi payments)
router.put('/:id/pay', authenticate, authorize(['invoices.edit']), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    
    // Dohvati račun
    const [invoiceRows] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    
    const invoice = invoiceRows[0];
    const totalAmount = parseFloat(invoice.amount);
    
    // Provjeri je li već plaćeno
    const [paymentSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
      [invoiceId]
    );
    const currentlyPaid = parseFloat(paymentSum[0].total_paid);

    // Ako nema uplata, zabilježi punu uplatu
    if (currentlyPaid === 0) {
      await pool.execute(
        `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, notes) 
         VALUES (?, ?, NOW(), 'transfer', 'Full payment')`,
        [invoiceId, totalAmount]
      );
    }

    // Ažuriraj status
    await pool.execute(
      'UPDATE invoices SET status = ?, paid_amount = ?, remaining_amount = 0.00, paid_at = NOW() WHERE id = ?',
      ['paid', totalAmount, invoiceId]
    );

    res.json({ message: 'Invoice marked as fully paid' });
  } catch (error) {
    console.error('Full pay error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Update invoice (osnovni podaci, ne plaćanja)
router.put('/:id', authenticate, authorize(['invoices.edit']), async (req, res) => {
  try {
    const { invoice_number, description, amount, due_date, status } = req.body;
    
    // Ako se mijenja iznos, prilagodi remaining
    const [current] = await pool.execute('SELECT paid_amount FROM invoices WHERE id = ?', [req.params.id]);
    const paid = current[0]?.paid_amount || 0;
    const remaining = parseFloat(amount) - parseFloat(paid);
    
    await pool.execute(
      'UPDATE invoices SET invoice_number = ?, description = ?, amount = ?, due_date = ?, status = ?, remaining_amount = ? WHERE id = ?',
      [invoice_number, description, amount, due_date, status, remaining < 0 ? 0 : remaining, req.params.id]
    );
    res.json({ message: 'Invoice updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Delete invoice
router.delete('/:id', authenticate, authorize(['invoices.delete']), async (req, res) => {
  try {
    // Payments će se obrisati automatski zbog ON DELETE CASCADE
    await pool.execute('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

module.exports = router;

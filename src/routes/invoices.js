const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Helper: izračunaj paid/remaining za jedan ili više računa
async function enrichInvoiceWithPayments(invoice) {
  if (!invoice) return null;
  
  const [payments] = await pool.execute(
    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
    [invoice.id]
  );
  
  const paid = parseFloat(payments[0].total_paid);
  const total = parseFloat(invoice.amount);
  const remaining = total - paid;
  
  // Odredi status na temelju uplata
  let computedStatus = invoice.status;
  if (paid >= total) computedStatus = 'paid';
  else if (paid > 0) computedStatus = 'partial';
  else computedStatus = 'unpaid';
  
  return {
    ...invoice,
    paid_amount: paid,
    remaining_amount: remaining,
    status: computedStatus // override s izračunatim statusom
  };
}

// Get all invoices with vehicle info + payment summary
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, vehicle_id, search } = req.query;
    let query = `SELECT i.*, v.manufacturer, v.model, v.license_plate 
                 FROM invoices i 
                 LEFT JOIN vehicles v ON i.vehicle_id = v.id 
                 WHERE 1=1`;
    const params = [];

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
    
    // Enrich svaki račun s podacima o plaćanju
    const enrichedInvoices = await Promise.all(
      invoices.map(inv => enrichInvoiceWithPayments(inv))
    );
    
    // Filtriraj po statusu ako je zatraženo
    let result = enrichedInvoices;
    if (status) {
      result = result.filter(inv => inv.status === status);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Fetch invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get single invoice with payment history
router.get('/:id', authenticate, async (req, res) => {
  try {
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

    const [payments] = await pool.execute(
      `SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC`,
      [req.params.id]
    );

    const invoice = await enrichInvoiceWithPayments(invoiceRows[0]);
    
    res.json({
      ...invoice,
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
        due_date, status, recurring_type, recurring_interval, file_path, file_size, file_type, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?)`,
      [invoice_number, description, amount, vehicle_id || null, user_id || null,
       due_date, recurring_type || null, recurring_interval || null,
       file_path || null, file_size || null, file_type || null, req.user.id]
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

    // Dohvati račun
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
    if (newPaid >= totalAmount) newStatus = 'paid';
    else if (newPaid <= 0) newStatus = 'unpaid';

    await pool.execute(
      'UPDATE invoices SET status = ? WHERE id = ?',
      [newStatus, invoiceId]
    );

    res.json({ 
      message: newStatus === 'paid' ? 'Invoice fully paid' : 'Partial payment recorded',
      paid_amount: newPaid,
      remaining_amount: totalAmount - newPaid,
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
    
    const [invoiceRows] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    
    const invoice = invoiceRows[0];
    const totalAmount = parseFloat(invoice.amount);
    
    // Dohvati trenutno plaćeno
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
      'UPDATE invoices SET status = ?, paid_at = NOW() WHERE id = ?',
      ['paid', invoiceId]
    );

    res.json({ message: 'Invoice marked as fully paid' });
  } catch (error) {
    console.error('Full pay error:', error);
    res.status(500). { error: 'Failed to update invoice' });
  }
});

// Update invoice (osnovni podaci)
router.put('/:id', authenticate, authorize(['invoices.edit']), async (req, res) => {
  try {
    const { invoice_number, description, amount, due_date, status } = req.body;
    
    await pool.execute(
      'UPDATE invoices SET invoice_number = ?, description = ?, amount = ?, due_date = ?, status = ? WHERE id = ?',
      [invoice_number, description, amount, due_date, status, req.params.id]
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

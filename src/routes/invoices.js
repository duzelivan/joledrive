const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

const DELETE_FILE_URL = 'https://joledrive.com/delete-file.php';
const EMAIL_API_SECRET = process.env.EMAIL_API_SECRET;

async function enrichInvoiceWithPayments(invoice) {
  if (!invoice) return null;
  
  const [payments] = await pool.execute(
    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
    [invoice.id]
  );
  
  const paid = parseFloat(payments[0].total_paid);
  const total = parseFloat(invoice.amount);
  const remaining = total - paid;
  
  let computedStatus = invoice.status;
  if (paid >= total) computedStatus = 'paid';
  else if (paid > 0) computedStatus = 'partial';
  else computedStatus = 'unpaid';
  
  return {
    ...invoice,
    paid_amount: paid,
    remaining_amount: remaining,
    status: computedStatus
  };
}

// ============================================
// GET /api/invoices - POPRAVLJENO: dodan user_name
// ============================================
router.get('/', authenticate, authorizeEntity('invoices'), async (req, res) => {
  try {
    const { status, vehicle_id, search, invoice_type } = req.query;
    let query = `SELECT i.*, v.manufacturer, v.model, v.license_plate, u.name as user_name 
                 FROM invoices i 
                 LEFT JOIN vehicles v ON i.vehicle_id = v.id 
                 LEFT JOIN users u ON i.user_id = u.id 
                 WHERE 1=1`;
    const params = [];

    if (vehicle_id) {
      query += ' AND i.vehicle_id = ?';
      params.push(vehicle_id);
    }
    if (invoice_type) {
      query += ' AND i.invoice_type = ?';
      params.push(invoice_type);
    }
    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY i.created_at DESC';

    const [invoices] = await pool.execute(query, params);
    
    const enrichedInvoices = await Promise.all(
      invoices.map(inv => enrichInvoiceWithPayments(inv))
    );
    
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

// ============================================
// GET /api/invoices/:id - POPRAVLJENO: dodan user_name
// ============================================
router.get('/:id', authenticate, authorizeEntity('invoices'), async (req, res) => {
  try {
    const [invoiceRows] = await pool.execute(
      `SELECT i.*, v.manufacturer, v.model, v.license_plate, u.name as user_name
       FROM invoices i 
       LEFT JOIN vehicles v ON i.vehicle_id = v.id 
       LEFT JOIN users u ON i.user_id = u.id 
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

// ============================================
// POST /api/invoices - POPRAVLJENO: debug logging za user_id
// ============================================
router.post('/', authenticate, authorizeEntity('invoices'), authorize(['invoices.create']), async (req, res) => {
  try {
    const {
      invoice_number, description, amount, vehicle_id, user_id,
      due_date, recurring_type, recurring_interval,
      file_path, file_size, file_type,
      invoice_type = 'income'
    } = req.body;

    // DEBUG: logiraj sto smo primili
    console.log('[POST /api/invoices] Received body:', JSON.stringify(req.body, null, 2));
    console.log('[POST /api/invoices] user_id received:', user_id, '| type:', typeof user_id);
    console.log('[POST /api/invoices] vehicle_id received:', vehicle_id, '| type:', typeof vehicle_id);

    // Osiguraj da su ID-evi brojevi ili null
    const parsedUserId = user_id ? parseInt(user_id, 10) : null;
    const parsedVehicleId = vehicle_id ? parseInt(vehicle_id, 10) : null;
    
    console.log('[POST /api/invoices] parsedUserId:', parsedUserId, '| parsedVehicleId:', parsedVehicleId);

    const [result] = await pool.execute(
      `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, user_id, 
        due_date, status, recurring_type, recurring_interval, file_path, file_size, file_type, 
        created_by, invoice_type) 
       VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_number, description, amount, parsedVehicleId, parsedUserId,
       due_date, recurring_type || null, recurring_interval || null,
       file_path || null, file_size || null, file_type || null, req.user.id, invoice_type]
    );

    console.log('[POST /api/invoices] Invoice created:', result.insertId, 'with user_id:', parsedUserId);

    res.status(201).json({ id: result.insertId, message: 'Invoice created successfully' });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Payments - bez promjena
router.post('/:id/payments', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const { amount, payment_date, payment_method, notes } = req.body;
    const invoiceId = req.params.id;

    const [invoiceRows] = await pool.execute(
      'SELECT * FROM invoices WHERE id = ?', [invoiceId]
    );
    
    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];
    const totalAmount = parseFloat(invoice.amount);
    
    const [paymentSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
      [invoiceId]
    );
    const currentlyPaid = parseFloat(paymentSum[0].total_paid);
    const newPaid = currentlyPaid + parseFloat(amount);

    if (newPaid > totalAmount) {
      return res.status(400).json({ 
        error: `Payment exceeds remaining amount. Remaining: ${(totalAmount - currentlyPaid).toFixed(2)} \u20ac` 
      });
    }

    await pool.execute(
      `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, notes) 
       VALUES (?, ?, ?, ?, ?)`,
      [invoiceId, amount, payment_date || new Date(), payment_method || 'transfer', notes || null]
    );

    let newStatus = 'partial';
    let paidAt = null;
    
    if (newPaid >= totalAmount) {
      newStatus = 'paid';
      paidAt = new Date();
    } else if (newPaid <= 0) {
      newStatus = 'unpaid';
    }

    await pool.execute(
      'UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?',
      [newStatus, paidAt, invoiceId]
    );

    if (newStatus === 'paid' && invoice.vehicle_id) {
      if (invoice.invoice_type === 'expense') {
        await pool.execute(
          'UPDATE vehicles SET total_expenses = total_expenses + ? WHERE id = ?',
          [totalAmount, invoice.vehicle_id]
        );
      } else {
        await pool.execute(
          'UPDATE vehicles SET total_income = total_income + ? WHERE id = ?',
          [totalAmount, invoice.vehicle_id]
        );
      }
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [invoice.vehicle_id]
      );
    }

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

router.put('/:id/pay', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    
    const [invoiceRows] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    
    const invoice = invoiceRows[0];
    const totalAmount = parseFloat(invoice.amount);
    
    const [paymentSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
      [invoiceId]
    );
    const currentlyPaid = parseFloat(paymentSum[0].total_paid);

    if (currentlyPaid === 0) {
      await pool.execute(
        `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, notes) 
         VALUES (?, ?, NOW(), 'transfer', 'Full payment')`,
        [invoiceId, totalAmount]
      );
    }

    await pool.execute(
      'UPDATE invoices SET status = ?, paid_at = NOW() WHERE id = ?',
      ['paid', invoiceId]
    );

    if (invoice.vehicle_id) {
      if (invoice.invoice_type === 'expense') {
        await pool.execute(
          'UPDATE vehicles SET total_expenses = total_expenses + ? WHERE id = ?',
          [totalAmount, invoice.vehicle_id]
        );
      } else {
        await pool.execute(
          'UPDATE vehicles SET total_income = total_income + ? WHERE id = ?',
          [totalAmount, invoice.vehicle_id]
        );
      }
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [invoice.vehicle_id]
      );
    }

    res.json({ message: 'Invoice marked as fully paid' });
  } catch (error) {
    console.error('Full pay error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.put('/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const { invoice_number, description, amount, due_date, status, invoice_type } = req.body;
    
    await pool.execute(
      'UPDATE invoices SET invoice_number = ?, description = ?, amount = ?, due_date = ?, status = ?, invoice_type = ? WHERE id = ?',
      [invoice_number, description, amount, due_date, status, invoice_type, req.params.id]
    );
    res.json({ message: 'Invoice updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE - bez promjena
router.delete('/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.delete']), async (req, res) => {
  try {
    const [invoiceRows] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    
    if (invoiceRows.length > 0 && invoiceRows[0].status === 'paid' && invoiceRows[0].vehicle_id) {
      const amount = parseFloat(invoiceRows[0].amount);
      
      if (invoiceRows[0].invoice_type === 'expense') {
        await pool.execute(
          'UPDATE vehicles SET total_expenses = total_expenses - ? WHERE id = ?',
          [amount, invoiceRows[0].vehicle_id]
        );
      } else {
        await pool.execute(
          'UPDATE vehicles SET total_income = total_income - ? WHERE id = ?',
          [amount, invoiceRows[0].vehicle_id]
        );
      }
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [invoiceRows[0].vehicle_id]
      );
    }

    if (invoiceRows.length > 0 && invoiceRows[0].file_path) {
      try {
        const response = await axios.post(DELETE_FILE_URL, {
          file_path: invoiceRows[0].file_path
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Secret': EMAIL_API_SECRET
          },
          timeout: 10000
        });
        
        console.log('Invoice file deletion response:', response.data);
      } catch (fileError) {
        console.error('Invoice file deletion warning:', fileError.response?.data || fileError.message);
      }
    }

    await pool.execute('DELETE FROM invoice_payments WHERE invoice_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

module.exports = router;

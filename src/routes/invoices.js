const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// ============================================
// Dohvati sve račune
// ============================================
router.get('/', authenticate, authorizeEntity('invoices'), async (req, res) => {
  try {
    const { search, status, invoice_type } = req.query;

    let query = `
      SELECT i.*, 
        v.manufacturer, v.model, v.license_plate,
        COALESCE(SUM(p.amount), 0) as paid_amount,
        (i.amount - COALESCE(SUM(p.amount), 0)) as remaining_amount
      FROM invoices i
      LEFT JOIN vehicles v ON i.vehicle_id = v.id
      LEFT JOIN invoice_payments p ON i.id = p.invoice_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (invoice_type) {
      query += ' AND i.invoice_type = ?';
      params.push(invoice_type);
    }

    query += ' GROUP BY i.id ORDER BY i.created_at DESC';

    const [invoices] = await pool.execute(query, params);

    // Izračunaj status za svaki račun
    const enrichedInvoices = invoices.map(inv => {
      const paid = parseFloat(inv.paid_amount || 0);
      const total = parseFloat(inv.amount);
      let status = 'unpaid';
      if (paid >= total) status = 'paid';
      else if (paid > 0) status = 'partial';
      return { ...inv, status };
    });

    // Filtriraj po statusu nakon izračuna
    let filtered = enrichedInvoices;
    if (status) {
      filtered = enrichedInvoices.filter(inv => inv.status === status);
    }

    res.json(filtered);
  } catch (error) {
    console.error('Fetch invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// ============================================
// Dohvati jedan račun
// ============================================
router.get('/:id', authenticate, authorizeEntity('invoices'), async (req, res) => {
  try {
    const [invoices] = await pool.execute(
      `SELECT i.*, 
        v.manufacturer, v.model, v.license_plate,
        COALESCE(SUM(p.amount), 0) as paid_amount,
        (i.amount - COALESCE(SUM(p.amount), 0)) as remaining_amount
       FROM invoices i
       LEFT JOIN vehicles v ON i.vehicle_id = v.id
       LEFT JOIN invoice_payments p ON i.id = p.invoice_id
       WHERE i.id = ?
       GROUP BY i.id`,
      [req.params.id]
    );

    if (invoices.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = invoices[0];
    const paid = parseFloat(invoice.paid_amount || 0);
    const total = parseFloat(invoice.amount);
    if (paid >= total) invoice.status = 'paid';
    else if (paid > 0) invoice.status = 'partial';
    else invoice.status = 'unpaid';

    // Dohvati uplate za ovaj račun
    const [payments] = await pool.execute(
      'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC',
      [req.params.id]
    );
    invoice.payments = payments;

    res.json(invoice);
  } catch (error) {
    console.error('Fetch invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// ============================================
// Kreiraj novi račun
// ============================================
router.post('/', authenticate, authorizeEntity('invoices'), authorize(['invoices.create']), async (req, res) => {
  try {
    const { invoice_number, description, amount, vehicle_id, due_date,
      recurring_type, recurring_interval, file_path, file_size, file_type,
      invoice_type } = req.body;

    if (!invoice_number || !amount) {
      return res.status(400).json({ error: 'Invoice number and amount are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, due_date,
        recurring_type, recurring_interval, file_path, file_size, file_type,
        invoice_type, created_by, recurring_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice_number, description || null, amount, vehicle_id || null, due_date || null,
        recurring_type || 'none', recurring_interval || 1, file_path || null, file_size || null, file_type || null,
        invoice_type || 'income', req.user.id,
        recurring_type && recurring_type !== 'none' ? 1 : 0
      ]
    );

    // Ako ima ponavljanje, kreiraj invoice_recurrences zapis
    if (recurring_type && recurring_type !== 'none') {
      await pool.execute(
        `INSERT INTO invoice_recurrences 
          (parent_invoice_id, sequence_number, total_occurrences, due_date, description, status, next_date, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId, 
          1, 
          999, 
          due_date || new Date(), 
          description || null, 
          'pending', 
          due_date || new Date(), 
          1
        ]
      );
    }

    // Ako je prihod, povećaj total_income vozila
    if (invoice_type !== 'expense' && vehicle_id) {
      await pool.execute(
        'UPDATE vehicles SET total_income = total_income + ? WHERE id = ?',
        [amount, vehicle_id]
      );
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [vehicle_id]
      );
    }
    // Ako je trošak, povećaj total_expenses
    if (invoice_type === 'expense' && vehicle_id) {
      await pool.execute(
        'UPDATE vehicles SET total_expenses = total_expenses + ? WHERE id = ?',
        [amount, vehicle_id]
      );
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [vehicle_id]
      );
    }

    res.status(201).json({ id: result.insertId, message: 'Invoice created successfully' });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ============================================
// UREDI RAČUN
// ============================================
router.put('/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const { invoice_number, description, amount, vehicle_id, due_date,
      recurring_type, recurring_interval, file_path, file_size, file_type,
      invoice_type } = req.body;

    // Dohvati trenutni račun da znamo staru vrijednost
    const [current] = await pool.execute(
      'SELECT * FROM invoices WHERE id = ?',
      [req.params.id]
    );
    if (current.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const oldInvoice = current[0];

    // Izračunaj razliku u iznosu za ažuriranje vozila
    const oldAmount = parseFloat(oldInvoice.amount || 0);
    const newAmount = parseFloat(amount || oldAmount);
    const amountDiff = newAmount - oldAmount;

    const updates = [];
    const values = [];

    if (invoice_number) { updates.push('invoice_number = ?'); values.push(invoice_number); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (amount) { updates.push('amount = ?'); values.push(amount); }
    if (vehicle_id !== undefined) { updates.push('vehicle_id = ?'); values.push(vehicle_id || null); }
    if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date || null); }
    if (recurring_type !== undefined) { updates.push('recurring_type = ?'); values.push(recurring_type); }
    if (recurring_interval !== undefined) { updates.push('recurring_interval = ?'); values.push(recurring_interval); }
    if (file_path) { 
      updates.push('file_path = ?'); values.push(file_path);
      updates.push('file_size = ?'); values.push(file_size);
      updates.push('file_type = ?'); values.push(file_type);
    }
    if (invoice_type) { updates.push('invoice_type = ?'); values.push(invoice_type); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);

    await pool.execute(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`, values);

    // Ažuriraj financije vozila ako se promijenio iznos
    if (amountDiff !== 0 && oldInvoice.vehicle_id) {
      if (oldInvoice.invoice_type === 'expense') {
        await pool.execute(
          'UPDATE vehicles SET total_expenses = total_expenses + ? WHERE id = ?',
          [amountDiff, oldInvoice.vehicle_id]
        );
      } else {
        await pool.execute(
          'UPDATE vehicles SET total_income = total_income + ? WHERE id = ?',
          [amountDiff, oldInvoice.vehicle_id]
        );
      }
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [oldInvoice.vehicle_id]
      );
    }

    // Ažuriraj recurring ako je potrebno
    if (recurring_type !== undefined) {
      if (recurring_type === 'none') {
        // Obriši recurring zapis
        await pool.execute('DELETE FROM invoice_recurrences WHERE parent_invoice_id = ?', [req.params.id]);
        // Isključi recurring na računu
        await pool.execute('UPDATE invoices SET recurring_active = 0 WHERE id = ?', [req.params.id]);
      } else {
        const [existing] = await pool.execute(
          'SELECT id FROM invoice_recurrences WHERE parent_invoice_id = ?',
          [req.params.id]
        );
        if (existing.length > 0) {
          await pool.execute(
            'UPDATE invoice_recurrences SET next_date = ?, active = 1 WHERE parent_invoice_id = ?',
            [due_date || new Date(), req.params.id]
          );
          await pool.execute(
            'UPDATE invoices SET recurring_active = 1 WHERE id = ?',
            [req.params.id]
          );
        } else {
          await pool.execute(
            `INSERT INTO invoice_recurrences 
              (parent_invoice_id, sequence_number, total_occurrences, due_date, description, status, next_date, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.params.id, 
              1, 
              999, 
              due_date || new Date(), 
              description || null, 
              'pending', 
              due_date || new Date(), 
              1
            ]
          );
          await pool.execute(
            'UPDATE invoices SET recurring_active = 1 WHERE id = ?',
            [req.params.id]
          );
        }
      }
    }

    res.json({ message: 'Invoice updated successfully' });
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// ============================================
// Obriši račun
// ============================================
router.delete('/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.delete']), async (req, res) => {
  try {
    const [invoice] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (invoice.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const inv = invoice[0];

    // Ažuriraj financije vozila prije brisanja
    if (inv.vehicle_id) {
      if (inv.invoice_type === 'expense') {
        await pool.execute(
          'UPDATE vehicles SET total_expenses = total_expenses - ? WHERE id = ?',
          [inv.amount, inv.vehicle_id]
        );
      } else {
        await pool.execute(
          'UPDATE vehicles SET total_income = total_income - ? WHERE id = ?',
          [inv.amount, inv.vehicle_id]
        );
      }
      await pool.execute(
        'UPDATE vehicles SET total_profit = total_income - total_expenses WHERE id = ?',
        [inv.vehicle_id]
      );
    }

    // Obriši povezane uplate i ponavljanja
    await pool.execute('DELETE FROM invoice_payments WHERE invoice_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM invoice_recurrences WHERE parent_invoice_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM invoices WHERE id = ?', [req.params.id]);

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// ============================================
// RECURRING RAČUNI - API
// ============================================

// Dohvati sve recurring račune
router.get('/recurring/list', authenticate, authorizeEntity('invoices'), async (req, res) => {
  try {
    const [recurrences] = await pool.execute(
      `SELECT r.id, r.parent_invoice_id, r.sequence_number, r.total_occurrences, 
              r.due_date, r.status, r.next_date, r.active, r.created_at,
              i.invoice_number, i.description, i.amount, i.vehicle_id, i.invoice_type,
              i.recurring_type, i.recurring_interval,
              v.manufacturer, v.model, v.license_plate,
              u.name as created_by_name
       FROM invoice_recurrences r
       JOIN invoices i ON r.parent_invoice_id = i.id
       LEFT JOIN vehicles v ON i.vehicle_id = v.id
       LEFT JOIN users u ON i.created_by = u.id
       ORDER BY r.next_date ASC`
    );

    // Dohvati broj generiranih računa za svaki recurring
    const enriched = await Promise.all(
      recurrences.map(async (rec) => {
        const [count] = await pool.execute(
          `SELECT COUNT(*) as generated_count 
           FROM invoices 
           WHERE invoice_number LIKE ? AND id != ?`,
          [`${rec.invoice_number}-%`, rec.parent_invoice_id]
        );
        return { ...rec, generated_count: count[0].generated_count };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('Fetch recurring error:', error);
    res.status(500).json({ error: 'Failed to fetch recurring invoices' });
  }
});

// Zaustavi/pokreni recurring račun
router.put('/recurring/:id/toggle', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const [rec] = await pool.execute('SELECT active, parent_invoice_id FROM invoice_recurrences WHERE id = ?', [req.params.id]);
    if (rec.length === 0) return res.status(404).json({ error: 'Not found' });
    
    const newActive = rec[0].active === 0 ? 1 : 0;
    
    await pool.execute('UPDATE invoice_recurrences SET active = ? WHERE id = ?', [newActive, req.params.id]);
    
    // Sinkroniziraj i invoices.recurring_active
    await pool.execute('UPDATE invoices SET recurring_active = ? WHERE id = ?', [newActive, rec[0].parent_invoice_id]);
    
    res.json({ 
      message: newActive === 1 ? 'Recurring activated' : 'Recurring stopped',
      active: newActive 
    });
  } catch (error) {
    console.error('Toggle recurring error:', error);
    res.status(500).json({ error: 'Failed to toggle recurring' });
  }
});

// Obriši recurring račun
router.delete('/recurring/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.delete']), async (req, res) => {
  try {
    // Dohvati parent_invoice_id prije brisanja
    const [rec] = await pool.execute('SELECT parent_invoice_id FROM invoice_recurrences WHERE id = ?', [req.params.id]);
    
    await pool.execute('DELETE FROM invoice_recurrences WHERE id = ?', [req.params.id]);
    
    // Isključi recurring na parent računu
    if (rec.length > 0) {
      await pool.execute(
        'UPDATE invoices SET recurring_type = ?, recurring_active = ? WHERE id = ?',
        ['none', 0, rec[0].parent_invoice_id]
      );
    }
    
    res.json({ message: 'Recurring deleted' });
  } catch (error) {
    console.error('Delete recurring error:', error);
    res.status(500).json({ error: 'Failed to delete recurring' });
  }
});

// ============================================
// Zabilježi uplatu
// ============================================
router.post('/:id/payments', authenticate, authorizeEntity('invoices'), async (req, res) => {
  try {
    const { amount, payment_date, payment_method, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const [invoice] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (invoice.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const inv = invoice[0];
    const [paymentsSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
      [req.params.id]
    );
    const totalPaid = parseFloat(paymentsSum[0].total_paid);
    const remaining = parseFloat(inv.amount) - totalPaid;

    if (parseFloat(amount) > remaining) {
      return res.status(400).json({ error: `Payment exceeds remaining amount. Remaining: ${remaining.toFixed(2)}` });
    }

    await pool.execute(
      `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, amount, payment_date || new Date(), payment_method || 'transfer', notes || null, req.user.id]
    );

    res.json({ message: 'Payment recorded successfully' });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

module.exports = router;

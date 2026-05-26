const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/recurring/invoices
router.get('/invoices', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT i.*, 
        COUNT(ir.id) as total_generated,
        SUM(CASE WHEN ir.status = 'pending' THEN 1 ELSE 0 END) as pending_count
       FROM invoices i
       LEFT JOIN invoice_recurrences ir ON i.id = ir.parent_invoice_id
       WHERE i.recurring_type != 'none'
       GROUP BY i.id
       ORDER BY i.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Recurring invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// POST /api/recurring/generate/:invoiceId
router.post('/generate/:invoiceId', authenticate, async (req, res) => {
  try {
    const generated = await generateRecurringInvoices(req.params.invoiceId);
    res.json({ success: true, message: `Generirano ${generated} računa`, generated });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/recurring/cancel/:invoiceId
router.put('/cancel/:invoiceId', authenticate, async (req, res) => {
  try {
    await pool.execute('UPDATE invoices SET recurring_active = 0 WHERE id = ?', [req.params.invoiceId]);
    await pool.execute(
      `UPDATE invoice_recurrences SET status = 'cancelled' 
       WHERE parent_invoice_id = ? AND status = 'pending'`, [req.params.invoiceId]
    );
    res.json({ success: true, message: 'Ponavljanje prekinuto' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel' });
  }
});

// GET /api/recurring/details/:invoiceId
router.get('/details/:invoiceId', authenticate, async (req, res) => {
  try {
    const [[parent]] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [req.params.invoiceId]);
    if (!parent) return res.status(404).json({ error: 'Račun nije pronađen' });
    
    const [recurrences] = await pool.execute(
      `SELECT ir.*, i.invoice_number as generated_invoice_number, i.amount as generated_amount
       FROM invoice_recurrences ir
       LEFT JOIN invoices i ON ir.generated_invoice_id = i.id
       WHERE ir.parent_invoice_id = ?
       ORDER BY ir.sequence_number ASC`, [req.params.invoiceId]
    );
    
    res.json({ parent, recurrences });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch details' });
  }
});

// Glavna funkcija za generiranje
async function generateRecurringInvoices(parentInvoiceId = null) {
  const connection = await pool.getConnection();
  let generatedCount = 0;
  
  try {
    await connection.beginTransaction();
    
    let query = `SELECT * FROM invoices WHERE recurring_type != 'none' AND recurring_active = 1 AND recurring_interval > 0`;
    let params = [];
    if (parentInvoiceId) { query += ' AND id = ?'; params.push(parentInvoiceId); }
    
    const [invoices] = await connection.execute(query, params);
    
    for (const invoice of invoices) {
      // Kreiraj raspored ako ne postoji
      const [existing] = await connection.execute(
        `SELECT * FROM invoice_recurrences WHERE parent_invoice_id = ? ORDER BY sequence_number ASC`,
        [invoice.id]
      );
      
      if (existing.length === 0) {
        await createRecurrenceScheduleFn(connection, invoice);
      }
      
      // Generiraj one koji su došli na red
      const [pending] = await connection.execute(
        `SELECT * FROM invoice_recurrences 
         WHERE parent_invoice_id = ? AND status = 'pending' AND due_date <= CURDATE()`,
        [invoice.id]
      );
      
      for (const rec of pending) {
        const description = rec.description || `Automatsko terećenje ${rec.sequence_number}/${rec.total_occurrences}`;
        
        const [result] = await connection.execute(
          `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, due_date, invoice_type, status, parent_recurring_id)
           VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
          [
            `${invoice.invoice_number}-${rec.sequence_number}`,
            description,
            invoice.amount,
            invoice.vehicle_id,
            rec.due_date,
            invoice.invoice_type,
            invoice.id
          ]
        );
        
        await connection.execute(
          `UPDATE invoice_recurrences SET status = 'generated', generated_invoice_id = ?, generated_at = NOW() WHERE id = ?`,
          [result.insertId, rec.id]
        );
        
        generatedCount++;
      }
    }
    
    await connection.commit();
    if (generatedCount > 0) console.log(`[RECURRING] Generirano ${generatedCount} računa`);
    return generatedCount;
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Kreiranje rasporeda
async function createRecurrenceScheduleFn(connection, invoice) {
  const total = parseInt(invoice.recurring_interval);
  const start = new Date(invoice.due_date);
  const days = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }[invoice.recurring_type] || 7;
  
  for (let i = 1; i <= total; i++) {
    const due = new Date(start);
    due.setDate(due.getDate() + (days * i));
    
    const desc = invoice.description 
      ? `${invoice.description} - Automatsko terećenje ${i}/${total}`
      : `Automatsko terećenje ${i}/${total}`;
    
    await connection.execute(
      `INSERT IGNORE INTO invoice_recurrences (parent_invoice_id, sequence_number, total_occurrences, due_date, description, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [invoice.id, i, total, due.toISOString().split('T')[0], desc]
    );
  }
  
  console.log(`[RECURRING] Raspored: ${total} ponavljanja za račun #${invoice.id}`);
}

// Cron - svaki dan u 7:00
const cron = require('node-cron');
cron.schedule('0 7 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Ponavljajući računi...`);
  try {
    const count = await generateRecurringInvoices();
    console.log(`[${new Date().toISOString()}] Generirano: ${count}`);
  } catch (err) {
    console.error('[RECURRING CRON]', err.message);
  }
}, { timezone: 'Europe/Zagreb' });

console.log('[RECURRING] Cron: Svaki dan u 7:00');

module.exports = { router, generateRecurringInvoices };

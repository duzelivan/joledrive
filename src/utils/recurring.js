const pool = require('../config/database');

// ============================================
// GENERIRAJ PONAVLJAJUĆE RAČUNE
// Pokreće se svaki dan u 01:00
// Generira račune za sve pending zapise čiji je due_date prošao
// ============================================
async function generateRecurringInvoices() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Dohvati SVE pending zapise čiji je due_date prošao
    const [pending] = await connection.execute(
      `SELECT r.id, r.parent_invoice_id, r.due_date, r.sequence_number,
              i.invoice_number, i.description, i.amount, i.vehicle_id, i.invoice_type,
              i.file_path, i.file_size, i.file_type, i.created_by
       FROM invoice_recurrences r
       JOIN invoices i ON r.parent_invoice_id = i.id
       WHERE r.due_date <= CURDATE() AND r.active = 1 AND r.status = 'pending'
       ORDER BY r.sequence_number ASC`
    );

    if (pending.length === 0) return;

    let generated = 0;

    for (const rec of pending) {
      const today = new Date();
      const dateSuffix = today.toISOString().split('T')[0].replace(/-/g, '');
      const newInvoiceNumber = `${rec.invoice_number}-${dateSuffix}-${rec.sequence_number}`;

      // Provjeri da račun s tim brojem već ne postoji
      const [existing] = await connection.execute(
        'SELECT id FROM invoices WHERE invoice_number = ?',
        [newInvoiceNumber]
      );
      if (existing.length > 0) {
        // Već postoji — označi kao generirano bez ponovnog kreiranja
        await connection.execute(
          'UPDATE invoice_recurrences SET status = ?, generated_invoice_id = ? WHERE id = ?',
          ['generated', existing[0].id, rec.id]
        );
        continue;
      }

      // Kreiraj novi račun
      const [result] = await connection.execute(
        `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, due_date,
          invoice_type, file_path, file_size, file_type, created_by, recurring_type, recurring_interval)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newInvoiceNumber, rec.description, rec.amount, rec.vehicle_id, rec.due_date,
          rec.invoice_type || 'income', rec.file_path || null, rec.file_size || null,
          rec.file_type || null, rec.created_by, 'none', 1
        ]
      );

      // Označi zapis kao generiran
      await connection.execute(
        'UPDATE invoice_recurrences SET status = ?, generated_invoice_id = ? WHERE id = ?',
        ['generated', result.insertId, rec.id]
      );

      generated++;
    }

    await connection.commit();
    console.log(`[${new Date().toISOString()}] Generirano ${generated} ponavljajućih računa`);

  } catch (error) {
    await connection.rollback();
    console.error('Recurring invoice generation error:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { generateRecurringInvoices };

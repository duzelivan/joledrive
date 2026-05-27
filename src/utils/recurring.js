const pool = require('../config/database');

// ============================================
// GENERIRAJ PONAVLJAJUĆE RAČUNE
// Pokreće se svaki dan u 01:00
// ============================================
async function generateRecurringInvoices() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Dohvati sve aktivne recurring zapise čiji je next_date prošao
    const [recurrences] = await connection.execute(
      `SELECT r.id, r.parent_invoice_id, r.next_date,
              i.invoice_number, i.description, i.amount, i.vehicle_id, i.invoice_type, 
              i.file_path, i.file_size, i.file_type, i.created_by,
              i.recurring_type, i.recurring_interval
       FROM invoice_recurrences r
       JOIN invoices i ON r.parent_invoice_id = i.id
       WHERE r.next_date <= CURDATE() AND r.active = 1`
    );

    if (recurrences.length === 0) {
      connection.release();
      console.log(`[${new Date().toISOString()}] Nema ponavljajućih računa za generiranje`);
      return;
    }

    let generated = 0;

    for (const rec of recurrences) {
      const today = new Date();
      const dateSuffix = today.toISOString().split('T')[0].replace(/-/g, '');
      const newInvoiceNumber = `${rec.invoice_number}-${dateSuffix}`;

      // Provjeri da račun s tim brojem već ne postoji (za slučaj duplog pokretanja)
      const [existing] = await connection.execute(
        'SELECT id FROM invoices WHERE invoice_number = ?',
        [newInvoiceNumber]
      );
      if (existing.length > 0) {
        console.log(`Račun ${newInvoiceNumber} već postoji, preskačem`);
        continue;
      }

      // Kreiraj novi račun
      await connection.execute(
        `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, due_date, 
          invoice_type, file_path, file_size, file_type, created_by, recurring_type, recurring_interval)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newInvoiceNumber,
          rec.description,
          rec.amount,
          rec.vehicle_id,
          today,
          rec.invoice_type || 'income',
          rec.file_path || null,
          rec.file_size || null,
          rec.file_type || null,
          rec.created_by,
          'none',  // Generirani račun nema vlastiti recurring
          1
        ]
      );

      // Ažuriraj next_date prema intervalu
      let nextDate = new Date(rec.next_date);
      const interval = parseInt(rec.recurring_interval) || 1;
      const recurringType = rec.recurring_type || 'monthly';
      
      switch (recurringType) {
        case 'daily':
          nextDate.setDate(nextDate.getDate() + interval);
          break;
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + (interval * 7));
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + interval);
          break;
        case 'yearly':
          nextDate.setFullYear(nextDate.getFullYear() + interval);
          break;
      }

      // Ako je server bio down, preskoči prošle datume
      while (nextDate <= today) {
        switch (recurringType) {
          case 'daily':
            nextDate.setDate(nextDate.getDate() + interval);
            break;
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + (interval * 7));
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + interval);
            break;
          case 'yearly':
            nextDate.setFullYear(nextDate.getFullYear() + interval);
            break;
        }
      }

      await connection.execute(
        'UPDATE invoice_recurrences SET next_date = ? WHERE id = ?',
        [nextDate.toISOString().split('T')[0], rec.id]
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

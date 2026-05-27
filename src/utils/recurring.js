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
      `SELECT r.*, i.invoice_number, i.description, i.amount, i.vehicle_id, i.invoice_type, i.file_path, i.file_size, i.file_type
       FROM invoice_recurrences r
       JOIN invoices i ON r.invoice_id = i.id
       WHERE r.next_date <= CURDATE() AND (r.active IS NULL OR r.active = 1)`
    );

    if (recurrences.length === 0) {
      connection.release();
      return;
    }

    for (const rec of recurrences) {
      // Generiraj broj računa s datumom
      const today = new Date();
      const dateSuffix = today.toISOString().split('T')[0].replace(/-/g, '');
      const newInvoiceNumber = `${rec.invoice_number}-${dateSuffix}`;

      // Kreiraj novi račun
      const [result] = await connection.execute(
        `INSERT INTO invoices (invoice_number, description, amount, vehicle_id, due_date, invoice_type, file_path, file_size, file_type, created_by, recurring_type, recurring_interval)
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
          rec.recurring_type,
          rec.recurring_interval
        ]
      );

      // Ažuriraj next_date
      let nextDate = new Date(rec.next_date);
      const interval = parseInt(rec.recurring_interval) || 1;
      switch (rec.recurring_type) {
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

      // Ako je next_date prošao više od jednom (npr. servis je bio down), 
      // nastavi dodavati dok ne dođemo do budućnosti
      while (nextDate <= today) {
        switch (rec.recurring_type) {
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
    }

    await connection.commit();
    console.log(`[${new Date().toISOString()}] Generirano ${recurrences.length} ponavljajućih računa`);
  } catch (error) {
    await connection.rollback();
    console.error('Recurring invoice generation error:', error);
  } finally {
    connection.release();
  }
}

module.exports = { generateRecurringInvoices };

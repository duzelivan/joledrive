const express = require('express');
const pool = require('../config/database');
const { sendEmail } = require('../utils/email');
const { authenticate, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// POPRAVLJENO: Koristi company_settings umjesto settings tablice
async function getNotificationEmails() {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_value FROM company_settings WHERE setting_key = ?',
      ['notification_emails']
    );
    if (rows.length === 0 || !rows[0].setting_value) return [];
    const val = rows[0].setting_value;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Nije JSON, tretiraj kao CSV
    }
    return val.split(',').map(e => e.trim()).filter(e => e);
  } catch (error) {
    console.error('[getNotificationEmails] Error:', error.message);
    return [];
  }
}

router.post('/send-reminders', authenticate, authorizeEntity('settings'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [vehicles] = await pool.execute(`
      SELECT v.*, u.name as assigned_name
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_to = u.id
      WHERE (v.registration_date <= ? AND v.registration_date > ?)
         OR (v.yellow_card_date <= ? AND v.yellow_card_date > ?)
         OR (v.pp_apparatus_date <= ? AND v.pp_apparatus_date > ?)
         OR v.registration_date <= ?
         OR v.yellow_card_date <= ?
         OR v.pp_apparatus_date <= ?
    `, [
      sevenDaysLater, today,
      sevenDaysLater, today,
      sevenDaysLater, today,
      today, today, today
    ]);

    const notificationEmails = await getNotificationEmails();
    if (notificationEmails.length === 0) {
      return res.status(400).json({ error: 'No notification emails configured' });
    }

    let sent = 0;
    const errors = [];

    for (const vehicle of vehicles) {
      let alerts = [];
      const regDate = new Date(vehicle.registration_date);
      const yellowDate = new Date(vehicle.yellow_card_date);
      const ppDate = new Date(vehicle.pp_apparatus_date);
      const now = new Date();

      if (regDate <= now) alerts.push(`Registracija ISTEKLA (${vehicle.registration_date})`);
      else if (regDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) alerts.push(`Registracija istice za ${Math.ceil((regDate - now) / (1000 * 60 * 60 * 24))} dana`);

      if (yellowDate <= now) alerts.push(`Zuti karton ISTEKAO (${vehicle.yellow_card_date})`);
      else if (yellowDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) alerts.push(`Zuti karton istice za ${Math.ceil((yellowDate - now) / (1000 * 60 * 60 * 24))} dana`);

      if (ppDate <= now) alerts.push(`PP aparat ISTEKAO (${vehicle.pp_apparatus_date})`);
      else if (ppDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) alerts.push(`PP aparat istice za ${Math.ceil((ppDate - now) / (1000 * 60 * 60 * 24))} dana`);

      if (alerts.length === 0) continue;

      const result = await sendEmail(
        notificationEmails,
        `JoleDrive - Obavijest za ${vehicle.manufacturer} ${vehicle.model}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">JoleDrive Obavijest</h2>
            <p>Postovani,</p>
            <p>Sljedece stavke zahtijevaju paznju za vozilo:</p>
            
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">
                ${vehicle.manufacturer} ${vehicle.model}
                <span style="color: #6b7280; font-size: 14px;">(${vehicle.license_plate || '---'})</span>
              </h3>
              ${vehicle.assigned_name ? `<p><strong>Zaduzio:</strong> ${vehicle.assigned_name}</p>` : ''}
              <ul style="color: #dc2626;">
                ${alerts.map(a => `<li>${a}</li>`).join('')}
              </ul>
            </div>
            
            <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
              JoleDrive d.o.o - Evidencija vozila<br>
              Ova obavijest je automatski generirana.
            </p>
          </div>
        `
      );

      if (result.success) sent++;
      else errors.push(result.error);
    }

    res.json({ 
      message: `Poslano ${sent} obavijesti`,
      errors: errors.length > 0 ? errors : undefined,
      vehiclesChecked: vehicles.length
    });

  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

router.post('/daily-check', async (req, res) => {
  try {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await fetch('http://localhost:5000/api/notifications/send-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await result.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

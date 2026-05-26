const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const pool = require('./config/database');
require('dotenv').config();

const app = express();

// ⚠️ KLJUČNO: Trust proxy PRIJE helmet i rateLimit
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['https://joledrive.com', 'https://www.joledrive.com', 'http://localhost:3000', 'http://localhost:4173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/services', require('./routes/services'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/warehouse', require('./routes/warehouse'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/vehicle-assignments', require('./routes/vehicleAssignments'));
app.use('/api/share', require('./routes/share'));

// ============================================
// CRON - Automatske dnevne obavijesti
// ============================================
const { sendEmail } = require('./utils/email');

async function getNotificationEmails() {
  const [rows] = await pool.execute(
    'SELECT setting_value FROM settings WHERE setting_key = ?',
    ['notification_emails']
  );
  if (rows.length === 0) return [];
  return rows[0].setting_value.split(',').map(e => e.trim()).filter(e => e);
}

async function sendDailyNotifications() {
  try {
    console.log('[' + new Date().toISOString() + '] Pokrećem dnevne obavijesti...');
    
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_name
       FROM vehicles v
       LEFT JOIN users u ON v.assigned_to = u.id
       WHERE registration_date <= ? OR yellow_card_date <= ? OR pp_apparatus_date <= ?`,
      [thirtyDaysLater, thirtyDaysLater, thirtyDaysLater]
    );

    const notificationEmails = await getNotificationEmails();
    if (notificationEmails.length === 0) {
      console.log('Nema konfiguriranih emailova za obavijesti');
      return;
    }

    let sent = 0;
    let skipped = 0;

    for (const vehicle of vehicles) {
      const [existing] = await pool.execute(
        `SELECT id FROM notification_logs WHERE vehicle_id = ? AND DATE(sent_at) = CURDATE()`,
        [vehicle.id]
      );
      
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      let alerts = [];
      const regDate = new Date(vehicle.registration_date);
      const yellowDate = new Date(vehicle.yellow_card_date);
      const ppDate = new Date(vehicle.pp_apparatus_date);
      const now = new Date();

      if (regDate <= now) alerts.push(`Registracija ISTEKLA (${vehicle.registration_date})`);
      else if (regDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
        const days = Math.ceil((regDate - now) / (1000 * 60 * 60 * 24));
        alerts.push(`Registracija ističe za ${days} dana`);
      }

      if (yellowDate <= now) alerts.push(`Žuti karton ISTEKAO (${vehicle.yellow_card_date})`);
      else if (yellowDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
        const days = Math.ceil((yellowDate - now) / (1000 * 60 * 60 * 24));
        alerts.push(`Žuti karton ističe za ${days} dana`);
      }

      if (ppDate <= now) alerts.push(`PP aparat ISTEKAO (${vehicle.pp_apparatus_date})`);
      else if (ppDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
        const days = Math.ceil((ppDate - now) / (1000 * 60 * 60 * 24));
        alerts.push(`PP aparat ističe za ${days} dana`);
      }

      if (alerts.length === 0) continue;

      const result = await sendEmail(
        notificationEmails,
        `JoleDrive - Obavijest za ${vehicle.manufacturer} ${vehicle.model}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">🔔 JoleDrive Obavijest</h2>
            <p>Poštovani,</p>
            <p>Sljedeće stavke zahtijevaju pažnju za vozilo:</p>
            
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">
                ${vehicle.manufacturer} ${vehicle.model}
                <span style="color: #6b7280; font-size: 14px;">(${vehicle.license_plate || '---'})</span>
              </h3>
              ${vehicle.assigned_name ? `<p><strong>Zadužio:</strong> ${vehicle.assigned_name}</p>` : ''}
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

      if (result.success) {
        sent++;
        await pool.execute(
          'INSERT INTO notification_logs (vehicle_id, sent_at, alerts) VALUES (?, NOW(), ?)',
          [vehicle.id, JSON.stringify(alerts)]
        );
      }
    }

    console.log(`[${new Date().toISOString()}] Završeno: ${sent} poslano, ${skipped} preskočeno`);

  } catch (error) {
    console.error('Greška u dnevnim obavijestima:', error);
  }
}

// TEST ENDPOINT - ručno pokreni obavijesti
app.get('/test-notifications', async (req, res) => {
  try {
    console.log('Test notifications triggered manually');
    await sendDailyNotifications();
    res.json({ success: true, message: 'Notifications sent - check logs' });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pokreni svakog dana u 9:00
cron.schedule('0 9 * * *', sendDailyNotifications, {
  timezone: 'Europe/Zagreb'
});

console.log('Cron postavljen: Svakog dana u 9:00 šalje obavijesti');

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`JoleDrive API running on port ${PORT}`);
});

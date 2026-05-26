const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// ============================================
// HELPERS
// ============================================
const isAdmin = (req) => req.user?.role === 'admin';
const canEdit = (req) => isAdmin(req) || req.user?.permissions?.['settings.edit'] === true;

// ============================================
// GET /api/settings/notification-emails
// ============================================
router.get('/notification-emails', authenticate, async (req, res) => {
  try {
    let emails = [];
    let source = 'none';

    // Pokušaj 1: Zasebna tablica notification_emails (stari backend)
    try {
      const [rows] = await pool.execute('SELECT email FROM notification_emails ORDER BY id');
      if (rows.length > 0) {
        emails = rows.map(r => r.email);
        source = 'notification_emails table';
      }
    } catch (e) {
      // Tablica ne postoji — ignoriraj
    }

    // Pokušaj 2: company_settings (novi backend)
    if (emails.length === 0) {
      try {
        const [rows] = await pool.execute(
          'SELECT setting_value FROM company_settings WHERE setting_key = ?',
          ['notification_emails']
        );
        if (rows[0]?.setting_value) {
          try {
            const parsed = JSON.parse(rows[0].setting_value);
            if (Array.isArray(parsed)) {
              emails = parsed;
              source = 'company_settings JSON';
            }
          } catch (e) {
            // Nije validan JSON — možda je plain string
            const val = rows[0].setting_value;
            if (val.includes('@')) {
              emails = [val];
              source = 'company_settings string';
            }
          }
        }
      } catch (e) {
        // Ignoriraj
      }
    }

    console.log(`[EMAILS] GET: ${emails.length} emailova iz ${source}`);
    res.json({ emails });
  } catch (error) {
    console.error('Fetch emails error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// ============================================
// POST /api/settings/notification-emails
// ============================================
router.post('/notification-emails', authenticate, async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission' });
    
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    let emails = [];
    let useTable = false;

    // Pokušaj 1: Zasebna tablica
    try {
      const [existing] = await pool.execute('SELECT email FROM notification_emails');
      emails = existing.map(r => r.email);
      useTable = true;
    } catch (e) {
      // Tablica ne postoji
    }

    if (emails.includes(email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    if (useTable) {
      // Spremi u tablicu
      await pool.execute('INSERT INTO notification_emails (email) VALUES (?)', [email]);
      emails.push(email);
      console.log(`[EMAILS] POST: dodan u tablicu: ${email}`);
    } else {
      // Spremi u company_settings
      const [rows] = await pool.execute(
        'SELECT setting_value FROM company_settings WHERE setting_key = ?',
        ['notification_emails']
      );
      emails = rows[0]?.setting_value ? JSON.parse(rows[0].setting_value) : [];
      
      if (emails.includes(email)) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      
      emails.push(email);
      
      await pool.execute(
        `INSERT INTO company_settings (setting_key, setting_value) 
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        ['notification_emails', JSON.stringify(emails)]
      );
      console.log(`[EMAILS] POST: dodan u company_settings: ${email}`);
    }
    
    res.json({ emails });
  } catch (error) {
    console.error('Add email error:', error);
    res.status(500).json({ error: 'Failed to add email' });
  }
});

// ============================================
// DELETE /api/settings/notification-emails/:email
// ============================================
router.delete('/notification-emails/:email', authenticate, async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission' });
    
    const email = decodeURIComponent(req.params.email);
    let emails = [];
    let useTable = false;

    // Pokušaj 1: Zasebna tablica
    try {
      await pool.execute('DELETE FROM notification_emails WHERE email = ?', [email]);
      const [rows] = await pool.execute('SELECT email FROM notification_emails');
      emails = rows.map(r => r.email);
      useTable = true;
      console.log(`[EMAILS] DELETE: obrisan iz tablice: ${email}`);
    } catch (e) {
      // Tablica ne postoji
    }

    if (!useTable) {
      // Pokušaj 2: company_settings
      const [rows] = await pool.execute(
        'SELECT setting_value FROM company_settings WHERE setting_key = ?',
        ['notification_emails']
      );
      emails = rows[0]?.setting_value ? JSON.parse(rows[0].setting_value) : [];
      emails = emails.filter(e => e !== email);
      
      await pool.execute(
        `INSERT INTO company_settings (setting_key, setting_value) 
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        ['notification_emails', JSON.stringify(emails)]
      );
      console.log(`[EMAILS] DELETE: obrisan iz company_settings: ${email}`);
    }
    
    res.json({ emails });
  } catch (error) {
    console.error('Delete email error:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ============================================
// GET /api/settings/company - Podaci tvrtke
// ============================================
router.get('/company', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_key, setting_value FROM company_settings WHERE setting_key LIKE "company_%"'
    );
    
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value || '';
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Company settings error:', error);
    res.status(500).json({ error: 'Failed to fetch company settings' });
  }
});

// ============================================
// PUT /api/settings/company - Spremi podatke tvrtke
// ============================================
router.put('/company', authenticate, async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission' });
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const companyKeys = Object.keys(req.body).filter(k => k.startsWith('company_'));
    
    for (const key of companyKeys) {
      await connection.execute(
        `INSERT INTO company_settings (setting_key, setting_value, updated_by) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         setting_value = VALUES(setting_value), 
         updated_by = VALUES(updated_by), 
         updated_at = CURRENT_TIMESTAMP`,
        [key, req.body[key], req.user.id]
      );
    }
    
    await connection.commit();
    connection.release();
    res.json({ success: true, message: 'Postavke tvrtke spremljene' });
  } catch (error) {
    console.error('Save company error:', error);
    res.status(500).json({ error: 'Failed to save company settings' });
  }
});

// ============================================
// GET /api/settings/service-intervals
// ============================================
router.get('/service-intervals', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_key, setting_value FROM company_settings WHERE setting_key LIKE "%_interval" OR setting_key LIKE "%_warning_" OR setting_key LIKE "%_days"'
    );
    
    const intervals = {};
    rows.forEach(row => {
      const isNumeric = !isNaN(parseInt(row.setting_value));
      intervals[row.setting_key] = isNumeric ? parseInt(row.setting_value) : (row.setting_value || '');
    });
    
    res.json(intervals);
  } catch (error) {
    console.error('Service intervals error:', error);
    res.status(500).json({ error: 'Failed to fetch service intervals' });
  }
});

// ============================================
// PUT /api/settings/service-intervals
// ============================================
router.put('/service-intervals', authenticate, async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission' });
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const intervalKeys = [
      'service_km_interval', 'service_days_interval', 'service_warning_km',
      'service_warning_days', 'registration_warning_days', 'yellow_card_warning_days',
      'pp_device_warning_days'
    ];
    
    for (const key of intervalKeys) {
      if (req.body[key] !== undefined) {
        await connection.execute(
          `INSERT INTO company_settings (setting_key, setting_value, updated_by)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          [key, String(req.body[key]), req.user.id]
        );
      }
    }
    
    await connection.commit();
    connection.release();
    res.json({ success: true, message: 'Servisni intervali spremljeni' });
  } catch (error) {
    console.error('Save intervals error:', error);
    res.status(500).json({ error: 'Failed to save service intervals' });
  }
});

// ============================================
// GET /api/settings/system - Sistemske info
// ============================================
router.get('/system', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
    
    const [[vehicleCount]] = await pool.execute('SELECT COUNT(*) as count FROM vehicles');
    const [[userCount]] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [[invoiceCount]] = await pool.execute('SELECT COUNT(*) as count FROM invoices');
    const [[totalFileSize]] = await pool.execute(
      'SELECT SUM(file_size) as total FROM invoices WHERE file_size IS NOT NULL'
    );
    const [[versionRow]] = await pool.execute(
      'SELECT setting_value FROM company_settings WHERE setting_key = "app_version"'
    );
    
    res.json({
      version: versionRow?.setting_value || '1.0.0',
      stats: {
        vehicles: vehicleCount.count,
        users: userCount.count,
        invoices: invoiceCount.count,
        totalStorageBytes: totalFileSize.total || 0
      },
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({ error: 'Failed to fetch system info' });
  }
});

// ============================================
// POST /api/settings/clear-cache
// ============================================
router.post('/clear-cache', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
    res.json({ success: true, message: 'Cache ociscen' });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;

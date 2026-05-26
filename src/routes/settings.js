const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// ============================================
// GET /api/settings/company - Dohvati sve postavke tvrtke
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
    console.error('Company settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch company settings' });
  }
});

// ============================================
// PUT /api/settings/company - Spremi sve postavke tvrtke
// ============================================
router.put('/company', authenticate, authorize('settings.edit'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
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
    res.json({ success: true, message: 'Postavke tvrtke spremljene' });
  } catch (error) {
    await connection.rollback();
    console.error('Company settings save error:', error);
    res.status(500).json({ error: 'Failed to save company settings' });
  } finally {
    connection.release();
  }
});

// ============================================
// GET /api/settings/service-intervals - Dohvati servisne intervale
// ============================================
router.get('/service-intervals', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_key, setting_value FROM company_settings WHERE setting_key LIKE "%_interval" OR setting_key LIKE "%_warning_%" OR setting_key LIKE "%_days"'
    );
    
    const intervals = {};
    rows.forEach(row => {
      const isNumeric = !isNaN(parseInt(row.setting_value));
      intervals[row.setting_key] = isNumeric ? parseInt(row.setting_value) : (row.setting_value || '');
    });
    
    res.json(intervals);
  } catch (error) {
    console.error('Service intervals fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch service intervals' });
  }
});

// ============================================
// PUT /api/settings/service-intervals - Spremi servisne intervale
// ============================================
router.put('/service-intervals', authenticate, authorize('settings.edit'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
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
    res.json({ success: true, message: 'Servisni intervali spremljeni' });
  } catch (error) {
    await connection.rollback();
    console.error('Service intervals save error:', error);
    res.status(500).json({ error: 'Failed to save service intervals' });
  } finally {
    connection.release();
  }
});

// ============================================
// GET /api/settings/system - Sistemske informacije
// ============================================
router.get('/system', authenticate, authorize('settings.edit'), async (req, res) => {
  try {
    // Broj vozila
    const [[vehicleCount]] = await pool.execute('SELECT COUNT(*) as count FROM vehicles');
    
    // Broj korisnika
    const [[userCount]] = await pool.execute('SELECT COUNT(*) as count FROM users');
    
    // Broj računa
    const [[invoiceCount]] = await pool.execute('SELECT COUNT(*) as count FROM invoices');
    
    // Ukupna veličina uploadanih fajlova (ako imamo file_size u invoices i documents)
    const [[totalFileSize]] = await pool.execute(
      'SELECT SUM(file_size) as total FROM invoices WHERE file_size IS NOT NULL'
    );
    
    // Verzija iz package.json (ručno postavljena)
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
// POST /api/settings/clear-cache - Očisti cache
// ============================================
router.post('/clear-cache', authenticate, authorize('settings.edit'), async (req, res) => {
  try {
    // Očisti in-memory cache ako postoji
    // Ovo ovisi o vašoj cache implementaciji
    
    res.json({ success: true, message: 'Cache očišćen' });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;

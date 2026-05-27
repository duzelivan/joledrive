const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// Dohvati sve postavke (settings + company_settings)
router.get('/', authenticate, authorizeEntity('settings'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    // Dohvati i company_settings
    const [companyRows] = await pool.execute('SELECT setting_key, setting_value FROM company_settings');
    const company = {};
    companyRows.forEach(row => {
      company[row.setting_key] = row.setting_value;
    });

    res.json({ ...settings, company });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/:key', authenticate, authorizeEntity('settings'), authorize(['settings.edit']), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    await pool.execute(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      [key, value, value]
    );

    res.json({ message: 'Setting updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

router.get('/notification-emails', authenticate, authorizeEntity('settings'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['notification_emails']
    );
    
    let emails = [];
    if (rows.length > 0 && rows[0].setting_value) {
      emails = rows[0].setting_value.split(',').map(e => e.trim()).filter(e => e);
    }
    
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notification emails' });
  }
});

router.post('/notification-emails', authenticate, authorizeEntity('settings'), authorize(['settings.edit']), async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const [rows] = await pool.execute(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['notification_emails']
    );

    let emails = [];
    if (rows.length > 0 && rows[0].setting_value) {
      emails = rows[0].setting_value.split(',').map(e => e.trim()).filter(e => e);
    }

    if (emails.includes(email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    emails.push(email);
    const newValue = emails.join(',');

    await pool.execute(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      ['notification_emails', newValue, newValue]
    );

    res.json({ message: 'Email added', emails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add email' });
  }
});

router.delete('/notification-emails/:email', authenticate, authorizeEntity('settings'), authorize(['settings.edit']), async (req, res) => {
  try {
    const emailToDelete = decodeURIComponent(req.params.email);

    const [rows] = await pool.execute(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['notification_emails']
    );

    if (rows.length === 0 || !rows[0].setting_value) {
      return res.status(404).json({ error: 'No emails found' });
    }

    let emails = rows[0].setting_value.split(',').map(e => e.trim()).filter(e => e);
    
    const filtered = emails.filter(e => e !== emailToDelete);
    
    if (filtered.length === emails.length) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const newValue = filtered.join(',');

    await pool.execute(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      ['notification_emails', newValue, newValue]
    );

    res.json({ message: 'Email removed', emails: filtered });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove email' });
  }
});

// Dohvati podatke o firmi
router.get('/company', authenticate, authorizeEntity('settings'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT setting_key, setting_value FROM company_settings');
    const company = {};
    rows.forEach(row => { company[row.setting_key] = row.setting_value; });
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch company settings' });
  }
});

// Spremi podatke o firmi
router.put('/company', authenticate, authorizeEntity('settings'), authorize(['settings.edit']), async (req, res) => {
  try {
    const { company_name, company_address, company_oib, company_email, company_phone } = req.body;
    const fields = { company_name, company_address, company_oib, company_email, company_phone };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        await pool.execute(
          'INSERT INTO company_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
          [key, value, value]
        );
      }
    }
    res.json({ message: 'Company settings updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update company settings' });
  }
});

module.exports = router;

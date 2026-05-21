const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Dohvati sve postavke
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Ažuriraj postavku
router.put('/:key', authenticate, authorize(['settings.edit']), async (req, res) => {
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

// Dohvati sve emailove za obavijesti
router.get('/notification-emails', authenticate, async (req, res) => {
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

// Dodaj novi email
router.post('/notification-emails', authenticate, authorize(['settings.edit']), async (req, res) => {
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

    // Provjeri jeli već dodan
    if (emails.includes(email)) {
      return res.status(400).json({ error: 'Email already exists' });  // ← ISPRAVLJENO
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

// Obriši email
router.delete('/notification-emails/:email', authenticate, authorize(['settings.edit']), async (req, res) => {
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
    
    // Ukloni email
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

module.exports = router;

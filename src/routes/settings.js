const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all settings
router.get('/', authenticate, async (req, res) => {
  try {
    const [settings] = await pool.execute('SELECT setting_key as key, setting_value as value FROM settings');
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update setting
router.put('/:key', authenticate, authorize(['settings.edit']), async (req, res) => {
  try {
    const { value } = req.body;
    await pool.execute(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      [req.params.key, value, value]
    );
    res.json({ message: 'Setting updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

module.exports = router;

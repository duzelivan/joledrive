const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Helper za sigurno parsiranje permissions
const safeParsePermissions = (permissions) => {
  if (!permissions) return {}
  if (typeof permissions === 'string') {
    try { return JSON.parse(permissions) } 
    catch (e) { 
      console.error('Failed to parse permissions:', permissions)
      return {} 
    }
  }
  if (typeof permissions === 'object') return permissions
  return {}
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;

    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND active = 1',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check 2FA if enabled
    if (user.totp_secret) {
      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });
      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
    }

    // Update last login
    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

res.json({
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: safeParsePermissions(user.permissions),
    entities: safeParsePermissions(user.entities) // NOVO
  }
});
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Setup 2FA
router.post('/setup-2fa', authenticate, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `JoleDrive:${req.user.email}`
    });

    await pool.execute(
      'UPDATE users SET totp_secret = ? WHERE id = ?',
      [secret.base32, req.user.id]
    );

    const QRCode = require('qrcode');
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl
    });
  } catch (error) {
    res.status(500).json({ error: '2FA setup failed' });
  }
});

// Verify session
router.get('/me', authenticate, async (req, res) => {
  try {
res.json({
  user: {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    permissions: safeParsePermissions(req.user.permissions),
    entities: safeParsePermissions(req.user.entities) // NOVO
  }
});
    
  } catch (error) {
    console.error('Auth /me error:', error)
    res.status(500).json({ error: 'Failed to get user data' })
  }
});

module.exports = router;

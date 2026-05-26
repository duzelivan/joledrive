const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ============================================
// HELPERS
// ============================================

function serializeForJwt(field) {
  if (!field) return {};
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return {}; }
  }
  return field;
}

function serializeForDb(field) {
  if (!field) return '{}';
  if (typeof field === 'string') return field;
  return JSON.stringify(field);
}

// ============================================
// LOGIN
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Dohvati korisnika (uključujući 2FA secret ako postoji)
    const [users] = await pool.execute(
      `SELECT id, name, email, password, role, type, phone, driver_license,
              address, oib, company_name, company_oib,
              entities, permissions, totp_secret
       FROM users WHERE email = ?`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Provjeri password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 2FA provjera ako je omogućena
    if (user.totp_secret) {
      const speakeasy = require('speakeasy');
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

    // Parsiraj entities i permissions
    const entities = serializeForJwt(user.entities);
    const permissions = serializeForJwt(user.permissions);

    // Generiraj JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        type: user.type,
        entities,
        permissions
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Ne vraćaj password i totp_secret
    const { password: _, totp_secret: __, ...userWithoutSensitive } = user;

    res.json({
      token,
      user: {
        ...userWithoutSensitive,
        entities,
        permissions
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// GET CURRENT USER (/me)
// ============================================
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [users] = await pool.execute(
      `SELECT id, name, email, role, type, phone, driver_license,
              address, oib, company_name, company_oib,
              entities, permissions
       FROM users WHERE id = ?`,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Parsiraj JSON polja
    if (user.entities && typeof user.entities === 'string') {
      try { user.entities = JSON.parse(user.entities); } catch { user.entities = {}; }
    }
    if (!user.entities) user.entities = {};

    if (user.permissions && typeof user.permissions === 'string') {
      try { user.permissions = JSON.parse(user.permissions); } catch { user.permissions = {}; }
    }
    if (!user.permissions) user.permissions = {};

    res.json({ user });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Me endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ============================================
// REGISTER (samo admin)
// ============================================
router.post('/register', async (req, res) => {
  try {
    // TODO: Dodati admin autentikaciju
    const { name, email, password, role, type } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, role, type, entities, permissions) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name, email, hashedPassword, role || 'user', type || 'user',
        '{}', '{}'
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'User registered' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = router;

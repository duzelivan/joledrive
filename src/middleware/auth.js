const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ============================================
// AUTHENTICATE - Provjera JWT tokena
// ============================================
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Dohvati svježe podatke iz baze (uključujući entities i permissions)
    const [users] = await pool.execute(
      `SELECT id, name, email, role, type, phone, entities, permissions 
       FROM users WHERE id = ?`,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = users[0];

    // Parsiraj JSON polja (entities, permissions) ako su spremljena kao string
    if (user.entities && typeof user.entities === 'string') {
      try { user.entities = JSON.parse(user.entities); } catch { user.entities = {}; }
    }
    if (!user.entities) user.entities = {};

    if (user.permissions && typeof user.permissions === 'string') {
      try { user.permissions = JSON.parse(user.permissions); } catch { user.permissions = {}; }
    }
    if (!user.permissions) user.permissions = {};

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// ============================================
// AUTHORIZE ENTITY - Pristup na temelju entiteta
// ============================================
// Dopušta pristup ako je admin ILI ako korisnik ima entity u svojim entitetima
function authorizeEntity(entity) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.entities && req.user.entities[entity] === true) return next();
    return res.status(403).json({ error: 'Access denied to this module' });
  };
}

// ============================================
// AUTHORIZE - Pristup na temelju permisija
// ============================================
// Dopušta pristup ako je admin ILI ako korisnik ima bilo koju od navedenih permisija
function authorize(permissions) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (!req.user.permissions || Object.keys(req.user.permissions).length === 0) {
      return res.status(403).json({ error: 'No permissions assigned' });
    }
    const hasPermission = permissions.some(p => req.user.permissions[p] === true);
    if (hasPermission) return next();
    return res.status(403).json({ error: 'Permission denied for this action' });
  };
}

// ============================================
// ADMIN ONLY - Samo za administratore
// ============================================
function adminOnly(req, res, next) {
  if (req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = { authenticate, authorize, authorizeEntity, adminOnly };

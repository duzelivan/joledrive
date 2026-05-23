const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type. Use access token.' });
    }

    const [users] = await pool.execute(
      'SELECT id, email, name, role, permissions, entities FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (permissions) => {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();

    const userPerms = safeParse(req.user.permissions);
    const hasPermission = permissions.every(p => userPerms[p] === true);

    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const authorizeEntity = (entity) => {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();

    const userEntities = safeParse(req.user.entities);
    
    if (!userEntities || Object.keys(userEntities).length === 0) return next();

    if (userEntities[entity] !== true) {
      return res.status(403).json({ error: `Access denied to ${entity}` });
    }
    next();
  };
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

function safeParse(json) {
  if (!json) return {};
  if (typeof json === 'object') return json;
  try { return JSON.parse(json); } 
  catch (e) { return {}; }
}

module.exports = { authenticate, authorize, authorizeEntity, requireAdmin };

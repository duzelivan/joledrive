const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// ============================================
// HELPERS
// ============================================

// Dohvati korisnika s entities i permissions
async function getUserWithParsedFields(userId) {
  const [users] = await pool.execute(
    `SELECT id, name, email, role, type, phone, driver_license, 
            address, oib, company_name, company_oib, 
            active, entities, permissions, created_at 
     FROM users WHERE id = ?`,
    [userId]
  );
  if (users.length === 0) return null;
  const user = users[0];

  if (user.entities && typeof user.entities === 'string') {
    try { user.entities = JSON.parse(user.entities); } catch { user.entities = {}; }
  }
  if (user.permissions && typeof user.permissions === 'string') {
    try { user.permissions = JSON.parse(user.permissions); } catch { user.permissions = {}; }
  }
  // active je BIT(1) u MySQL, može se vratiti kao Buffer
  if (user.active !== undefined && user.active !== null) {
    if (Buffer.isBuffer(user.active)) {
      user.active = user.active[0] === 1;
    } else {
      user.active = Boolean(user.active);
    }
  }
  return user;
}

function serializeField(field) {
  if (field === null || field === undefined) return '{}';
  if (typeof field === 'string') return field;
  return JSON.stringify(field);
}

// ============================================
// ROUTES
// ============================================

// Dohvati sve korisnike (svatko tko ima pristup users entitetu)
router.get('/', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, role, type, phone, driver_license, 
              address, oib, company_name, company_oib, 
              active, entities, permissions, created_at 
       FROM users ORDER BY created_at DESC`
    );

    // Parsiraj JSON polja za svakog korisnika i konvertiraj active
    const parsedUsers = users.map(u => {
      if (u.entities && typeof u.entities === 'string') {
        try { u.entities = JSON.parse(u.entities); } catch { u.entities = {}; }
      }
      if (u.permissions && typeof u.permissions === 'string') {
        try { u.permissions = JSON.parse(u.permissions); } catch { u.permissions = {}; }
      }
      // BIT(1) -> boolean konverzija
      if (u.active !== undefined && u.active !== null) {
        if (Buffer.isBuffer(u.active)) {
          u.active = u.active[0] === 1;
        } else {
          u.active = Boolean(u.active);
        }
      }
      // Ne vraćaj password hash
      delete u.password;
      return u;
    });

    res.json(parsedUsers);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Dohvati jednog korisnika
router.get('/:id', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    const user = await getUserWithParsedFields(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Kreiraj novog korisnika (potrebna users.create permisija)
router.post('/', authenticate, authorizeEntity('users'), authorize(['users.create']), async (req, res) => {
  try {
    const { name, email, password, role, type, phone, driver_license, 
            address, oib, company_name, company_oib, 
            entities, permissions, active } = req.body;

    // Validacija obaveznih polja
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Za korisnike (ne client), password je obavezan
    if (type !== 'client' && !password) {
      return res.status(400).json({ error: 'Password is required for users' });
    }

    // Hash password ako postoji
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, role, type, phone, driver_license,
        address, oib, company_name, company_oib, active, entities, permissions) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, email, hashedPassword, role || 'user', type || 'user',
        phone || null, driver_license || null, address || null, oib || null,
        company_name || null, company_oib || null,
        active !== undefined ? active : true,
        serializeField(entities), serializeField(permissions)
      ]
    );

    res.status(201).json({ 
      id: result.insertId, 
      type: type || 'user',
      message: 'User created successfully' 
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Uredi korisnika (potrebna users.edit permisija)
router.put('/:id', authenticate, authorizeEntity('users'), authorize(['users.edit']), async (req, res) => {
  try {
    const { name, email, role, type, phone, driver_license, 
            address, oib, company_name, company_oib, 
            entities, permissions, active, password } = req.body;

    // Ne dopustiti uređivanje vlastitog računa osim za admina
    if (parseInt(req.params.id) === req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot edit your own account' });
    }

    // Ne dopustiti uređivanje admin računa osim za druge admine
    if (req.user.role !== 'admin') {
      const [targetUser] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.params.id]);
      if (targetUser.length > 0 && targetUser[0].role === 'admin') {
        return res.status(403).json({ error: 'Cannot edit admin accounts' });
      }
    }

    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (role) { updates.push('role = ?'); values.push(role); }
    if (type) { updates.push('type = ?'); values.push(type); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone || null); }
    if (driver_license !== undefined) { updates.push('driver_license = ?'); values.push(driver_license || null); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address || null); }
    if (oib !== undefined) { updates.push('oib = ?'); values.push(oib || null); }
    if (company_name !== undefined) { updates.push('company_name = ?'); values.push(company_name || null); }
    if (company_oib !== undefined) { updates.push('company_oib = ?'); values.push(company_oib || null); }
    if (active !== undefined) { updates.push('active = ?'); values.push(active); }
    if (entities !== undefined) { updates.push('entities = ?'); values.push(serializeField(entities)); }
    if (permissions !== undefined) { updates.push('permissions = ?'); values.push(serializeField(permissions)); }

    // Ako se mijenja password
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);

    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Obriši korisnika (potrebna users.delete permisija)
router.delete('/:id', authenticate, authorizeEntity('users'), authorize(['users.delete']), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Ne dopustiti brisanje vlastitog računa
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Ne dopustiti brisanje admin računa osim za druge admine
    if (req.user.role !== 'admin') {
      const [targetUser] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
      if (targetUser.length > 0 && targetUser[0].role === 'admin') {
        return res.status(403).json({ error: 'Cannot delete admin accounts' });
      }
    }

    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;

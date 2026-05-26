const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { authenticate, requireAdmin, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// PASSWORD POLICY VALIDATOR
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];
  if (password.length < minLength) errors.push('Minimalno 8 znakova');
  if (!hasUpperCase) errors.push('Jedno veliko slovo');
  if (!hasLowerCase) errors.push('Jedno malo slovo');
  if (!hasNumbers) errors.push('Jedna brojka');
  if (!hasSpecialChar) errors.push('Jedan specijalni znak (!@#$%^&*...)');

  return {
    valid: errors.length === 0,
    errors: errors
  };
};

router.get('/', authenticate, authorizeEntity('users'), requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, role, type, phone, driver_license, address, oib, 
              company_name, company_oib, active, created_at, last_login 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/clients', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    const [clients] = await pool.execute(
      `SELECT id, name, phone, driver_license, address, oib, company_name, company_oib 
       FROM users 
       WHERE type = 'client' AND active = 1
       ORDER BY name ASC`
    );
    res.json(clients);
  } catch (error) {
    console.error('Fetch clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.get('/:id', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, role, type, phone, driver_license, address, oib,
              company_name, company_oib, permissions, entities, active, created_at 
       FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/', authenticate, authorizeEntity('users'), requireAdmin, async (req, res) => {
  try {
    const { 
      name, email, password, role, type = 'user', phone, 
      driver_license, address, oib, company_name, company_oib,
      permissions, entities 
    } = req.body;

    // Validacija
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Ako je tip 'user', email i password su obavezni
    if (type === 'user' && (!email || !password)) {
      return res.status(400).json({ error: 'Email and password are required for application users' });
    }

    // PASSWORD POLICY za korisnike aplikacije
    if (type === 'user' && password) {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Password does not meet security requirements',
          requirements: validation.errors
        });
      }
    }

    let hashedPassword = null;
    let accessCode = null;
    let userEmail = email || null;

    if (type === 'user') {
      hashedPassword = await bcrypt.hash(password, 10);
      accessCode = uuidv4().substring(0, 8).toUpperCase();
    }

    // Za client, generiraj dummy email ako nije poslan (za UNIQUE constraint)
    if (type === 'client' && !email) {
      userEmail = `client_${Date.now()}@joledrive.local`;
    }

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, role, type, phone, driver_license, address, oib,
                          company_name, company_oib, permissions, entities, access_code, active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name, 
        userEmail, 
        hashedPassword,
        role || 'user', 
        type,
        phone || null,
        driver_license || null,
        address || null,
        oib || null,
        company_name || null,
        company_oib || null,
        JSON.stringify(permissions || {}), 
        JSON.stringify(entities || {}), 
        accessCode
      ]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      email: type === 'user' ? email : null,
      type,
      role: role || 'user',
      accessCode,
      message: type === 'user' ? 'User created successfully' : 'Client created successfully'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Can only edit your own profile' });
    }

    const { 
      name, email, phone, role, type, permissions, entities, active, password,
      driver_license, address, oib, company_name, company_oib
    } = req.body;
    
    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (role && req.user.role === 'admin') { updates.push('role = ?'); values.push(role); }
    if (type && req.user.role === 'admin') { updates.push('type = ?'); values.push(type); }
    if (permissions && req.user.role === 'admin') { updates.push('permissions = ?'); values.push(JSON.stringify(permissions)); }
    if (entities && req.user.role === 'admin') { updates.push('entities = ?'); values.push(JSON.stringify(entities)); }
    if (active !== undefined && req.user.role === 'admin') { updates.push('active = ?'); values.push(active); }
    if (driver_license !== undefined) { updates.push('driver_license = ?'); values.push(driver_license); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address); }
    if (oib !== undefined) { updates.push('oib = ?'); values.push(oib); }
    if (company_name !== undefined) { updates.push('company_name = ?'); values.push(company_name); }
    if (company_oib !== undefined) { updates.push('company_oib = ?'); values.push(company_oib); }
    
    if (password && password.length > 0) {
      // PASSWORD POLICY i pri ažuriranju
      const validation = validatePassword(password);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Password does not meet security requirements',
          requirements: validation.errors
        });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    values.push(req.params.id);
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', authenticate, authorizeEntity('users'), requireAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/:id/reset-password', authenticate, authorizeEntity('users'), requireAdmin, async (req, res) => {
  try {
    const [userRows] = await pool.execute('SELECT type FROM users WHERE id = ?', [req.params.id]);
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (userRows[0].type === 'client') return res.status(400).json({ error: 'Cannot reset password for clients' });

    // Generiraj jaku random lozinku
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let newPassword = '';
    for (let i = 0; i < 12; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.params.id]
    );

    res.json({ password: newPassword, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

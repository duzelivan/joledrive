const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { authenticate, requireAdmin, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, authorizeEntity('users'), requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, name, email, role, phone, active, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/:id', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, name, email, role, phone, permissions, entities, active, created_at FROM users WHERE id = ?',
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
    const { name, email, password, role, phone, permissions, entities } = req.body;
    const accessCode = uuidv4().substring(0, 8).toUpperCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, role, phone, permissions, entities, access_code, active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, email, hashedPassword, role, phone, JSON.stringify(permissions || {}), JSON.stringify(entities || {}), accessCode]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      email,
      role,
      accessCode,
      message: 'User created successfully'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', authenticate, authorizeEntity('users'), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Can only edit your own profile' });
    }

    const { name, email, phone, role, permissions, entities, active, password } = req.body;
    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (phone) { updates.push('phone = ?'); values.push(phone); }
    if (role && req.user.role === 'admin') { updates.push('role = ?'); values.push(role); }
    if (permissions && req.user.role === 'admin') { updates.push('permissions = ?'); values.push(JSON.stringify(permissions)); }
    if (entities && req.user.role === 'admin') { updates.push('entities = ?'); values.push(JSON.stringify(entities)); }
    if (active !== undefined && req.user.role === 'admin') { updates.push('active = ?'); values.push(active); }
    
    if (password && password.length > 0) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    values.push(req.params.id);
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'User updated successfully' });
  } catch (error) {
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
    const newPassword = Math.random().toString(36).substring(2, 10);
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

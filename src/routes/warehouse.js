const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, authorizeEntity('warehouse'), async (req, res) => {
  try {
    const { search, low_stock } = req.query;
    let query = 'SELECT * FROM warehouse WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR part_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (low_stock === 'true') {
      query += ' AND quantity <= min_quantity';
    }

    query += ' ORDER BY name';

    const [parts] = await pool.execute(query, params);
    res.json(parts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch warehouse items' });
  }
});

router.get('/:id', authenticate, authorizeEntity('warehouse'), async (req, res) => {
  try {
    const [parts] = await pool.execute('SELECT * FROM warehouse WHERE id = ?', [req.params.id]);
    if (parts.length === 0) return res.status(404).json({ error: 'Part not found' });
    res.json(parts[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch part' });
  }
});

router.post('/', authenticate, authorizeEntity('warehouse'), authorize(['warehouse.create']), async (req, res) => {
  try {
    const { name, part_number, category, quantity, min_quantity, unit_price, supplier, notes } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO warehouse (name, part_number, category, quantity, min_quantity, unit_price, supplier, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, part_number, category, quantity, min_quantity, unit_price, supplier, notes]
    );

    res.status(201).json({ id: result.insertId, message: 'Part added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add part' });
  }
});

router.put('/:id', authenticate, authorizeEntity('warehouse'), authorize(['warehouse.edit']), async (req, res) => {
  try {
    const { name, part_number, category, quantity, min_quantity, unit_price, supplier, notes } = req.body;
    await pool.execute(
      `UPDATE warehouse SET name = ?, part_number = ?, category = ?, quantity = ?, 
        min_quantity = ?, unit_price = ?, supplier = ?, notes = ? WHERE id = ?`,
      [name, part_number, category, quantity, min_quantity, unit_price, supplier, notes, req.params.id]
    );
    res.json({ message: 'Part updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update part' });
  }
});

router.delete('/:id', authenticate, authorizeEntity('warehouse'), authorize(['warehouse.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM warehouse WHERE id = ?', [req.params.id]);
    res.json({ message: 'Part deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete part' });
  }
});

module.exports = router;

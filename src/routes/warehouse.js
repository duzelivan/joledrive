const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

router.get('/stats', authenticate, authorizeEntity('warehouse'), async (req, res) => {
  try {
    // Total value of all parts
    const [[totalValue]] = await pool.execute(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total_value FROM warehouse'
    );

    // Total number of parts
    const [[totalParts]] = await pool.execute(
      'SELECT COUNT(*) as count FROM warehouse'
    );

    // Low stock count (quantity <= min_quantity)
    const [[lowStock]] = await pool.execute(
      'SELECT COUNT(*) as count FROM warehouse WHERE quantity <= min_quantity'
    );

    // Out of stock (quantity = 0)
    const [[outOfStock]] = await pool.execute(
      'SELECT COUNT(*) as count FROM warehouse WHERE quantity = 0'
    );

    // Value breakdown by category
    const [categoryBreakdown] = await pool.execute(
      `SELECT category, 
        COUNT(*) as item_count, 
        COALESCE(SUM(quantity * unit_price), 0) as category_value,
        COALESCE(SUM(quantity), 0) as total_qty
       FROM warehouse 
       GROUP BY category 
       ORDER BY category_value DESC`
    );

    // Unique categories list
    const [categories] = await pool.execute(
      'SELECT DISTINCT category FROM warehouse WHERE category IS NOT NULL ORDER BY category'
    );

    res.json({
      total_value: parseFloat(totalValue.total_value || 0),
      total_parts: Number(totalParts.count) || 0,
      low_stock: Number(lowStock.count) || 0,
      out_of_stock: Number(outOfStock.count) || 0,
      category_breakdown: categoryBreakdown,
      categories: categories.map(c => c.category)
    });
  } catch (error) {
    console.error('Warehouse stats error:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse stats' });
  }
});

router.get('/', authenticate, authorizeEntity('warehouse'), async (req, res) => {
  try {
    const { search, low_stock, category } = req.query;
    let query = 'SELECT * FROM warehouse WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR part_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (low_stock === 'true') {
      query += ' AND quantity <= min_quantity';
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
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

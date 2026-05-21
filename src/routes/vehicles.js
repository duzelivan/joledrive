const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_name 
       FROM vehicles v 
       LEFT JOIN users u ON v.assigned_to = u.id 
       ORDER BY v.created_at DESC`
    );
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.get('/:id', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [vehicles] = await pool.execute(
      `SELECT v.*, u.name as assigned_name 
       FROM vehicles v 
       LEFT JOIN users u ON v.assigned_to = u.id 
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (vehicles.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    const vehicle = vehicles[0];

    const [services] = await pool.execute(
      `SELECT s.*, u.name as mechanic_name 
       FROM services s 
       LEFT JOIN users u ON s.mechanic_id = u.id 
       WHERE s.vehicle_id = ? ORDER BY s.service_date DESC`,
      [req.params.id]
    );

    const [invoices] = await pool.execute(
      `SELECT i.*, COALESCE(SUM(p.amount), 0) as paid_amount,
       (i.amount - COALESCE(SUM(p.amount), 0)) as remaining_amount
       FROM invoices i 
       LEFT JOIN invoice_payments p ON i.id = p.invoice_id
       WHERE i.vehicle_id = ? 
       GROUP BY i.id 
       ORDER BY i.created_at DESC`,
      [req.params.id]
    );

    const [documents] = await pool.execute(
      `SELECT d.*, u.name as uploaded_by_name
       FROM documents d 
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.vehicle_id = ? 
       ORDER BY d.created_at DESC`,
      [req.params.id]
    );

    // NOVO: Dodatni troškovi
    const [expenses] = await pool.execute(
      `SELECT ve.*, u.name as created_by_name
       FROM vehicle_expenses ve
       LEFT JOIN users u ON ve.created_by = u.id
       WHERE ve.vehicle_id = ?
       ORDER BY ve.expense_date DESC`,
      [req.params.id]
    );

    const enrichedInvoices = invoices.map(inv => {
      const paid = parseFloat(inv.paid_amount || 0);
      const total = parseFloat(inv.amount);
      let status = 'unpaid';
      if (paid >= total) status = 'paid';
      else if (paid > 0) status = 'partial';
      return { ...inv, status };
    });

    vehicle.service_history = services;
    vehicle.invoices = enrichedInvoices;
    vehicle.documents = documents;
    vehicle.expenses = expenses;

    res.json(vehicle);
  } catch (error) {
    console.error('Fetch vehicle detail error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle details' });
  }
});

router.post('/', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.create']), async (req, res) => {
  try {
    const { manufacturer, model, license_plate, chassis_number, year, mileage,
      fuel_type, color, registration_date, yellow_card_date,
      pp_apparatus_date, image_url, notes, assigned_to } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO vehicles (manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color, 
        registration_date, yellow_card_date, pp_apparatus_date, image_url, notes, assigned_to) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [manufacturer, model, license_plate, chassis_number, year, mileage, fuel_type, color,
       registration_date, yellow_card_date, pp_apparatus_date, image_url, notes, assigned_to || null]
    );

    res.status(201).json({ id: result.insertId, message: 'Vehicle created successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'License plate or chassis number already exists' });
    }
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

router.put('/:id', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.edit']), async (req, res) => {
  try {
    const { manufacturer, model, license_plate, chassis_number, year, mileage,
      fuel_type, color, registration_date, yellow_card_date,
      pp_apparatus_date, image_url, notes, assigned_to } = req.body;

    const updates = [];
    const values = [];

    if (manufacturer) { updates.push('manufacturer = ?'); values.push(manufacturer); }
    if (model) { updates.push('model = ?'); values.push(model); }
    if (license_plate) { updates.push('license_plate = ?'); values.push(license_plate); }
    if (chassis_number) { updates.push('chassis_number = ?'); values.push(chassis_number); }
    if (year) { updates.push('year = ?'); values.push(year); }
    if (mileage) { updates.push('mileage = ?'); values.push(mileage); }
    if (fuel_type) { updates.push('fuel_type = ?'); values.push(fuel_type); }
    if (color) { updates.push('color = ?'); values.push(color); }
    if (registration_date) { updates.push('registration_date = ?'); values.push(registration_date); }
    if (yellow_card_date) { updates.push('yellow_card_date = ?'); values.push(yellow_card_date); }
    if (pp_apparatus_date) { updates.push('pp_apparatus_date = ?'); values.push(pp_apparatus_date); }
    if (image_url) { updates.push('image_url = ?'); values.push(image_url); }
    if (notes) { updates.push('notes = ?'); values.push(notes); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(assigned_to || null); }

    values.push(req.params.id);

    await pool.execute(
      `UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'Vehicle updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.delete('/:id', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

// ============================================
// NOVO: VEHICLE EXPENSES
// ============================================

router.get('/:id/expenses', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [expenses] = await pool.execute(
      `SELECT ve.*, u.name as created_by_name
       FROM vehicle_expenses ve
       LEFT JOIN users u ON ve.created_by = u.id
       WHERE ve.vehicle_id = ?
       ORDER BY ve.expense_date DESC`,
      [req.params.id]
    );
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

router.post('/:id/expenses', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { expense_type, amount, description, expense_date } = req.body;
    const vehicleId = req.params.id;

    if (!expense_type || !amount) {
      return res.status(400).json({ error: 'Type and amount are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO vehicle_expenses (vehicle_id, expense_type, amount, description, expense_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [vehicleId, expense_type, amount, description || null, expense_date || new Date(), req.user.id]
    );

    // Ažuriraj financije vozila
    await pool.execute(
      `UPDATE vehicles 
       SET total_expenses = total_expenses + ?,
           total_profit = total_income - (total_expenses + ?)
       WHERE id = ?`,
      [amount, amount, vehicleId]
    );

    res.status(201).json({ id: result.insertId, message: 'Expense added' });
  } catch (error) {
    console.error('Add expense error:', error);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

router.delete('/expenses/:expenseId', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [expense] = await pool.execute(
      'SELECT vehicle_id, amount FROM vehicle_expenses WHERE id = ?',
      [req.params.expenseId]
    );

    if (expense.length === 0) return res.status(404).json({ error: 'Expense not found' });

    const { vehicle_id, amount } = expense[0];

    await pool.execute('DELETE FROM vehicle_expenses WHERE id = ?', [req.params.expenseId]);

    // Vrati financije
    await pool.execute(
      `UPDATE vehicles 
       SET total_expenses = total_expenses - ?,
           total_profit = total_income - (total_expenses - ?)
       WHERE id = ?`,
      [amount, amount, vehicle_id]
    );

    res.json({ message: 'Expense deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// ============================================
// NOVO: FINANCIJSKI IZVJEŠTAJ PO VOZILU
// ============================================

router.get('/:id/financial-report', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const vehicleId = req.params.id;

    const [vehicleRows] = await pool.execute(
      `SELECT id, manufacturer, model, license_plate, total_income, total_expenses, total_profit
       FROM vehicles WHERE id = ?`,
      [vehicleId]
    );
    if (vehicleRows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    // Prihodi (računi)
    const [invoices] = await pool.execute(
      `SELECT i.id, i.invoice_number, i.amount, i.issue_date, i.status,
       COALESCE(SUM(p.amount), 0) as paid_amount
       FROM invoices i
       LEFT JOIN invoice_payments p ON i.id = p.invoice_id
       WHERE i.vehicle_id = ?
       GROUP BY i.id
       ORDER BY i.issue_date DESC`,
      [vehicleId]
    );

    const totalInvoices = invoices.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const totalPaid = invoices.reduce((sum, i) => sum + parseFloat(i.paid_amount), 0);

    // Servisi
    const [services] = await pool.execute(
      `SELECT id, description, work_description, labor_cost, total_cost, completed_at
       FROM services 
       WHERE vehicle_id = ? AND status = 'completed'
       ORDER BY completed_at DESC`,
      [vehicleId]
    );

    const totalServices = services.reduce((sum, s) => sum + parseFloat(s.total_cost || 0), 0);

    // Ostali troškovi
    const [expenses] = await pool.execute(
      `SELECT id, expense_type, amount, description, expense_date
       FROM vehicle_expenses 
       WHERE vehicle_id = ?
       ORDER BY expense_date DESC`,
      [vehicleId]
    );

    const totalOtherExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalAllExpenses = totalServices + totalOtherExpenses;
    const profit = totalInvoices - totalAllExpenses;

    res.json({
      vehicle: vehicleRows[0],
      summary: {
        total_income: totalInvoices,
        total_paid: totalPaid,
        total_unpaid: totalInvoices - totalPaid,
        total_service_costs: totalServices,
        total_other_expenses: totalOtherExpenses,
        total_expenses: totalAllExpenses,
        profit: profit,
        profit_margin: totalInvoices > 0 ? ((profit / totalInvoices) * 100).toFixed(2) + '%' : '0%'
      },
      invoices,
      services,
      expenses
    });
  } catch (error) {
    console.error('Financial report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;

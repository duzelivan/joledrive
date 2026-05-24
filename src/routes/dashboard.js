const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, authorizeEntity('dashboard'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // === 4 VEHICLE GROUPS (for KPI cards) ===
    const [[serviceConfirmed]] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as count
       FROM vehicles v
       INNER JOIN services s ON v.id = s.vehicle_id
       WHERE s.status = 'confirmed'`
    );

    const [[serviceScheduled]] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as count
       FROM vehicles v
       INNER JOIN services s ON v.id = s.vehicle_id
       WHERE s.status = 'scheduled'`
    );

    const [[occupiedCount]] = await pool.execute(
      `SELECT COUNT(*) as count FROM vehicles WHERE assigned_to IS NOT NULL`
    );

    const [[availableCount]] = await pool.execute(
      `SELECT COUNT(*) as count FROM vehicles WHERE assigned_to IS NULL`
    );

    // === ACTIVE ASSIGNMENTS ===
    const [activeAssignments] = await pool.execute(
      `SELECT v.id, v.manufacturer, v.model, v.license_plate, v.image_url,
        u.name as assigned_name, u.phone as assigned_phone, va.assigned_at
       FROM vehicle_assignments va
       JOIN vehicles v ON va.vehicle_id = v.id
       JOIN users u ON va.user_id = u.id
       WHERE va.returned_at IS NULL
       ORDER BY va.assigned_at DESC
       LIMIT 10`
    );

    const [[activeAssignmentsCount]] = await pool.execute(
      `SELECT COUNT(*) as count FROM vehicle_assignments WHERE returned_at IS NULL`
    );

    // === NOTIFICATIONS (with days remaining) ===
    const [notifications] = await pool.execute(
      `SELECT id, manufacturer, model, license_plate, registration_date, yellow_card_date, pp_apparatus_date,
        CASE 
          WHEN registration_date <= ? THEN 'REGISTRATION_EXPIRED'
          WHEN registration_date <= ? THEN 'REGISTRATION_EXPIRING'
          WHEN yellow_card_date <= ? THEN 'YELLOW_CARD_EXPIRED'
          WHEN yellow_card_date <= ? THEN 'YELLOW_CARD_EXPIRING'
          WHEN pp_apparatus_date <= ? THEN 'PP_EXPIRED'
          WHEN pp_apparatus_date <= ? THEN 'PP_EXPIRING'
        END as alert_type
       FROM vehicles 
       WHERE registration_date <= ? OR yellow_card_date <= ? OR pp_apparatus_date <= ?`,
      [today, thirtyDaysLater, today, thirtyDaysLater, today, thirtyDaysLater, thirtyDaysLater, thirtyDaysLater, thirtyDaysLater]
    );

    // Enrich notifications with days remaining
    const enrichedNotifications = notifications.map(n => {
      let daysRemaining = null;
      let targetDate = null;
      
      if (n.alert_type?.includes('REGISTRATION')) targetDate = n.registration_date;
      else if (n.alert_type?.includes('YELLOW_CARD')) targetDate = n.yellow_card_date;
      else if (n.alert_type?.includes('PP')) targetDate = n.pp_apparatus_date;

      if (targetDate) {
        const target = new Date(targetDate);
        const now = new Date(today);
        const diffTime = target - now;
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return { ...n, days_remaining: daysRemaining };
    });

    // Sort: expired first (negative days), then by days remaining
    enrichedNotifications.sort((a, b) => (a.days_remaining ?? 999) - (b.days_remaining ?? 999));

    const [upcomingServices] = await pool.execute(
      `SELECT s.*, v.manufacturer, v.model 
       FROM services s 
       JOIN vehicles v ON s.vehicle_id = v.id 
       WHERE s.status IN ('scheduled', 'confirmed') 
       AND s.service_date >= ? 
       ORDER BY s.service_date ASC 
       LIMIT 10`,
      [today]
    );

    // === INVOICES (only income) ===
    const [unpaidResult] = await pool.execute(`
      SELECT i.id, i.amount 
      FROM invoices i
      LEFT JOIN invoice_payments p ON i.id = p.invoice_id
      WHERE p.id IS NULL
      AND (i.invoice_type = 'income' OR i.invoice_type IS NULL)
    `);
    
    let unpaidCount = unpaidResult.length;
    let unpaidTotal = unpaidResult.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

    const [partialResult] = await pool.execute(`
      SELECT i.id, i.amount, SUM(p.amount) as paid
      FROM invoices i
      JOIN invoice_payments p ON i.id = p.invoice_id
      WHERE (i.invoice_type = 'income' OR i.invoice_type IS NULL)
      GROUP BY i.id, i.amount
      HAVING paid < i.amount
    `);
    
    let partialCount = partialResult.length;
    let partialTotal = partialResult.reduce((sum, inv) => sum + ((Number(inv.amount) || 0) - (Number(inv.paid) || 0)), 0);

    const [paidResult] = await pool.execute(`
      SELECT i.id, i.amount
      FROM invoices i
      JOIN invoice_payments p ON i.id = p.invoice_id
      WHERE (i.invoice_type = 'income' OR i.invoice_type IS NULL)
      GROUP BY i.id, i.amount
      HAVING SUM(p.amount) >= i.amount
    `);
    
    let paidTotal = paidResult.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

    const totalDue = unpaidTotal + partialTotal;

    const [[vehicleCount]] = await pool.execute('SELECT COUNT(*) as count FROM vehicles');
    const [[serviceCount]] = await pool.execute('SELECT COUNT(*) as count FROM services WHERE status = "completed"');

    const totalIncome = paidTotal;
    
    // === EXPENSES: calculate directly from services + parts with admin logic ===
    // Admin labor = 0, Mechanic labor = labor_cost, Parts always count
    const [serviceExpensesResult] = await pool.execute(`
      SELECT COALESCE(SUM(
        (CASE WHEN u.role = 'admin' THEN 0 ELSE s.labor_cost END) + 
        COALESCE(sp.parts_total, 0)
      ), 0) as total
      FROM services s
      LEFT JOIN users u ON s.mechanic_id = u.id
      LEFT JOIN (
        SELECT service_id, SUM(quantity * unit_price) as parts_total
        FROM service_parts
        GROUP BY service_id
      ) sp ON s.id = sp.service_id
      WHERE s.status = 'completed'
    `);
    
    const [expenseInvoices] = await pool.execute(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM invoices
      WHERE invoice_type = 'expense' AND status = 'paid'
    `);
    
    const totalExpenses = parseFloat(serviceExpensesResult[0].total || 0) + parseFloat(expenseInvoices[0].total || 0);

    res.json({
      notifications: enrichedNotifications,
      upcomingServices,
      activeAssignments,
      stats: {
        vehicles: Number(vehicleCount.count) || 0,
        completedServices: Number(serviceCount.count) || 0,
        activeAssignments: Number(activeAssignmentsCount.count) || 0,
        serviceConfirmed: Number(serviceConfirmed.count) || 0,
        serviceScheduled: Number(serviceScheduled.count) || 0,
        occupied: Number(occupiedCount.count) || 0,
        available: Number(availableCount.count) || 0,
        unpaidInvoices: unpaidCount,
        unpaidTotal: unpaidTotal,
        partialInvoices: partialCount,
        partialTotal: partialTotal,
        totalDue: totalDue,
        totalIncome: totalIncome,
        totalExpenses: totalExpenses,
        profit: totalIncome - totalExpenses
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: error.message });
  }
});

router.get('/analytics', authenticate, authorizeEntity('dashboard'), async (req, res) => {
  try {
    const { period, year, month } = req.query;
    const targetYear = year || new Date().getFullYear();

    let incomeQuery, expenseQuery;
    let incomeParams = [], expenseParams = [];

    if (period === 'month') {
      // Monthly: 12 months of the selected year
      incomeQuery = `SELECT MONTH(created_at) as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices 
                      WHERE status = 'paid' 
                      AND (invoice_type = 'income' OR invoice_type IS NULL)
                      AND YEAR(created_at) = ? 
                      GROUP BY MONTH(created_at)`;
      
      // Expenses: services (labor + parts, with admin logic) + expense invoices
      expenseQuery = `SELECT 
                        MONTH(combined.date_col) as period, 
                        COALESCE(SUM(combined.amount), 0) as total
                       FROM (
                         -- Service costs: admin labor = 0, mechanic labor = labor_cost
                         SELECT 
                           s.service_date as date_col,
                           (CASE WHEN u.role = 'admin' THEN 0 ELSE s.labor_cost END + COALESCE(sp.parts_total, 0)) as amount
                         FROM services s
                         LEFT JOIN users u ON s.mechanic_id = u.id
                         LEFT JOIN (
                           SELECT service_id, SUM(quantity * unit_price) as parts_total
                           FROM service_parts
                           GROUP BY service_id
                         ) sp ON s.id = sp.service_id
                         WHERE s.status = 'completed' AND YEAR(s.service_date) = ?
                         
                         UNION ALL
                         
                         -- Expense invoices
                         SELECT created_at as date_col, amount
                         FROM invoices WHERE invoice_type = 'expense' AND status = 'paid' AND YEAR(created_at) = ?
                       ) combined
                       GROUP BY MONTH(combined.date_col)`;
      
      incomeParams = [targetYear];
      expenseParams = [targetYear, targetYear];

    } else if (period === 'week') {
      // Weekly: weeks of selected month/year
      const targetMonth = month || new Date().getMonth() + 1;
      
      incomeQuery = `SELECT WEEK(created_at) as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices 
                      WHERE status = 'paid' 
                      AND (invoice_type = 'income' OR invoice_type IS NULL)
                      AND YEAR(created_at) = ? AND MONTH(created_at) = ? 
                      GROUP BY WEEK(created_at)`;
      
      expenseQuery = `SELECT 
                        WEEK(combined.date_col) as period, 
                        COALESCE(SUM(combined.amount), 0) as total
                       FROM (
                         SELECT 
                           s.service_date as date_col,
                           (CASE WHEN u.role = 'admin' THEN 0 ELSE s.labor_cost END + COALESCE(sp.parts_total, 0)) as amount
                         FROM services s
                         LEFT JOIN users u ON s.mechanic_id = u.id
                         LEFT JOIN (
                           SELECT service_id, SUM(quantity * unit_price) as parts_total
                           FROM service_parts
                           GROUP BY service_id
                         ) sp ON s.id = sp.service_id
                         WHERE s.status = 'completed' AND YEAR(s.service_date) = ? AND MONTH(s.service_date) = ?
                         
                         UNION ALL
                         
                         SELECT created_at as date_col, amount
                         FROM invoices WHERE invoice_type = 'expense' AND status = 'paid' AND YEAR(created_at) = ? AND MONTH(created_at) = ?
                       ) combined
                       GROUP BY WEEK(combined.date_col)`;
      
      incomeParams = [targetYear, targetMonth];
      expenseParams = [targetYear, targetMonth, targetYear, targetMonth];

    } else {
      // Default: last 12 months
      incomeQuery = `SELECT DATE_FORMAT(created_at, '%Y-%m') as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices 
                      WHERE status = 'paid' 
                      AND (invoice_type = 'income' OR invoice_type IS NULL)
                      AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH) 
                      GROUP BY DATE_FORMAT(created_at, '%Y-%m')`;
      
      expenseQuery = `SELECT 
                        DATE_FORMAT(combined.date_col, '%Y-%m') as period, 
                        COALESCE(SUM(combined.amount), 0) as total
                       FROM (
                         SELECT 
                           s.service_date as date_col,
                           (CASE WHEN u.role = 'admin' THEN 0 ELSE s.labor_cost END + COALESCE(sp.parts_total, 0)) as amount
                         FROM services s
                         LEFT JOIN users u ON s.mechanic_id = u.id
                         LEFT JOIN (
                           SELECT service_id, SUM(quantity * unit_price) as parts_total
                           FROM service_parts
                           GROUP BY service_id
                         ) sp ON s.id = sp.service_id
                         WHERE s.status = 'completed' AND s.service_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                         
                         UNION ALL
                         
                         SELECT created_at as date_col, amount
                         FROM invoices WHERE invoice_type = 'expense' AND status = 'paid' AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                       ) combined
                       GROUP BY DATE_FORMAT(combined.date_col, '%Y-%m')`;
      
      incomeParams = [];
      expenseParams = [];
    }

    const [income] = await pool.execute(incomeQuery, incomeParams);
    const [expenses] = await pool.execute(expenseQuery, expenseParams);

    res.json({ income, expenses });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;

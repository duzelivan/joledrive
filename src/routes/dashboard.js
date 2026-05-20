const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Get dashboard data
router.get('/', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Notifications
    const [notifications] = await pool.execute(
      `SELECT id, manufacturer, model, registration_date, yellow_card_date, pp_apparatus_date,
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

    // Upcoming services
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

    // === RAČUNI - TRI ZASEBNA BROJA ===

    // 1. Potpuno neplaćeni
    const [[unpaidInvoices]] = await pool.execute(
      'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = "unpaid"'
    );

    // 2. Djelomično plaćeni (broj i preostali iznos)
    const [[partialInvoices]] = await pool.execute(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(i.amount - COALESCE(p.paid_total, 0)), 0) as total
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as paid_total 
        FROM invoice_payments 
        GROUP BY invoice_id
      ) p ON i.id = p.invoice_id
      WHERE i.status = "partial"
    `);

    // 3. Plaćeni (za referencu)
    const [[paidInvoices]] = await pool.execute(
      'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = "paid"'
    );

    // Ukupno za platiti (neplaćeni + preostalo na parcijalnim)
    const totalDue = parseFloat(unpaidInvoices.total) + parseFloat(partialInvoices.total);

    // Stats
    const [[vehicleCount]] = await pool.execute('SELECT COUNT(*) as count FROM vehicles');
    const [[serviceCount]] = await pool.execute('SELECT COUNT(*) as count FROM services WHERE status = "completed"');

    res.json({
      notifications,
      upcomingServices,
      stats: {
        vehicles: vehicleCount.count,
        completedServices: serviceCount.count,
        // Tri zasebna broja za račune
        unpaidInvoices: unpaidInvoices.count,
        unpaidTotal: unpaidInvoices.total,
        partialInvoices: partialInvoices.count,
        partialTotal: partialInvoices.total,
        paidInvoices: paidInvoices.count,
        paidTotal: paidInvoices.total,
        // Ukupno za platiti
        totalDue: totalDue
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Analytics - Income and expenses
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const { period, year, month, week } = req.query;

    let incomeQuery, expenseQuery;
    let params = [];

    if (period === 'month') {
      incomeQuery = `SELECT MONTH(created_at) as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices WHERE status = 'paid' AND YEAR(created_at) = ? 
                      GROUP BY MONTH(created_at)`;
      expenseQuery = `SELECT MONTH(service_date) as period, COALESCE(SUM(labor_cost), 0) as total 
                       FROM services WHERE status = 'completed' AND YEAR(service_date) = ? 
                       GROUP BY MONTH(service_date)`;
      params = [year || new Date().getFullYear()];
    } else if (period === 'week') {
      incomeQuery = `SELECT WEEK(created_at) as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices WHERE status = 'paid' AND YEAR(created_at) = ? AND MONTH(created_at) = ? 
                      GROUP BY WEEK(created_at)`;
      expenseQuery = `SELECT WEEK(service_date) as period, COALESCE(SUM(labor_cost), 0) as total 
                       FROM services WHERE status = 'completed' AND YEAR(service_date) = ? AND MONTH(service_date) = ? 
                       GROUP BY WEEK(service_date)`;
      params = [year || new Date().getFullYear(), month || new Date().getMonth() + 1];
    } else {
      incomeQuery = `SELECT DATE_FORMAT(created_at, '%Y-%m') as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices WHERE status = 'paid' AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH) 
                      GROUP BY DATE_FORMAT(created_at, '%Y-%m')`;
      expenseQuery = `SELECT DATE_FORMAT(service_date, '%Y-%m') as period, COALESCE(SUM(labor_cost), 0) as total 
                       FROM services WHERE status = 'completed' AND service_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH) 
                       GROUP BY DATE_FORMAT(service_date, '%Y-%m')`;
    }

    const [income] = await pool.execute(incomeQuery, params);
    const [expenses] = await pool.execute(expenseQuery, params);

    res.json({ income, expenses });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;

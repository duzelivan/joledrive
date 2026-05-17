const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Get dashboard data
router.get('/', authenticate, async (req, res) => {
  try {
    // Notifications - expired or expiring soon
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

    // Stats
    const [[vehicleCount]] = await pool.execute('SELECT COUNT(*) as count FROM vehicles');
    const [[serviceCount]] = await pool.execute('SELECT COUNT(*) as count FROM services WHERE status = "completed"');
    const [[unpaidInvoices]] = await pool.execute('SELECT COUNT(*) as count FROM invoices WHERE status = "unpaid"');
    const [[totalUnpaid]] = await pool.execute('SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = "unpaid"');

    res.json({
      notifications,
      upcomingServices,
      stats: {
        vehicles: vehicleCount.count,
        completedServices: serviceCount.count,
        unpaidInvoices: unpaidInvoices.count,
        totalUnpaid: totalUnpaid.total
      }
    });
  } catch (error) {
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
      // Monthly breakdown for selected year
      incomeQuery = `SELECT MONTH(created_at) as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices WHERE status = 'paid' AND YEAR(created_at) = ? 
                      GROUP BY MONTH(created_at)`;
      expenseQuery = `SELECT MONTH(service_date) as period, COALESCE(SUM(labor_cost), 0) as total 
                       FROM services WHERE status = 'completed' AND YEAR(service_date) = ? 
                       GROUP BY MONTH(service_date)`;
      params = [year || new Date().getFullYear()];
    } else if (period === 'week') {
      // Weekly breakdown for selected month
      incomeQuery = `SELECT WEEK(created_at) as period, COALESCE(SUM(amount), 0) as total 
                      FROM invoices WHERE status = 'paid' AND YEAR(created_at) = ? AND MONTH(created_at) = ? 
                      GROUP BY WEEK(created_at)`;
      expenseQuery = `SELECT WEEK(service_date) as period, COALESCE(SUM(labor_cost), 0) as total 
                       FROM services WHERE status = 'completed' AND YEAR(service_date) = ? AND MONTH(service_date) = ? 
                       GROUP BY WEEK(service_date)`;
      params = [year || new Date().getFullYear(), month || new Date().getMonth() + 1];
    } else {
      // Default: last 12 months
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
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;

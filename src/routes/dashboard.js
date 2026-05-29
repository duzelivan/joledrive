const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// ============================================
// DASHBOARD - glavni pregled
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // --- VOZILA ---
    const [vehicles] = await pool.execute('SELECT COUNT(*) as count FROM vehicles');
    const [availableVehicles] = await pool.execute('SELECT COUNT(*) as count FROM vehicles WHERE assigned_to IS NULL');
    const [occupiedVehicles] = await pool.execute('SELECT COUNT(*) as count FROM vehicles WHERE assigned_to IS NOT NULL');

    // --- SERVISI ---
    const [completedServices] = await pool.execute("SELECT COUNT(*) as count FROM services WHERE status = 'completed'");
    const [activeServices] = await pool.execute("SELECT COUNT(*) as count FROM services WHERE status = 'confirmed'");
    const [scheduledServices] = await pool.execute("SELECT COUNT(*) as count FROM services WHERE status = 'scheduled'");

    // --- RAČUNI ---
    const [unpaidInvoices] = await pool.execute("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM invoices WHERE id NOT IN (SELECT invoice_id FROM invoice_payments GROUP BY invoice_id HAVING SUM(amount) >= invoices.amount) AND invoice_type != 'expense'");
    const [partialInvoices] = await pool.execute(`
      SELECT COUNT(*) as count, COALESCE(SUM(i.amount - COALESCE(p.paid, 0)), 0) as total
      FROM invoices i
      LEFT JOIN (SELECT invoice_id, SUM(amount) as paid FROM invoice_payments GROUP BY invoice_id) p ON i.id = p.invoice_id
      WHERE i.invoice_type != 'expense' AND p.paid > 0 AND p.paid < i.amount
    `);
    // Prihod = samo uplaćeni iznosi (prema datumu uplate)
    const [monthIncome] = await pool.execute(
      `SELECT COALESCE(SUM(p.amount), 0) as total 
       FROM invoice_payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE i.invoice_type = 'income' AND p.payment_date >= ? AND p.payment_date <= ?`,
      [startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0]]
    );
    // Troškovi = iz vehicle_expenses (servis, gorivo, registracija...) + expense računi
    const [monthExpenses] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) as total FROM vehicle_expenses 
       WHERE expense_date >= ? AND expense_date <= ?`,
      [startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0]]
    );

    // --- OBAVEJŠTENJA (registracija, žuti karton, PP) ---
    const alertWindow = 30; // dana
    const [vehiclesAlerts] = await pool.execute(`
      SELECT id, manufacturer, model, license_plate, registration_date, yellow_card_date, pp_apparatus_date
      FROM vehicles
      WHERE 
        (registration_date IS NOT NULL AND registration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY))
        OR (yellow_card_date IS NOT NULL AND yellow_card_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY))
        OR (pp_apparatus_date IS NOT NULL AND pp_apparatus_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY))
    `, [alertWindow, alertWindow, alertWindow]);

    const notifications = [];
    for (const v of vehiclesAlerts) {
      const checkDate = (field, labelPrefix) => {
        if (!v[field]) return;
        const date = new Date(v[field]);
        const daysUntil = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
        let alertType = '';
        if (daysUntil < 0) alertType = `${labelPrefix}_EXPIRED`;
        else if (daysUntil <= alertWindow) alertType = `${labelPrefix}_EXPIRING`;
        else return;

        notifications.push({
          vehicle_id: v.id,
          manufacturer: v.manufacturer,
          model: v.model,
          license_plate: v.license_plate,
          alert_type: alertType,
          days_until: daysUntil,
          date: v[field]
        });
      };

      checkDate('registration_date', 'REGISTRATION');
      checkDate('yellow_card_date', 'YELLOW_CARD');
      checkDate('pp_apparatus_date', 'PP');
    }

    // Sortiraj po hitnosti (istekli prvo, pa oni što ističu uskoro)
    notifications.sort((a, b) => a.days_until - b.days_until);

    // --- NEDAVNI RAČUNI (ovaj mjesec) ---
    const [recentInvoicesMonth] = await pool.execute(
      `SELECT i.*, v.manufacturer, v.model, v.license_plate,
        COALESCE(SUM(p.amount), 0) as paid_amount
       FROM invoices i
       LEFT JOIN vehicles v ON i.vehicle_id = v.id
       LEFT JOIN invoice_payments p ON i.id = p.invoice_id
       WHERE i.created_at >= ? AND i.created_at <= ?
       GROUP BY i.id
       ORDER BY i.created_at DESC
       LIMIT 5`,
      [startOfMonth, endOfMonth]
    );

    // --- NADOLAZEĆI SERVISI (sljedećih 30 dana) ---
    const [upcomingServices] = await pool.execute(`
      SELECT s.*, v.manufacturer, v.model, v.license_plate
      FROM services s
      LEFT JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.service_date >= CURDATE() AND s.service_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      ORDER BY s.service_date ASC
      LIMIT 20
    `);

    // --- ZADNJE AKTIVNOSTI (s navigateTo linkom) ---
    const [recentVehicles] = await pool.execute(`
      SELECT 'vehicle' as type, CONCAT('Novo vozilo: ', manufacturer, ' ', model) as description, created_at, id as entity_id
      FROM vehicles ORDER BY created_at DESC LIMIT 3
    `);
    const [recentServices] = await pool.execute(`
      SELECT s.id, 'service' as type, CONCAT('Servis: ', s.service_type) as description, s.created_at, s.vehicle_id as entity_id, v.manufacturer, v.model
      FROM services s LEFT JOIN vehicles v ON s.vehicle_id = v.id ORDER BY s.created_at DESC LIMIT 3
    `);
    const [recentInvoices] = await pool.execute(`
      SELECT i.id, 'income' as type, CONCAT('Račun: ', i.invoice_number) as description, i.created_at, i.vehicle_id as entity_id, i.invoice_type
      FROM invoices i ORDER BY i.created_at DESC LIMIT 3
    `);
    const [recentDocuments] = await pool.execute(`
      SELECT 'document' as type, CONCAT('Dokument: ', title) as description, created_at, id as entity_id
      FROM documents ORDER BY created_at DESC LIMIT 3
    `);

    const recentActivity = [
      ...recentVehicles.map(v => ({ ...v, navigateTo: `/vehicles/${v.entity_id}` })),
      ...recentServices.map(s => ({ ...s, type: 'service', navigateTo: `/vehicles/${s.entity_id}` })),
      ...recentInvoices.map(i => ({ ...i, type: i.invoice_type === 'expense' ? 'expense' : 'income', navigateTo: i.entity_id ? `/vehicles/${i.entity_id}` : '/invoices' })),
      ...recentDocuments.map(d => ({ ...d, navigateTo: `/documents` }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);

    // --- RESPONS ---
    const stats = {
      vehicles: vehicles[0].count,
      availableVehicles: availableVehicles[0].count,
      occupiedVehicles: occupiedVehicles[0].count,
      completedServices: completedServices[0].count,
      activeServices: activeServices[0].count,
      scheduledServices: scheduledServices[0].count,
      unpaidInvoices: unpaidInvoices[0].count,
      partialInvoices: partialInvoices[0].count,
      unpaidTotal: parseFloat(unpaidInvoices[0].total || 0),
      partialTotal: parseFloat(partialInvoices[0].total || 0),
      totalDue: parseFloat(unpaidInvoices[0].total || 0) + parseFloat(partialInvoices[0].total || 0),
      totalIncome: parseFloat(monthIncome[0].total || 0),
      totalExpenses: parseFloat(monthExpenses[0].total || 0),
      monthProfit: parseFloat(monthIncome[0].total || 0) - parseFloat(monthExpenses[0].total || 0)
    };

    // --- TROŠKOVI PO KATEGORIJAMA (ovaj mjesec) ---
    const [expensesByCategory] = await pool.execute(
      `SELECT expense_type, COALESCE(SUM(amount), 0) as total
       FROM vehicle_expenses
       WHERE expense_date >= ? AND expense_date <= ?
       GROUP BY expense_type`,
      [startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0]]
    );

    // --- KILOMETRAŽA PO MJESECIMA (ova godina) ---
    const [mileageByMonth] = await pool.execute(
      `SELECT MONTH(recorded_date) as period, SUM(mileage) as total
       FROM mileage_logs
       WHERE YEAR(recorded_date) = ?
       GROUP BY MONTH(recorded_date)
       ORDER BY period ASC`,
      [today.getFullYear()]
    );

    // --- UKUPNA KILOMETRAŽA ---
    const [totalMileage] = await pool.execute(
      `SELECT COALESCE(SUM(mileage), 0) as total FROM mileage_logs`
    );

    res.json({
      stats,
      notifications,
      upcomingServices,
      recentActivity,
      recentInvoices: recentInvoicesMonth,
      expensesByCategory,
      mileageByMonth,
      totalMileage: totalMileage[0].total
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============================================
// ANALYTICS - prihodi i troškovi po periodu
// ============================================
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const { period, year, month } = req.query;
    const selectedYear = year ? parseInt(year) : new Date().getFullYear();

    let income = [];
    let expenses = [];

    if (period === 'week' && month) {
      // Po tjednima unutar mjeseca (1-5)
      const [incomeData] = await pool.execute(`
        SELECT CEIL(DAY(p.payment_date) / 7) as period, COALESCE(SUM(p.amount), 0) as total
        FROM invoice_payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.invoice_type = 'income' AND YEAR(p.payment_date) = ? AND MONTH(p.payment_date) = ?
        GROUP BY CEIL(DAY(p.payment_date) / 7)
        ORDER BY period ASC
      `, [selectedYear, month]);
      const [expenseData] = await pool.execute(`
        SELECT CEIL(DAY(expense_date) / 7) as period, COALESCE(SUM(amount), 0) as total
        FROM vehicle_expenses WHERE YEAR(expense_date) = ? AND MONTH(expense_date) = ?
        GROUP BY CEIL(DAY(expense_date) / 7)
        ORDER BY period ASC
      `, [selectedYear, month]);
      income = incomeData;
      expenses = expenseData;
    } else {
      // Po mjesecima (default) — prihod = SAMO uplaćeni iznosi
      const [incomeData] = await pool.execute(`
        SELECT MONTH(p.payment_date) as period, COALESCE(SUM(p.amount), 0) as total
        FROM invoice_payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.invoice_type = 'income' AND YEAR(p.payment_date) = ?
        GROUP BY MONTH(p.payment_date)
      `, [selectedYear]);
      const [expenseData] = await pool.execute(`
        SELECT MONTH(due_date) as period, COALESCE(SUM(amount), 0) as total
        FROM invoices WHERE invoice_type = 'expense' AND YEAR(due_date) = ?
        GROUP BY MONTH(due_date)
      `, [selectedYear]);
      income = incomeData;
      expenses = expenseData;
    }

    res.json({ income, expenses });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;

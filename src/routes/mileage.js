const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// ============================================
// GET /api/mileage/:vehicleId - Historija kilometraže
// ============================================
router.get('/vehicle/:vehicleId', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { limit = 50 } = req.query;
    
    const [logs] = await pool.execute(
      `SELECT ml.*, u.name as created_by_name
       FROM mileage_logs ml
       LEFT JOIN users u ON ml.created_by = u.id
       WHERE ml.vehicle_id = ?
       ORDER BY ml.recorded_date DESC, ml.created_at DESC
       LIMIT ?`,
      [vehicleId, parseInt(limit)]
    );
    
    res.json(logs);
  } catch (error) {
    console.error('Mileage history error:', error);
    res.status(500).json({ error: 'Failed to fetch mileage history' });
  }
});

// ============================================
// POST /api/mileage - Unos nove kilometraže
// ============================================
router.post('/', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { vehicle_id, recorded_date, mileage, source = 'manual', notes } = req.body;
    
    if (!vehicle_id || !recorded_date || !mileage) {
      return res.status(400).json({ error: 'vehicle_id, recorded_date i mileage su obavezni' });
    }
    
    const mileageNum = parseInt(mileage);
    if (isNaN(mileageNum) || mileageNum < 0) {
      return res.status(400).json({ error: 'Kilometraža mora biti pozitivan broj' });
    }
    
    // Provjera da nova kilometraža nije manja od zadnje unesene
    const [[lastLog]] = await pool.execute(
      'SELECT mileage FROM mileage_logs WHERE vehicle_id = ? ORDER BY recorded_date DESC, mileage DESC LIMIT 1',
      [vehicle_id]
    );
    
    if (lastLog && mileageNum < lastLog.mileage) {
      return res.status(400).json({ 
        error: 'Nova kilometraža ne može biti manja od zadnje unesene',
        last_mileage: lastLog.mileage,
        provided_mileage: mileageNum
      });
    }
    
    const [result] = await pool.execute(
      `INSERT INTO mileage_logs (vehicle_id, recorded_date, mileage, source, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [vehicle_id, recorded_date, mileageNum, source, notes || null, req.user.id]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Kilometraža zabilježena',
      mileage: mileageNum
    });
    
  } catch (error) {
    console.error('Mileage insert error:', error);
    res.status(500).json({ error: 'Failed to save mileage' });
  }
});

// ============================================
// GET /api/mileage/:vehicleId/stats - Statistika i predikcija
// ============================================
router.get('/vehicle/:vehicleId/stats', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { vehicleId } = req.params;
    
    const [[latest]] = await pool.execute(
      'SELECT * FROM mileage_logs WHERE vehicle_id = ? ORDER BY recorded_date DESC LIMIT 1',
      [vehicleId]
    );
    
    const [[first]] = await pool.execute(
      'SELECT * FROM mileage_logs WHERE vehicle_id = ? ORDER BY recorded_date ASC LIMIT 1',
      [vehicleId]
    );
    
    const [[count]] = await pool.execute(
      'SELECT COUNT(*) as total FROM mileage_logs WHERE vehicle_id = ?',
      [vehicleId]
    );
    
    let avgDailyKm = 0;
    let daysDiff = 0;
    
    if (latest && first && count.total > 1) {
      const d1 = new Date(first.recorded_date);
      const d2 = new Date(latest.recorded_date);
      daysDiff = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
      const kmDiff = latest.mileage - first.mileage;
      avgDailyKm = Math.round(kmDiff / daysDiff);
    }
    
    // Aktivni intervali servisa
    const [intervals] = await pool.execute(
      `SELECT * FROM service_intervals 
       WHERE vehicle_id = ? AND active = 1
       ORDER BY interval_km ASC`,
      [vehicleId]
    );
    
    const predictions = intervals.map(interval => {
      const remainingKm = Math.max(0, (interval.last_service_mileage + interval.interval_km) - (latest?.mileage || 0));
      const daysUntilService = avgDailyKm > 0 ? Math.ceil(remainingKm / avgDailyKm) : null;
      const estimatedDate = daysUntilService 
        ? new Date(Date.now() + daysUntilService * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;
      
      return {
        ...interval,
        current_mileage: latest?.mileage || 0,
        remaining_km: remainingKm,
        avg_daily_km: avgDailyKm,
        days_until_service: daysUntilService,
        estimated_service_date: estimatedDate,
        status: remainingKm < 1000 ? 'critical' : remainingKm < 3000 ? 'warning' : 'ok'
      };
    });
    
    res.json({
      total_entries: count.total,
      latest_entry: latest || null,
      first_entry: first || null,
      avg_daily_km: avgDailyKm,
      days_tracked: daysDiff,
      predictions
    });
    
  } catch (error) {
    console.error('Mileage stats error:', error);
    res.status(500).json({ error: 'Failed to fetch mileage stats' });
  }
});

// ============================================
// PUT /api/mileage/:id - Uredi zapis
// ============================================
router.put('/:id', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { recorded_date, mileage, notes } = req.body;
    const mileageNum = parseInt(mileage);
    
    const [[current]] = await pool.execute(
      'SELECT * FROM mileage_logs WHERE id = ?', [req.params.id]
    );
    
    if (!current) return res.status(404).json({ error: 'Zapis nije pronađen' });
    
    const [[prev]] = await pool.execute(
      `SELECT mileage FROM mileage_logs 
       WHERE vehicle_id = ? AND recorded_date < ? 
       ORDER BY recorded_date DESC, mileage DESC LIMIT 1`,
      [current.vehicle_id, recorded_date || current.recorded_date]
    );
    
    const [[next]] = await pool.execute(
      `SELECT mileage FROM mileage_logs 
       WHERE vehicle_id = ? AND recorded_date > ? 
       ORDER BY recorded_date ASC, mileage ASC LIMIT 1`,
      [current.vehicle_id, recorded_date || current.recorded_date]
    );
    
    if (prev && mileageNum < prev.mileage) {
      return res.status(400).json({ error: `Ne može biti manje od prethodne: ${prev.mileage} km` });
    }
    if (next && mileageNum > next.mileage) {
      return res.status(400).json({ error: `Ne može biti više od sljedeće: ${next.mileage} km` });
    }
    
    await pool.execute(
      'UPDATE mileage_logs SET recorded_date = ?, mileage = ?, notes = ? WHERE id = ?',
      [recorded_date || current.recorded_date, mileageNum, notes || current.notes, req.params.id]
    );
    
    res.json({ message: 'Zapis ažuriran' });
    
  } catch (error) {
    console.error('Mileage update error:', error);
    res.status(500).json({ error: 'Failed to update mileage' });
  }
});

// ============================================
// DELETE /api/mileage/:id - Obriši zapis
// ============================================
router.delete('/:id', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    await pool.execute('DELETE FROM mileage_logs WHERE id = ?', [req.params.id]);
    res.json({ message: 'Zapis obrisan' });
  } catch (error) {
    console.error('Mileage delete error:', error);
    res.status(500).json({ error: 'Failed to delete mileage' });
  }
});

// ============================================
// POST /api/mileage/intervals - Dodaj interval servisa
// ============================================
router.post('/intervals', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { vehicle_id, interval_km, interval_months, last_service_mileage, last_service_date, description } = req.body;
    
    const [result] = await pool.execute(
      `INSERT INTO service_intervals (vehicle_id, interval_km, interval_months, last_service_mileage, last_service_date, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [vehicle_id, interval_km || 15000, interval_months || 12, last_service_mileage || 0, last_service_date || null, description || 'Redovan servis']
    );
    
    res.status(201).json({ id: result.insertId, message: 'Interval servisa dodan' });
  } catch (error) {
    console.error('Interval insert error:', error);
    res.status(500).json({ error: 'Failed to add service interval' });
  }
});

// ============================================
// PUT /api/mileage/intervals/:id - Ažuriraj interval servisa
// ============================================
router.put('/intervals/:id', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const { interval_km, interval_months, last_service_mileage, last_service_date, description, active } = req.body;
    
    await pool.execute(
      `UPDATE service_intervals 
       SET interval_km = ?, interval_months = ?, last_service_mileage = ?, 
           last_service_date = ?, description = ?, active = ?
       WHERE id = ?`,
      [interval_km, interval_months, last_service_mileage, last_service_date, description, active, req.params.id]
    );
    
    res.json({ message: 'Interval ažuriran' });
  } catch (error) {
    console.error('Interval update error:', error);
    res.status(500).json({ error: 'Failed to update service interval' });
  }
});

module.exports = router;

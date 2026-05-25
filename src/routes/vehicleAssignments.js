const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize, authorizeEntity } = require('../middleware/auth');
const router = express.Router();

// Dohvati povijest zaduživanja za vozilo
router.get('/vehicle/:vehicleId', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [assignments] = await pool.execute(
      `SELECT va.*, 
        u.name as user_name, 
        u.phone as user_phone,
        (va.end_mileage - va.start_mileage) as distance_driven
       FROM vehicle_assignments va
       LEFT JOIN users u ON va.user_id = u.id
       WHERE va.vehicle_id = ?
       ORDER BY va.assigned_at DESC`,
      [req.params.vehicleId]
    );
    res.json(assignments);
  } catch (error) {
    console.error('Fetch assignments error:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// Dohvati trenutno zaduženje (aktivno)
router.get('/vehicle/:vehicleId/current', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [assignments] = await pool.execute(
      `SELECT va.*, u.name as user_name, u.phone as user_phone
       FROM vehicle_assignments va
       LEFT JOIN users u ON va.user_id = u.id
       WHERE va.vehicle_id = ? AND va.returned_at IS NULL
       ORDER BY va.assigned_at DESC
       LIMIT 1`,
      [req.params.vehicleId]
    );
    res.json(assignments[0] || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch current assignment' });
  }
});

// Zaduži vozilo (novo zaduženje)
router.post('/', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.edit']), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { vehicle_id, user_id, start_mileage, notes } = req.body;

    // Provjeri je li vozilo već zaduženo
    const [current] = await connection.execute(
      'SELECT id FROM vehicle_assignments WHERE vehicle_id = ? AND returned_at IS NULL',
      [vehicle_id]
    );

    if (current.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'Vehicle is already assigned. Return it first.' });
    }

    // Provjeri postoji li vozilo
    const [vehicle] = await connection.execute(
      'SELECT mileage FROM vehicles WHERE id = ?',
      [vehicle_id]
    );

    if (vehicle.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Umetni novo zaduženje
    const [result] = await connection.execute(
      `INSERT INTO vehicle_assignments 
        (vehicle_id, user_id, assigned_at, start_mileage, notes, created_by) 
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [vehicle_id, user_id, start_mileage || vehicle[0].mileage, notes || null, req.user.id]
    );

    // Ažuriraj vehicles.assigned_to
    await connection.execute(
      'UPDATE vehicles SET assigned_to = ? WHERE id = ?',
      [user_id, vehicle_id]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Vehicle assigned successfully' 
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Assign vehicle error:', error);
    res.status(500).json({ error: 'Failed to assign vehicle' });
  }
});

// Razduži vozilo
router.put('/:id/return', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.edit']), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { end_mileage, notes } = req.body;

    // Provjeri postoji li zaduženje
    const [assignment] = await connection.execute(
      'SELECT * FROM vehicle_assignments WHERE id = ? AND returned_at IS NULL',
      [req.params.id]
    );

    if (assignment.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Active assignment not found' });
    }

    const startMileage = assignment[0].start_mileage || 0;
    const endMileageNum = parseInt(end_mileage) || 0;

    if (endMileageNum < startMileage) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ 
        error: `End mileage (${endMileageNum}) cannot be less than start mileage (${startMileage})` 
      });
    }

    if (end_mileage && end_mileage > 0) {
  await connection.execute(
    `INSERT INTO mileage_logs (vehicle_id, recorded_date, mileage, source, notes, created_by)
     VALUES (?, CURDATE(), ?, 'return', ?, ?)`,
    [
      assignment.vehicle_id,
      end_mileage,
      notes ? `Vraćanje: ${notes}` : `Vraćanje vozila`,
      req.user.id
    ]
  );
}

    // Ažuriraj zaduženje
    await connection.execute(
      `UPDATE vehicle_assignments 
       SET returned_at = NOW(), end_mileage = ?, notes = CONCAT(COALESCE(notes, ''), '\nReturn notes: ', ?)
       WHERE id = ?`,
      [endMileageNum, notes || 'No notes', req.params.id]
    );

    // Ažuriraj vehicles.assigned_to na NULL
    await connection.execute(
      'UPDATE vehicles SET assigned_to = NULL, mileage = ? WHERE id = ?',
      [endMileageNum, assignment[0].vehicle_id]
    );

    await connection.commit();
    connection.release();

    res.json({ 
      message: 'Vehicle returned successfully',
      distance_driven: endMileageNum - startMileage
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Return vehicle error:', error);
    res.status(500).json({ error: 'Failed to return vehicle' });
  }
});

// Obriši zapis iz povijesti (samo admin)
router.delete('/:id', authenticate, authorizeEntity('vehicles'), authorize(['vehicles.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM vehicle_assignments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Assignment record deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// Statistika po korisniku
router.get('/user/:userId/stats', authenticate, authorizeEntity('vehicles'), async (req, res) => {
  try {
    const [stats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_assignments,
        SUM(CASE WHEN returned_at IS NOT NULL THEN 1 ELSE 0 END) as completed_assignments,
        SUM(CASE WHEN returned_at IS NULL THEN 1 ELSE 0 END) as active_assignments,
        COALESCE(SUM(end_mileage - start_mileage), 0) as total_distance
       FROM vehicle_assignments
       WHERE user_id = ?`,
      [req.params.userId]
    );
    res.json(stats[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;

/**
 * Lead assignment endpoints (admin only, see routes/leads.js)
 */
const { pool } = require('../db/pool')
const {
  getCounsellorStats, pickCounsellor, autoAssignLead, assignAllUnassigned, logAssignment,
} = require('../services/leadAssignment')

// GET /api/leads/counsellors
async function listCounsellors(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { counsellors, schoolRate } = await getCounsellorStats(schoolId)
    const { ranked } = pickCounsellor(counsellors.filter(c => c.counsellor_available), schoolRate)
    const rateOf = {}; ranked.forEach(r => { rateOf[r.id] = r.rate })

    const [[sch]]  = await pool.execute('SELECT auto_assign_leads FROM schools WHERE id = ?', [schoolId])
    const [[un]]   = await pool.execute(
      `SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND assigned_to IS NULL AND status IN ('New','Contacted','Campus Visit')`, [schoolId])
    // everyone who could be made a counsellor
    const [people] = await pool.execute(
      `SELECT id, name, role, is_counsellor FROM users WHERE school_id=? AND is_active=1 ORDER BY name`, [schoolId])

    res.json({
      auto_assign: !!(sch && sch.auto_assign_leads),
      unassigned_open: un.c,
      school_rate: Math.round(schoolRate * 1000) / 10,
      counsellors: counsellors.map(c => {
        const r = rateOf[c.id]
        return {
          id: c.id, name: c.name, email: c.email, role: c.role, available: !!c.counsellor_available,
          total: c.total, admitted: c.admitted, open: c.open,
          conversion_pct: c.total ? Math.round((c.admitted / c.total) * 1000) / 10 : null,
          weight_pct: r != null ? Math.round(r * 1000) / 10 : null,   // smoothed rate used for sharing
        }
      }),
      people,
    })
  } catch (err) { next(err) }
}

// PUT /api/leads/counsellors/settings   body: { auto_assign: bool }
async function updateSettings(req, res, next) {
  try {
    await pool.execute('UPDATE schools SET auto_assign_leads = ? WHERE id = ?',
      [req.body.auto_assign ? 1 : 0, req.user.school_id])
    res.json({ auto_assign: !!req.body.auto_assign })
  } catch (err) { next(err) }
}

// PUT /api/leads/counsellors/:userId   body: { is_counsellor?, available?, redistribute? }
async function updateCounsellor(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[u]] = await pool.execute('SELECT id FROM users WHERE id=? AND school_id=? AND is_active=1', [req.params.userId, schoolId])
    if (!u) return res.status(404).json({ message: 'User not found' })

    const { is_counsellor, available, redistribute } = req.body
    await pool.execute(
      `UPDATE users SET is_counsellor = COALESCE(?, is_counsellor), counsellor_available = COALESCE(?, counsellor_available)
       WHERE id = ? AND school_id = ?`,
      [is_counsellor === undefined ? null : (is_counsellor ? 1 : 0),
       available === undefined ? null : (available ? 1 : 0),
       u.id, schoolId])

    // Optionally move this person's open leads to the remaining counsellors
    let moved = 0
    const nowOut = is_counsellor === false || available === false
    if (redistribute && nowOut) {
      const [open] = await pool.execute(
        `SELECT id FROM leads WHERE school_id=? AND assigned_to=? AND status IN ('New','Contacted','Campus Visit')`,
        [schoolId, u.id])
      for (const l of open) {
        const r = await autoAssignLead(l.id, schoolId, { force: true, by: req.user.id, reason: 'Counsellor unavailable' })
        if (r) moved++
      }
    }
    res.json({ success: true, redistributed: moved })
  } catch (err) { next(err) }
}

// PUT /api/leads/:id/assign   body: { user_id: number | null, auto?: true }
async function assignLead(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const leadId = parseInt(req.params.id)
    const [[lead]] = await pool.execute('SELECT id, assigned_to FROM leads WHERE id=? AND school_id=?', [leadId, schoolId])
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    // "Pick for me": let the conversion-rate logic choose
    if (req.body.auto) {
      const r = await autoAssignLead(leadId, schoolId, { force: true, by: req.user.id, reason: 'Admin re-ran auto assign' })
      if (!r) return res.status(409).json({ message: 'No available counsellor. Mark some staff as counsellors first.' })
      return res.json({ assigned_to: r.assigned_to, assigned_name: r.name, method: 'auto' })
    }

    const userId = req.body.user_id === null || req.body.user_id === '' ? null : parseInt(req.body.user_id)
    if (userId !== null) {
      const [[u]] = await pool.execute('SELECT id, name FROM users WHERE id=? AND school_id=? AND is_active=1', [userId, schoolId])
      if (!u) return res.status(400).json({ message: 'That user is not an active member of this school' })
    }
    await pool.execute(
      `UPDATE leads SET assigned_to=?, assigned_at=NOW(), assigned_by=?, assign_method='manual' WHERE id=? AND school_id=?`,
      [userId, req.user.id, leadId, schoolId])
    await logAssignment({ schoolId, leadId, from: lead.assigned_to, to: userId, method: 'manual', by: req.user.id,
      reason: userId ? 'Admin assigned' : 'Admin unassigned' })
    await pool.execute('INSERT INTO lead_interactions (lead_id, user_id, type, notes) VALUES (?,?,?,?)',
      [leadId, req.user.id, 'Assignment', userId ? 'Lead assigned by admin' : 'Lead unassigned by admin'])

    const [[n]] = userId ? await pool.execute('SELECT name FROM users WHERE id=?', [userId]) : [[null]]
    res.json({ assigned_to: userId, assigned_name: n ? n.name : null, method: 'manual' })
  } catch (err) { next(err) }
}

// POST /api/leads/assign-unassigned
async function assignUnassigned(req, res, next) {
  try {
    res.json(await assignAllUnassigned(req.user.school_id, req.user.id))
  } catch (err) { next(err) }
}

// GET /api/leads/:id/assignments  (history)
async function assignmentHistory(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.method, a.reason, a.created_at, f.name AS from_name, t.name AS to_name, b.name AS by_name
       FROM lead_assignments a
       LEFT JOIN users f ON f.id = a.from_user
       LEFT JOIN users t ON t.id = a.to_user
       LEFT JOIN users b ON b.id = a.by_user
       WHERE a.lead_id = ? AND a.school_id = ? ORDER BY a.id DESC LIMIT 50`,
      [req.params.id, req.user.school_id])
    res.json(rows)
  } catch (err) { next(err) }
}

// GET /api/leads/counsellors/:userId/leads?scope=open|all
async function counsellorLeads(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[u]] = await pool.execute('SELECT id, name FROM users WHERE id=? AND school_id=?', [req.params.userId, schoolId])
    if (!u) return res.status(404).json({ message: 'User not found' })
    const openOnly = req.query.scope !== 'all'
    const [leads] = await pool.execute(
      `SELECT id, parent_name, phone, child_grade, status, ai_label, ai_score, assigned_at, created_at
       FROM leads WHERE school_id=? AND assigned_to=? ${openOnly ? "AND status IN ('New','Contacted','Campus Visit')" : ''}
       ORDER BY created_at DESC LIMIT 300`, [schoolId, u.id])
    res.json({ counsellor: u, leads })
  } catch (err) { next(err) }
}

// PUT /api/leads/assign-bulk   body: { lead_ids: [..], user_id }   (target must be a counsellor)
async function assignBulk(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const ids = Array.isArray(req.body.lead_ids) ? req.body.lead_ids.map(n => parseInt(n)).filter(Boolean).slice(0, 300) : []
    const userId = parseInt(req.body.user_id)
    if (!ids.length || !userId) return res.status(400).json({ message: 'lead_ids and user_id are required' })
    const [[t]] = await pool.execute(
      'SELECT id FROM users WHERE id=? AND school_id=? AND is_active=1 AND is_counsellor=1', [userId, schoolId])
    if (!t) return res.status(400).json({ message: 'Choose an active counsellor' })

    const [leads] = await pool.query('SELECT id, assigned_to FROM leads WHERE id IN (?) AND school_id=?', [ids, schoolId])
    let moved = 0
    for (const l of leads) {
      if (l.assigned_to === userId) continue
      await pool.execute(
        `UPDATE leads SET assigned_to=?, assigned_at=NOW(), assigned_by=?, assign_method='manual' WHERE id=? AND school_id=?`,
        [userId, req.user.id, l.id, schoolId])
      await logAssignment({ schoolId, leadId: l.id, from: l.assigned_to, to: userId, method: 'manual', by: req.user.id, reason: 'Admin moved lead' })
      moved++
    }
    res.json({ moved })
  } catch (err) { next(err) }
}

module.exports = { counsellorLeads, assignBulk, listCounsellors, updateSettings, updateCounsellor, assignLead, assignUnassigned, assignmentHistory }
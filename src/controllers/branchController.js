/**
 * EnrollIQ — Branches (school groups)
 * Save as:  src/controllers/branchController.js
 *
 * A school's group_id is NULL until it's deliberately grouped with other
 * branches — group_id is never set to equal the school's own id. So "this
 * school has no group_id yet" must be handled as its own group of exactly
 * one, resolved by WHERE id=?, NOT by querying WHERE group_id=<its own id>
 * (which would always return zero rows, since no row's group_id is ever
 * actually set to that value).
 */
const { pool } = require('../db/pool')

// Returns { groupId, homeSchoolId }. groupId is null when the school has no
// group_id set — callers must then resolve via homeSchoolId directly.
async function resolveGroup(homeSchoolId) {
  const [[home]] = await pool.execute('SELECT group_id FROM schools WHERE id=?', [homeSchoolId])
  return { groupId: home?.group_id || null, homeSchoolId }
}

// GET /api/branches/mine — branches the logged-in admin can access (same group)
async function myBranches(req, res, next) {
  try {
    const [[me]] = await pool.execute(
      'SELECT school_id, active_school_id FROM users WHERE id=?', [req.user.id])
    const { groupId, homeSchoolId } = await resolveGroup(me.school_id)

    const [branches] = groupId
      ? await pool.execute(
          `SELECT id, name, city, is_main_branch FROM schools WHERE group_id=? ORDER BY is_main_branch DESC, name`,
          [groupId])
      : await pool.execute(
          `SELECT id, name, city, is_main_branch FROM schools WHERE id=?`, [homeSchoolId])

    res.json({
      branches,
      active_school_id: me.active_school_id || me.school_id,
      count: branches.length,
    })
  } catch (err) { next(err) }
}

// PUT /api/branches/switch — set the admin's active branch
async function switchBranch(req, res, next) {
  try {
    const { school_id } = req.body
    if (!school_id) return res.status(400).json({ message: 'school_id required' })

    const [[me]] = await pool.execute('SELECT school_id FROM users WHERE id=?', [req.user.id])
    const { groupId, homeSchoolId } = await resolveGroup(me.school_id)

    const [[target]] = groupId
      ? await pool.execute('SELECT id FROM schools WHERE id=? AND group_id=?', [school_id, groupId])
      : await pool.execute('SELECT id FROM schools WHERE id=? AND id=?', [school_id, homeSchoolId])
    if (!target) return res.status(403).json({ message: 'That branch is not in your group' })

    await pool.execute('UPDATE users SET active_school_id=? WHERE id=?', [school_id, req.user.id])
    res.json({ message: 'Branch switched', active_school_id: school_id })
  } catch (err) { next(err) }
}

// POST /api/branches — create a new branch in the admin's group (enterprise admin)
async function createBranch(req, res, next) {
  try {
    const { name, city, board } = req.body
    if (!name) return res.status(400).json({ message: 'Branch name required' })

    const homeSchoolId = req.user.home_school_id || req.user.school_id
    const { groupId: existingGroupId } = await resolveGroup(homeSchoolId)

    // The group's plan = the MAIN branch's plan. Only enterprise groups may add branches.
    // If this school has no group yet, IT is the main branch — check its own plan directly.
    const [[main]] = existingGroupId
      ? await pool.execute(
          'SELECT subscription_plan FROM schools WHERE group_id=? ORDER BY is_main_branch DESC, id ASC LIMIT 1',
          [existingGroupId])
      : await pool.execute('SELECT subscription_plan FROM schools WHERE id=?', [homeSchoolId])
    if ((main?.subscription_plan || 'basic') !== 'enterprise')
      return res.status(403).json({ message: 'Branches are available on the Enterprise plan.' })

    // First branch ever added to a previously ungrouped school: give that
    // school its own real group_id (its own id doubles as the group id from
    // here on — this is the ONE place that's ever actually written to the
    // database, which is why nothing else may assume it without checking).
    let groupId = existingGroupId
    if (!groupId) {
      groupId = homeSchoolId
      await pool.execute('UPDATE schools SET group_id=? WHERE id=?', [groupId, homeSchoolId])
    }

    const [r] = await pool.execute(
      `INSERT INTO schools (name, city, board, group_id, is_main_branch, subscription_plan, subscription_status, status, created_at)
       VALUES (?,?,?,?,0,'enterprise','active','active',NOW())`,
      [name, city || null, board || null, groupId])

    res.status(201).json({ message: 'Branch created', school_id: r.insertId })
  } catch (err) { next(err) }
}


// GET /api/branches/overview — chairman only: one row per branch in the group, plus group totals.
// Always reads the HOME school's group, never the branch currently switched into.
async function overview(req, res, next) {
  try {
    const homeSchoolId = req.user.home_school_id || req.user.school_id
    const { groupId } = await resolveGroup(homeSchoolId)
    const [branches] = groupId
      ? await pool.execute('SELECT id, name, city, is_main_branch FROM schools WHERE group_id=? ORDER BY is_main_branch DESC, name', [groupId])
      : await pool.execute('SELECT id, name, city, is_main_branch FROM schools WHERE id=?', [homeSchoolId])
    const ids = branches.map(b => b.id)
    const ph = ids.map(() => '?').join(',')
    // IST date computed in JS (CURDATE uses the server timezone)
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    const by = (rows, key = 'school_id') => Object.fromEntries(rows.map(r => [r[key], r]))

    const [leads] = await pool.execute(
      `SELECT school_id, COUNT(*) total, SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) last30
       FROM leads WHERE school_id IN (${ph}) GROUP BY school_id`, ids)
    const [adm] = await pool.execute(
      `SELECT school_id, COUNT(*) admitted FROM admissions WHERE school_id IN (${ph}) AND status='Admitted' GROUP BY school_id`, ids)
    const [stu] = await pool.execute(
      `SELECT school_id, COUNT(*) students FROM students WHERE school_id IN (${ph}) AND (archived=0 OR archived IS NULL) GROUP BY school_id`, ids)
    const [fee] = await pool.execute(
      `SELECT school_id, COALESCE(SUM(paid_amount),0) collected,
              COALESCE(SUM(CASE WHEN status IN ('Pending','Partial','Overdue') THEN amount-paid_amount ELSE 0 END),0) pending,
              COALESCE(SUM(CASE WHEN status='Overdue' THEN amount-paid_amount ELSE 0 END),0) overdue
       FROM payments WHERE school_id IN (${ph}) GROUP BY school_id`, ids)
    const [att] = await pool.execute(
      `SELECT school_id, COUNT(*) marked, SUM(status='Present') present
       FROM class_attendance WHERE school_id IN (${ph}) AND date=? GROUP BY school_id`, [...ids, today])

    const L = by(leads), A = by(adm), S = by(stu), F = by(fee), T = by(att)
    const rows = branches.map(b => {
      const l = L[b.id] || {}, a = A[b.id] || {}, s = S[b.id] || {}, f = F[b.id] || {}, t = T[b.id] || {}
      const totalLeads = Number(l.total || 0), admitted = Number(a.admitted || 0)
      return {
        id: b.id, name: b.name, city: b.city, is_main_branch: !!b.is_main_branch,
        leads: totalLeads, leads_30d: Number(l.last30 || 0), admitted,
        conversion: totalLeads ? Math.round((admitted / totalLeads) * 1000) / 10 : 0,
        students: Number(s.students || 0),
        fee_collected: Number(f.collected || 0), fee_pending: Number(f.pending || 0), fee_overdue: Number(f.overdue || 0),
        attendance_marked: Number(t.marked || 0),
        attendance_pct: t.marked ? Math.round((Number(t.present) / Number(t.marked)) * 1000) / 10 : null,
      }
    })
    const sum = k => rows.reduce((n, r) => n + r[k], 0)
    const totals = {
      branches: rows.length, leads: sum('leads'), leads_30d: sum('leads_30d'), admitted: sum('admitted'),
      students: sum('students'), fee_collected: sum('fee_collected'), fee_pending: sum('fee_pending'), fee_overdue: sum('fee_overdue'),
      conversion: sum('leads') ? Math.round((sum('admitted') / sum('leads')) * 1000) / 10 : 0,
    }
    res.json({ totals, branches: rows, date: today })
  } catch (err) { next(err) }
}

module.exports = { myBranches, switchBranch, createBranch, overview }
/**
 * EnrollIQ — Group (Chairman) Dashboard
 * ---------------------------------------------------------------
 * Save as:  src/controllers/groupDashboardController.js
 *
 * A chairman sits ABOVE branch admins — instead of one school_id, they
 * see every branch that shares their group_id, side by side, plus the
 * totals across all of them. One chairman user per group is enough;
 * their own `school_id` just needs to point at any branch in that group
 * (normally the main branch) so login/JWT plumbing needs no changes.
 *
 * Read-only. Editing a branch's data still happens by switching into
 * that branch (POST /api/branches/switch) and using the normal admin
 * screens — this controller never writes to school data.
 */
const { pool } = require('../db/pool')

// Returns { groupId, homeSchoolId }. groupId is null for a school with no group_id set —
// callers must then treat homeSchoolId as a group of exactly one (group_id is never
// actually written to equal a school's own id, so querying WHERE group_id=<id> would
// silently return nothing for an ungrouped school).
async function myGroup(userId) {
  const [[me]] = await pool.execute('SELECT school_id FROM users WHERE id=?', [userId])
  if (!me) return null
  const [[home]] = await pool.execute('SELECT group_id FROM schools WHERE id=?', [me.school_id])
  return { groupId: home?.group_id || null, homeSchoolId: me.school_id }
}

async function branchesForUser(userId) {
  const g = await myGroup(userId)
  if (!g) return []
  const [rows] = g.groupId
    ? await pool.execute(`SELECT id, name, city, is_main_branch FROM schools WHERE group_id=? ORDER BY is_main_branch DESC, name`, [g.groupId])
    : await pool.execute(`SELECT id, name, city, is_main_branch FROM schools WHERE id=?`, [g.homeSchoolId])
  return rows
}

// GET /api/group/overview — every branch, side by side, plus group totals
async function getOverview(req, res, next) {
  try {
    const branches = await branchesForUser(req.user.id)
    if (!branches.length) return res.json({ branches: [], totals: null })

    const ids = branches.map(b => b.id)
    const ph = ids.map(() => '?').join(',')

    // One query per metric across ALL branches at once (grouped by school_id),
    // rather than N queries per branch — this stays fast as branch count grows.
    const [leadRows] = await pool.query(
      `SELECT school_id,
              COUNT(*) AS enquiries_30d,
              SUM(status='Admission') AS admissions_30d
       FROM leads WHERE school_id IN (${ph}) AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY school_id`, ids)

    const [studentRows] = await pool.query(
      `SELECT school_id, COUNT(*) AS active_students
       FROM students WHERE school_id IN (${ph}) AND status='Active' GROUP BY school_id`, ids)

    const [feeRows] = await pool.query(
      `SELECT school_id,
              COALESCE(SUM(paid_amount),0) AS collected_mtd,
              COALESCE(SUM(CASE WHEN status IN ('Pending','Partial','Overdue') THEN amount-paid_amount ELSE 0 END),0) AS pending
       FROM payments
       WHERE school_id IN (${ph}) AND MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())
       GROUP BY school_id`, ids)

    // Best available counsellor comparison today: leads assigned + their conversion rate.
    // (No dedicated response-time/activity tracking exists yet — this reflects that honestly
    // rather than inventing numbers; see the accompanying report for what a fuller version needs.)
    const [counsellorRows] = await pool.query(
      `SELECT l.school_id, u.id AS user_id, u.name,
              COUNT(*) AS leads_assigned,
              SUM(l.status='Admission') AS admissions,
              SUM(l.status='Lost') AS lost
       FROM leads l JOIN users u ON u.id = l.assigned_to
       WHERE l.school_id IN (${ph}) AND l.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY l.school_id, u.id, u.name
       ORDER BY admissions DESC`, ids)

    const byId = k => rows => Object.fromEntries(rows.map(r => [r.school_id, r]))
    const leadsById = byId()(leadRows), studentsById = byId()(studentRows), feesById = byId()(feeRows)
    const counsellorsByBranch = {}
    for (const c of counsellorRows) (counsellorsByBranch[c.school_id] ||= []).push({
      user_id: c.user_id, name: c.name, leads_assigned: c.leads_assigned,
      admissions: Number(c.admissions), lost: Number(c.lost),
      conversion_pct: c.leads_assigned ? Math.round((Number(c.admissions) / c.leads_assigned) * 1000) / 10 : 0,
    })

    let tEnq = 0, tAdm = 0, tStu = 0, tCollected = 0, tPending = 0

    const rows = branches.map(b => {
      const l = leadsById[b.id] || { enquiries_30d: 0, admissions_30d: 0 }
      const s = studentsById[b.id] || { active_students: 0 }
      const f = feesById[b.id] || { collected_mtd: 0, pending: 0 }
      const enq = Number(l.enquiries_30d) || 0, adm = Number(l.admissions_30d) || 0
      tEnq += enq; tAdm += adm; tStu += Number(s.active_students) || 0
      tCollected += Number(f.collected_mtd) || 0; tPending += Number(f.pending) || 0
      return {
        school_id: b.id, name: b.name, city: b.city, is_main_branch: !!b.is_main_branch,
        enquiries_30d: enq, admissions_30d: adm,
        conversion_pct: enq ? Math.round((adm / enq) * 1000) / 10 : 0,
        active_students: Number(s.active_students) || 0,
        fees_collected_mtd: Number(f.collected_mtd) || 0, fees_pending: Number(f.pending) || 0,
        counsellors: counsellorsByBranch[b.id] || [],
      }
    })

    res.json({
      branches: rows,
      totals: {
        branch_count: rows.length,
        enquiries_30d: tEnq, admissions_30d: tAdm,
        conversion_pct: tEnq ? Math.round((tAdm / tEnq) * 1000) / 10 : 0,
        active_students: tStu, fees_collected_mtd: tCollected, fees_pending: tPending,
      },
    })
  } catch (e) { next(e) }
}

// GET /api/group/branches — light list for a "switch & view" picker (reuses /api/branches/mine's logic, kept separate so this module has no other dependency)
async function listBranches(req, res, next) {
  try {
    res.json(await branchesForUser(req.user.id))
  } catch (e) { next(e) }
}

module.exports = { getOverview, listBranches, branchesForUser }
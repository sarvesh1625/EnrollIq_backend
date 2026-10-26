/**
 * EnrollIQ - Lead counsellor assignment
 *
 * A new lead goes to the counsellor with the biggest "deficit": the gap between the
 * share of open leads they SHOULD hold (proportional to their lead-to-admission
 * conversion rate) and what they hold now. So better converters get more leads,
 * but nobody is flooded, and a brand-new counsellor still gets a fair start.
 */
const { pool } = require('../db/pool')

const PRIOR_WEIGHT = 5          // a counsellor is treated as having 5 "average" leads before real data
const FALLBACK_RATE = 0.10      // used when the school has no history at all
const WINDOW_DAYS = 365         // only recent history counts
const OPEN_STATUSES = ['New', 'Contacted', 'Campus Visit']

// Pure function (easy to test): stats = [{ id, total, admitted, open }]
// Returns the same list with `rate` added, and the picked counsellor id.
function pickCounsellor(stats, schoolRate = FALLBACK_RATE) {
  if (!stats.length) return { picked: null, ranked: [] }
  const withRate = stats.map(s => ({
    ...s,
    rate: (s.admitted + PRIOR_WEIGHT * schoolRate) / (s.total + PRIOR_WEIGHT),
  }))
  const rateSum  = withRate.reduce((a, s) => a + s.rate, 0)
  const openSum  = withRate.reduce((a, s) => a + s.open, 0)
  const ranked = withRate.map(s => ({
    ...s,
    expected: (s.rate / rateSum) * (openSum + 1),
  })).map(s => ({ ...s, deficit: s.expected - s.open }))
    .sort((a, b) => (b.deficit - a.deficit) || (a.open - b.open) || (a.id - b.id))
  return { picked: ranked[0].id, ranked }
}

// Counsellors of a school with their numbers
async function getCounsellorStats(schoolId, { onlyAvailable = false } = {}) {
  const [users] = await pool.execute(
    `SELECT id, name, email, role, is_counsellor, counsellor_available
     FROM users WHERE school_id = ? AND is_active = 1 AND is_counsellor = 1
     ${onlyAvailable ? 'AND counsellor_available = 1' : ''}
     ORDER BY name`, [schoolId])
  if (!users.length) return { counsellors: [], schoolRate: FALLBACK_RATE }

  const [rows] = await pool.execute(
    `SELECT assigned_to AS id,
            COUNT(*) AS total,
            SUM(status = 'Admission') AS admitted,
            SUM(status IN ('New','Contacted','Campus Visit')) AS open
     FROM leads
     WHERE school_id = ? AND assigned_to IS NOT NULL
       AND created_at > DATE_SUB(NOW(), INTERVAL ${WINDOW_DAYS} DAY)
     GROUP BY assigned_to`, [schoolId])
  const byId = {}
  rows.forEach(r => { byId[r.id] = { total: +r.total, admitted: +r.admitted || 0, open: +r.open || 0 } })

  const totAll = rows.reduce((a, r) => a + +r.total, 0)
  const admAll = rows.reduce((a, r) => a + (+r.admitted || 0), 0)
  const schoolRate = totAll >= 20 ? admAll / totAll : FALLBACK_RATE

  const counsellors = users.map(u => ({
    ...u,
    total:    byId[u.id]?.total    || 0,
    admitted: byId[u.id]?.admitted || 0,
    open:     byId[u.id]?.open     || 0,
  }))
  return { counsellors, schoolRate }
}

async function logAssignment({ schoolId, leadId, from, to, method, by, reason }) {
  await pool.execute(
    `INSERT INTO lead_assignments (school_id, lead_id, from_user, to_user, method, by_user, reason)
     VALUES (?,?,?,?,?,?,?)`, [schoolId, leadId, from || null, to || null, method, by || null, reason || null])
}

// Auto-assign ONE lead. Never throws: a failure here must not lose the lead.
// Returns { assigned_to, name } or null.
async function autoAssignLead(leadId, schoolId, { force = false, by = null, reason = null } = {}) {
  try {
    if (!force) {
      const [[sch]] = await pool.execute('SELECT auto_assign_leads FROM schools WHERE id = ?', [schoolId])
      if (!sch || !sch.auto_assign_leads) return null
    }
    const [[lead]] = await pool.execute('SELECT id, assigned_to FROM leads WHERE id = ? AND school_id = ?', [leadId, schoolId])
    if (!lead) return null
    if (lead.assigned_to && !force) return null

    const { counsellors, schoolRate } = await getCounsellorStats(schoolId, { onlyAvailable: true })
    // when reassigning, don't hand the lead back to the same person
    const pool_ = force && lead.assigned_to ? counsellors.filter(c => c.id !== lead.assigned_to) : counsellors
    const { picked } = pickCounsellor(pool_, schoolRate)
    if (!picked) return null

    // Only change the row if nobody changed the assignment in the meantime
    const [r] = await pool.execute(
      `UPDATE leads SET assigned_to = ?, assigned_at = NOW(), assigned_by = ?, assign_method = 'auto'
       WHERE id = ? AND school_id = ? AND assigned_to <=> ?`,
      [picked, by, leadId, schoolId, lead.assigned_to])
    if (!r.affectedRows) return null

    await logAssignment({ schoolId, leadId, from: lead.assigned_to, to: picked, method: 'auto', by, reason })
    const c = counsellors.find(x => x.id === picked)
    return { assigned_to: picked, name: c ? c.name : null }
  } catch (e) {
    console.error('autoAssignLead failed:', e.message)
    return null
  }
}

// Auto-assign every unassigned open lead of a school (oldest first)
async function assignAllUnassigned(schoolId, by) {
  const [leads] = await pool.execute(
    `SELECT id FROM leads
     WHERE school_id = ? AND assigned_to IS NULL AND status IN ('New','Contacted','Campus Visit')
     ORDER BY created_at ASC LIMIT 500`, [schoolId])
  let assigned = 0
  for (const l of leads) {
    const r = await autoAssignLead(l.id, schoolId, { force: true, by, reason: 'Bulk assign' })
    if (r) assigned++
  }
  return { checked: leads.length, assigned }
}

module.exports = { pickCounsellor, getCounsellorStats, autoAssignLead, assignAllUnassigned, logAssignment, OPEN_STATUSES }
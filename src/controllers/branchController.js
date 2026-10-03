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

module.exports = { myBranches, switchBranch, createBranch }
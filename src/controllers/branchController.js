/**
 * EnrollIQ — Branches (school groups)
 * Save as:  src/controllers/branchController.js
 */
const { pool } = require('../db/pool')

// GET /api/branches/mine — branches the logged-in admin can access (same group)
async function myBranches(req, res, next) {
  try {
    // find the admin's group via their home school
    const [[me]] = await pool.execute(
      'SELECT school_id, active_school_id FROM users WHERE id=?', [req.user.id])
    const [[home]] = await pool.execute('SELECT group_id FROM schools WHERE id=?', [me.school_id])
    const groupId = home?.group_id || me.school_id

    const [branches] = await pool.execute(
      `SELECT id, name, city, is_main_branch FROM schools WHERE group_id=? ORDER BY is_main_branch DESC, name`,
      [groupId])

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

    // verify the target school is in the admin's group
    const [[me]] = await pool.execute('SELECT school_id FROM users WHERE id=?', [req.user.id])
    const [[home]] = await pool.execute('SELECT group_id FROM schools WHERE id=?', [me.school_id])
    const groupId = home?.group_id || me.school_id
    const [[target]] = await pool.execute('SELECT id FROM schools WHERE id=? AND group_id=?', [school_id, groupId])
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
    const [[home]] = await pool.execute('SELECT group_id FROM schools WHERE id=?', [homeSchoolId])
    const groupId = home?.group_id || homeSchoolId

    // The group's plan = the MAIN branch's plan. Only enterprise groups may add branches.
    const [[main]] = await pool.execute(
      'SELECT subscription_plan FROM schools WHERE group_id=? ORDER BY is_main_branch DESC, id ASC LIMIT 1',
      [groupId])
    if ((main?.subscription_plan || 'basic') !== 'enterprise')
      return res.status(403).json({ message: 'Branches are available on the Enterprise plan.' })

    const [r] = await pool.execute(
      `INSERT INTO schools (name, city, board, group_id, is_main_branch, subscription_plan, subscription_status, status, created_at)
       VALUES (?,?,?,?,0,'enterprise','active','active',NOW())`,
      [name, city || null, board || null, groupId])

    res.status(201).json({ message: 'Branch created', school_id: r.insertId })
  } catch (err) { next(err) }
}

module.exports = { myBranches, switchBranch, createBranch }
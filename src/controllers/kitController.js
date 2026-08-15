/**
 * EnrollIQ — School Kit controller
 * Save as: src/controllers/kitController.js
 *
 * Endpoints (all under /api/kit, JWT protected):
 *  Items:      GET/POST /items · PUT/DELETE /items/:id
 *  Templates:  GET /templates/:class · PUT /templates/:class
 *  Students:   GET /students?class= · GET /students/:studentId (auto-builds checklist)
 *  Issue:      POST /issue  { student_id, issue_ids:[], size_map:{}, mark_paid }
 *              PUT  /issues/:id  { status?, size?, payment_status? }
 *  Overview:   GET /overview
 */
const { pool } = require('../db/pool')

// ─── ITEMS ──────────────────────────────────────────────────────
exports.listItems = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM kit_items WHERE is_active = 1 ORDER BY category, name`)
    res.json(rows)
  } catch (e) { next(e) }
}

exports.createItem = async (req, res, next) => {
  try {
    const { name, category = 'Other', price = 0, has_sizes = 0, size_type = null } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Item name is required' })
    const [r] = await pool.execute(
      `INSERT INTO kit_items (name, category, price, has_sizes, size_type) VALUES (?,?,?,?,?)`,
      [name.trim(), category, price || 0, has_sizes ? 1 : 0, has_sizes ? size_type : null])
    res.status(201).json({ id: r.insertId, message: 'Item added' })
  } catch (e) { next(e) }
}

exports.updateItem = async (req, res, next) => {
  try {
    const { name, category, price, has_sizes, size_type } = req.body
    await pool.execute(
      `UPDATE kit_items SET name=?, category=?, price=?, has_sizes=?, size_type=? WHERE id=?`,
      [name, category, price || 0, has_sizes ? 1 : 0, has_sizes ? size_type : null, req.params.id])
    res.json({ message: 'Item updated' })
  } catch (e) { next(e) }
}

exports.deleteItem = async (req, res, next) => {
  try {
    // soft delete keeps history in student_kit_issues intact
    await pool.execute(`UPDATE kit_items SET is_active = 0 WHERE id = ?`, [req.params.id])
    res.json({ message: 'Item removed' })
  } catch (e) { next(e) }
}

// ─── TEMPLATES ──────────────────────────────────────────────────
exports.getTemplate = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.item_id, t.quantity, i.name, i.category, i.price, i.has_sizes, i.size_type
       FROM kit_template_items t JOIN kit_items i ON i.id = t.item_id
       WHERE t.class = ? AND i.is_active = 1 ORDER BY i.category, i.name`,
      [req.params.class])
    res.json(rows)
  } catch (e) { next(e) }
}

// Body: { items: [ { item_id, quantity } ] } — replaces the class template
exports.saveTemplate = async (req, res, next) => {
  try {
    const cls = req.params.class
    const items = req.body.items || []
    await pool.execute(`DELETE FROM kit_template_items WHERE class = ?`, [cls])
    for (const it of items) {
      if (!it.item_id) continue
      await pool.execute(
        `INSERT IGNORE INTO kit_template_items (class, item_id, quantity) VALUES (?,?,?)`,
        [cls, it.item_id, Math.max(1, parseInt(it.quantity) || 1)])
    }
    res.json({ message: `Kit template saved for ${cls} (${items.length} items)` })
  } catch (e) { next(e) }
}

// ─── STUDENTS + CHECKLIST ───────────────────────────────────────
// List students with kit progress (for the Issue tab)
exports.listStudents = async (req, res, next) => {
  try {
    const cls = req.query.class
    const [[activeYear]] = await pool.query('SELECT id FROM academic_years WHERE is_active=1 LIMIT 1')
    const ayId = activeYear ? activeYear.id : null
    const params = []
    let where = 'WHERE 1=1'
    if (cls && cls !== 'All') { where += ' AND s.class = ?'; params.push(cls) }
    if (ayId) {
      where += ` AND (
        s.id IN (SELECT student_id FROM student_enrollments WHERE academic_year_id = ?)
        OR s.id NOT IN (SELECT student_id FROM student_enrollments)
      )`
      params.push(ayId)
    }
    // kit-issue counts scoped to the active year (fall back to any if unstamped)
    const yearJoin = ayId
      ? 'AND (k.academic_year_id = ? OR k.academic_year_id IS NULL)'
      : ''
    const joinParams = ayId ? [ayId] : []
    const [rows] = await pool.execute(
      `SELECT s.id, s.name, s.roll_number, s.class, s.section,
              COUNT(k.id)                                    AS total_items,
              SUM(k.status = 'Issued')                       AS issued_items,
              SUM(k.payment_status = 'Paid')                 AS paid_items
       FROM students s
       LEFT JOIN student_kit_issues k ON k.student_id = s.id ${yearJoin}
       ${where}
       GROUP BY s.id ORDER BY s.class, s.section, s.name`, [...joinParams, ...params])
    res.json(rows)
  } catch (e) { next(e) }
}

// Get one student's checklist — lazily creates rows from their class template
exports.getStudentKit = async (req, res, next) => {
  try {
    const studentId = req.params.studentId
    const [[student]] = await pool.execute(
      `SELECT id, name, roll_number, class, section FROM students WHERE id = ?`, [studentId])
    if (!student) return res.status(404).json({ message: 'Student not found' })

    // Auto-generate missing checklist rows from the class template
    await pool.execute(
      `INSERT IGNORE INTO student_kit_issues (student_id, item_id, quantity)
       SELECT ?, t.item_id, t.quantity FROM kit_template_items t
       JOIN kit_items i ON i.id = t.item_id AND i.is_active = 1
       WHERE t.class = ?`,
      [studentId, student.class])

    const [checklist] = await pool.execute(
      `SELECT k.id, k.item_id, k.quantity, k.status, k.size, k.payment_status,
              k.issued_at, i.name, i.category, i.price, i.has_sizes, i.size_type,
              u.name AS issued_by_name
       FROM student_kit_issues k
       JOIN kit_items i ON i.id = k.item_id
       LEFT JOIN users u ON u.id = k.issued_by
       WHERE k.student_id = ? AND i.is_active = 1
       ORDER BY i.category, i.name`, [studentId])

    const total_value = checklist.reduce((s, r) => s + Number(r.price) * r.quantity, 0)
    const paid_value  = checklist.filter(r => r.payment_status === 'Paid')
                                 .reduce((s, r) => s + Number(r.price) * r.quantity, 0)
    res.json({ student, checklist, total_value, paid_value })
  } catch (e) { next(e) }
}

// ─── ISSUING ────────────────────────────────────────────────────
// Body: { issue_ids: [..], size_map: { issueId: 'M' }, mark_paid: bool }
exports.issueItems = async (req, res, next) => {
  try {
    const { issue_ids = [], size_map = {}, mark_paid = false } = req.body
    if (!issue_ids.length) return res.status(400).json({ message: 'No items selected' })
    for (const id of issue_ids) {
      const size = size_map[id] || null
      await pool.execute(
        `UPDATE student_kit_issues
         SET status = 'Issued', size = COALESCE(?, size), issued_by = ?, issued_at = NOW()
             ${mark_paid ? ", payment_status = 'Paid'" : ''}
         WHERE id = ?`,
        [size, req.user?.id || null, id])
    }
    res.json({ message: `${issue_ids.length} item(s) issued ✓` })
  } catch (e) { next(e) }
}

// Update a single checklist row (undo issue, toggle payment, change size)
exports.updateIssue = async (req, res, next) => {
  try {
    const { status, size, payment_status } = req.body
    const sets = [], params = []
    if (status)         { sets.push('status = ?');         params.push(status)
                          if (status === 'Pending') sets.push('issued_at = NULL, issued_by = NULL') }
    if (size !== undefined)           { sets.push('size = ?');           params.push(size || null) }
    if (payment_status) { sets.push('payment_status = ?'); params.push(payment_status) }
    if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
    params.push(req.params.id)
    await pool.execute(`UPDATE student_kit_issues SET ${sets.join(', ')} WHERE id = ?`, params)
    res.json({ message: 'Updated' })
  } catch (e) { next(e) }
}

// ─── OVERVIEW ───────────────────────────────────────────────────
exports.overview = async (req, res, next) => {
  try {
    const [[kpis]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM students)                                          AS total_students,
        (SELECT COUNT(*) FROM kit_items WHERE is_active = 1)                     AS total_items,
        COALESCE(SUM(k.status = 'Issued'), 0)                                    AS items_issued,
        COALESCE(SUM(k.status = 'Pending'), 0)                                   AS items_pending,
        COALESCE(SUM(CASE WHEN k.payment_status='Paid'  THEN i.price * k.quantity END), 0) AS revenue_collected,
        COALESCE(SUM(CASE WHEN k.payment_status='Unpaid' THEN i.price * k.quantity END), 0) AS revenue_pending
      FROM student_kit_issues k JOIN kit_items i ON i.id = k.item_id`)

    // Per-class progress
    const [classes] = await pool.query(`
      SELECT s.class,
             COUNT(DISTINCT s.id)                          AS students,
             COUNT(k.id)                                   AS total_items,
             COALESCE(SUM(k.status = 'Issued'), 0)         AS issued_items
      FROM students s
      LEFT JOIN student_kit_issues k ON k.student_id = s.id
      GROUP BY s.class ORDER BY s.class`)

    // Recent issues feed
    const [recent] = await pool.query(`
      SELECT k.issued_at, i.name AS item_name, s.name AS student_name, s.class, s.section,
             u.name AS issued_by_name
      FROM student_kit_issues k
      JOIN kit_items i ON i.id = k.item_id
      JOIN students s  ON s.id = k.student_id
      LEFT JOIN users u ON u.id = k.issued_by
      WHERE k.status = 'Issued' AND k.issued_at IS NOT NULL
      ORDER BY k.issued_at DESC LIMIT 10`)

    res.json({ kpis, classes, recent })
  } catch (e) { next(e) }
}
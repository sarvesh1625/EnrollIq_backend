const { pool } = require('../db/pool')

async function getFeeStats(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[col]] = await pool.execute(`SELECT COALESCE(SUM(paid_amount),0) AS total FROM payments WHERE school_id=?`, [schoolId])
    const [[pen]] = await pool.execute(`SELECT COALESCE(SUM(amount-paid_amount),0) AS total FROM payments WHERE school_id=? AND status IN ('Pending','Partial')`, [schoolId])
    const [[ov]]  = await pool.execute(`SELECT COALESCE(SUM(amount-paid_amount),0) AS total FROM payments WHERE school_id=? AND status='Overdue'`, [schoolId])
    const [[sw]]  = await pool.execute(`SELECT COUNT(DISTINCT student_id) AS c FROM payments WHERE school_id=? AND status IN ('Pending','Overdue')`, [schoolId])
    res.json({ total_collected: parseFloat(col.total), total_pending: parseFloat(pen.total), total_overdue: parseFloat(ov.total), students_owing: sw.c })
  } catch (err) { next(err) }
}

async function getPayments(req, res, next) {
  try {
    const { status, search, limit = 100, offset = 0 } = req.query
    const schoolId = req.user.school_id

    await pool.execute(`UPDATE payments SET status='Overdue' WHERE school_id=? AND status='Pending' AND due_date < CURDATE()`, [schoolId])

    let where = 'p.school_id = ?', params = [schoolId]
    if (status && status !== 'All') { where += ' AND p.status = ?'; params.push(status) }
    if (search) {
      where += ' AND (s.name LIKE ? OR s.roll_number LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    const [payments] = await pool.execute(
      `SELECT p.*, s.name AS student_name, s.class, s.roll_number FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       WHERE ${where} ORDER BY p.due_date DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM payments p LEFT JOIN students s ON s.id=p.student_id WHERE ${where}`, params)
    res.json({ payments, total: count.total })
  } catch (err) { next(err) }
}

async function createPayment(req, res, next) {
  try {
    const { student_id, fee_type, amount, due_date, payment_mode } = req.body
    const schoolId = req.user.school_id
    if (!student_id || !amount || !fee_type) return res.status(400).json({ message: 'student_id, fee_type and amount are required' })
    const [result] = await pool.execute(
      `INSERT INTO payments (school_id, student_id, fee_type, amount, due_date, payment_mode, status) VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [schoolId, student_id, fee_type, amount, due_date||null, payment_mode||null]
    )
    const [rows] = await pool.execute('SELECT * FROM payments WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function recordPayment(req, res, next) {
  try {
    const { paid_amount, payment_mode, reference_no } = req.body
    const schoolId = req.user.school_id
    const [existing] = await pool.execute('SELECT * FROM payments WHERE id = ? AND school_id = ?', [req.params.id, schoolId])
    if (!existing.length) return res.status(404).json({ message: 'Payment record not found' })
    const rec      = existing[0]
    const newPaid  = parseFloat(rec.paid_amount||0) + parseFloat(paid_amount)
    const newStatus= newPaid >= parseFloat(rec.amount) ? 'Paid' : newPaid > 0 ? 'Partial' : rec.status
    await pool.execute(
      `UPDATE payments SET paid_amount=?, payment_mode=COALESCE(?,payment_mode), reference_no=COALESCE(?,reference_no),
       paid_date=CASE WHEN ?='Paid' THEN CURDATE() ELSE paid_date END, status=? WHERE id=? AND school_id=?`,
      [newPaid, payment_mode||null, reference_no||null, newStatus, newStatus, req.params.id, schoolId]
    )
    const [rows] = await pool.execute('SELECT * FROM payments WHERE id = ?', [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function getFeeStructures(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM fee_structures WHERE school_id=? ORDER BY class_name, fee_type`,
      [req.user.school_id]
    )
    res.json(rows)
  } catch (err) { next(err) }
}

async function createFeeStructure(req, res, next) {
  try {
    const { class_name, fee_type, amount, term, due_day } = req.body
    const schoolId = req.user.school_id

    // Validate
    if (!amount || !fee_type) return res.status(400).json({ message: 'fee_type and amount are required' })

    // Check if table has right columns, create with correct schema
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS fee_structures (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        school_id   INT NOT NULL,
        class_name  VARCHAR(50),
        fee_type    VARCHAR(100) NOT NULL,
        amount      DECIMAL(10,2) NOT NULL,
        term        VARCHAR(50) DEFAULT 'Annual',
        due_day     INT DEFAULT 10,
        academic_year VARCHAR(10) DEFAULT '2025-26',
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    const [result] = await pool.execute(
      `INSERT INTO fee_structures (school_id, class_name, fee_type, amount, term, due_day) VALUES (?,?,?,?,?,?)`,
      [schoolId, class_name||'All', fee_type, parseFloat(amount), term||'Annual', parseInt(due_day)||10]
    )
    const [rows] = await pool.execute('SELECT * FROM fee_structures WHERE id=?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

module.exports = { getFeeStats, getPayments, createPayment, recordPayment, getFeeStructures, createFeeStructure }
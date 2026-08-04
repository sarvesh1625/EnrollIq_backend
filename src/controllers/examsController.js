const { pool } = require('../db/pool')

// GET /api/exams
async function getExams(req, res, next) {
  try {
    const [exams] = await pool.execute(`
      SELECT e.*,
             COUNT(DISTINCT em.student_id) AS students_appeared,
             COUNT(DISTINCT em.subject_id) AS subjects_count
      FROM   exams e
      LEFT JOIN exam_marks em ON em.exam_id = e.id
      WHERE  e.school_id=?
      GROUP  BY e.id
      ORDER  BY e.start_date DESC
    `, [req.user.school_id])
    res.json(exams)
  } catch (err) { next(err) }
}

// POST /api/exams
async function createExam(req, res, next) {
  try {
    const { name, class_name, exam_type, start_date, end_date, academic_year } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })

    const [result] = await pool.execute(
      `INSERT INTO exams (school_id, name, class_name, exam_type, start_date, end_date, academic_year)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.school_id, name, class_name||null, exam_type||'Unit Test', start_date||null, end_date||null, academic_year||'2025-26']
    )
    const [rows] = await pool.execute('SELECT * FROM exams WHERE id=?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

// GET /api/exams/subjects
async function getSubjects(req, res, next) {
  try {
    const [subjects] = await pool.execute(
      'SELECT * FROM subjects WHERE school_id=? ORDER BY class_name, name',
      [req.user.school_id]
    )
    res.json(subjects)
  } catch (err) { next(err) }
}

// POST /api/exams/subjects
async function createSubject(req, res, next) {
  try {
    const { name, code, class_name, max_marks } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })
    const [result] = await pool.execute(
      `INSERT INTO subjects (school_id, name, code, class_name, max_marks) VALUES (?,?,?,?,?)`,
      [req.user.school_id, name, code||null, class_name||null, max_marks||100]
    )
    const [rows] = await pool.execute('SELECT * FROM subjects WHERE id=?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

// POST /api/exams/:id/marks — enter marks for an exam
async function enterMarks(req, res, next) {
  try {
    const examId   = req.params.id
    const { marks } = req.body
    // marks = [{ student_id, subject_id, marks, max_marks }]
    const schoolId = req.user.school_id

    if (!marks || !Array.isArray(marks)) {
      return res.status(400).json({ message: 'marks array is required' })
    }

    let saved = 0
    for (const m of marks) {
      const grade = calcGrade(m.marks, m.max_marks || 100)
      await pool.execute(`
        INSERT INTO exam_marks (school_id, exam_id, student_id, subject_id, marks, max_marks, grade, entered_by)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE marks=VALUES(marks), max_marks=VALUES(max_marks), grade=VALUES(grade), entered_by=VALUES(entered_by)
      `, [schoolId, examId, m.student_id, m.subject_id, m.marks, m.max_marks||100, grade, req.user.id])
      saved++
    }

    res.json({ message: `Marks saved for ${saved} entries` })
  } catch (err) { next(err) }
}

// GET /api/exams/:id/marks — get marks for an exam
async function getMarks(req, res, next) {
  try {
    const [marks] = await pool.execute(`
      SELECT em.*, s.name AS student_name, s.class, s.roll_number,
             sub.name AS subject_name
      FROM   exam_marks em
      JOIN   students s  ON s.id  = em.student_id
      JOIN   subjects sub ON sub.id = em.subject_id
      WHERE  em.exam_id=? AND em.school_id=?
      ORDER  BY s.class, s.name, sub.name
    `, [req.params.id, req.user.school_id])
    res.json(marks)
  } catch (err) { next(err) }
}

// POST /api/exams/:id/generate-report-cards
async function generateReportCards(req, res, next) {
  try {
    const examId   = req.params.id
    const schoolId = req.user.school_id

    // Get all students who appeared
    const [students] = await pool.execute(`
      SELECT DISTINCT student_id FROM exam_marks WHERE exam_id=? AND school_id=?
    `, [examId, schoolId])

    let generated = 0
    for (const { student_id } of students) {
      const [marks] = await pool.execute(`
        SELECT SUM(marks) AS total, SUM(max_marks) AS max_total
        FROM exam_marks WHERE exam_id=? AND student_id=? AND school_id=?
      `, [examId, student_id, schoolId])

      const total     = parseFloat(marks[0].total || 0)
      const maxTotal  = parseFloat(marks[0].max_total || 0)
      const pct       = maxTotal > 0 ? (total / maxTotal) * 100 : 0
      const grade     = calcGrade(pct, 100)

      // Get attendance %
      const [[att]] = await pool.execute(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present
        FROM class_attendance WHERE student_id=? AND school_id=?
      `, [student_id, schoolId])
      const attPct = att.total > 0 ? (att.present / att.total) * 100 : 0

      await pool.execute(`
        INSERT INTO report_cards (school_id, student_id, exam_id, total_marks, max_total, percentage, grade, attendance_pct)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE total_marks=VALUES(total_marks), max_total=VALUES(max_total),
          percentage=VALUES(percentage), grade=VALUES(grade), attendance_pct=VALUES(attendance_pct)
      `, [schoolId, student_id, examId, total, maxTotal, pct.toFixed(2), grade, attPct.toFixed(2)])
      generated++
    }

    // Update ranks within each class
    const [cards] = await pool.execute(`
      SELECT rc.id, rc.student_id, s.class, rc.percentage
      FROM report_cards rc JOIN students s ON s.id=rc.student_id
      WHERE rc.exam_id=? AND rc.school_id=?
      ORDER BY s.class, rc.percentage DESC
    `, [examId, schoolId])

    let rank = 1, prevClass = '', prevPct = -1
    for (const card of cards) {
      if (card.class !== prevClass) { rank = 1; prevClass = card.class }
      await pool.execute('UPDATE report_cards SET rank_in_class=? WHERE id=?', [rank, card.id])
      rank++
    }

    res.json({ message: `Generated ${generated} report cards`, count: generated })
  } catch (err) { next(err) }
}

// GET /api/exams/report-card/:student_id
async function getStudentReportCard(req, res, next) {
  try {
    const [cards] = await pool.execute(`
      SELECT rc.*, e.name AS exam_name, e.exam_type, e.start_date,
             s.name AS student_name, s.class, s.roll_number, s.parent_name
      FROM   report_cards rc
      JOIN   exams   e ON e.id = rc.exam_id
      JOIN   students s ON s.id = rc.student_id
      WHERE  rc.student_id=? AND rc.school_id=?
      ORDER  BY e.start_date DESC
    `, [req.params.student_id, req.user.school_id])

    // Get subject-wise marks for latest exam
    let subjectMarks = []
    if (cards.length > 0) {
      const [marks] = await pool.execute(`
        SELECT em.*, sub.name AS subject_name, sub.max_marks AS sub_max
        FROM exam_marks em
        JOIN subjects sub ON sub.id = em.subject_id
        WHERE em.student_id=? AND em.exam_id=? AND em.school_id=?
        ORDER BY sub.name
      `, [req.params.student_id, cards[0].exam_id, req.user.school_id])
      subjectMarks = marks
    }

    res.json({ report_cards: cards, latest_marks: subjectMarks })
  } catch (err) { next(err) }
}

function calcGrade(marks, maxMarks = 100) {
  const pct = (marks / maxMarks) * 100
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 35) return 'D'
  return 'F'
}

module.exports = { getExams, createExam, getSubjects, createSubject, enterMarks, getMarks, generateReportCards, getStudentReportCard }
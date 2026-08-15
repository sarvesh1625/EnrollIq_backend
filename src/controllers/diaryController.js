/**
 * EnrollIQ — Daily Updates controller (diary / homework / activities)
 * Save as:  src/controllers/diaryController.js
 */
const { pool } = require('../db/pool')
const { uploadBuffer, isConfigured } = require('../services/cloudinaryService')
const { notifyParent, notifyClass } = require('../services/notificationService')

function parseAtt(v) { if (!v) return []; try { return JSON.parse(v) } catch { return [] } }

// POST /api/diary  (teacher/admin) — create a post
async function createPost(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { post_type = 'diary', class_name, section, student_id,
            title, description, subject, due_date, post_date } = req.body
    if (!title) return res.status(400).json({ message: 'Title is required' })
    if (!class_name && !student_id)
      return res.status(400).json({ message: 'Choose a class or a student' })

    // active year (optional)
    let ayId = null
    try { const [[ay]] = await pool.query('SELECT id FROM academic_years WHERE is_active=1 LIMIT 1'); ayId = ay?.id || null } catch {}

    // upload any attached files to Cloudinary
    let attachments = []
    if (req.files && req.files.length) {
      if (!isConfigured()) return res.status(500).json({ message: 'File storage (Cloudinary) is not configured on the server.' })
      for (const f of req.files) {
        try {
          const up = await uploadBuffer(f.buffer, 'enrolliq/diary', f.originalname)
          attachments.push({ url: up.url, type: up.resource_type, format: up.format, name: f.originalname })
        } catch (e) { console.error('upload failed:', e.message) }
      }
    }

    const [r] = await pool.execute(
      `INSERT INTO class_posts
        (school_id, academic_year_id, post_type, class_name, section, student_id,
         title, description, subject, due_date, post_date, posted_by, posted_by_name, attachments)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [schoolId, ayId, post_type, class_name || null, section || null, student_id || null,
       title, description || null, subject || null, due_date || null,
       post_date || new Date().toISOString().slice(0,10),
       req.user.id, req.user.name || null,
       attachments.length ? JSON.stringify(attachments) : null])

    const [[row]] = await pool.execute('SELECT * FROM class_posts WHERE id=?', [r.insertId])

    // notify parents (fire and forget)
    const typeLabel = post_type === 'homework' ? 'Homework' : post_type === 'activity' ? 'Activity' : 'Diary'
    const notifTitle = `New ${typeLabel}: ${title}`
    if (student_id) {
      try {
        const [[st]] = await pool.execute('SELECT parent_phone FROM students WHERE id=?', [student_id])
        if (st?.parent_phone) notifyParent({ schoolId, studentId: student_id, parentPhone: st.parent_phone, type: post_type, title: notifTitle, body: description, link: 'diary' })
      } catch {}
    } else if (class_name) {
      notifyClass({ schoolId, className: class_name, type: post_type, title: notifTitle, body: description, link: 'diary' })
    }

    res.status(201).json(row)
  } catch (err) { next(err) }
}

// GET /api/diary  (teacher/admin) — list posts, optional filters
async function listPosts(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { class_name, post_type, student_id } = req.query
    let where = 'cp.school_id = ?'; const params = [schoolId]
    if (class_name && class_name !== 'All') { where += ' AND cp.class_name = ?'; params.push(class_name) }
    if (post_type && post_type !== 'All')   { where += ' AND cp.post_type = ?'; params.push(post_type) }
    if (student_id)                          { where += ' AND cp.student_id = ?'; params.push(student_id) }

    const [rows] = await pool.execute(
      `SELECT cp.*, s.name AS student_name
       FROM class_posts cp
       LEFT JOIN students s ON s.id = cp.student_id
       WHERE ${where}
       ORDER BY cp.post_date DESC, cp.created_at DESC
       LIMIT 200`, params)
    res.json(rows.map(r => ({ ...r, attachments: parseAtt(r.attachments) })))
  } catch (err) { next(err) }
}

// DELETE /api/diary/:id  (teacher/admin)
async function deletePost(req, res, next) {
  try {
    const [[p]] = await pool.execute('SELECT id FROM class_posts WHERE id=? AND school_id=?', [req.params.id, req.user.school_id])
    if (!p) return res.status(404).json({ message: 'Post not found' })
    await pool.execute('DELETE FROM class_posts WHERE id=?', [req.params.id])
    res.json({ message: 'Deleted' })
  } catch (err) { next(err) }
}

// used by the parent route: posts for a specific child (class posts + their own)
async function getPostsForStudent(schoolId, student) {
  const [rows] = await pool.execute(
    `SELECT * FROM class_posts
     WHERE school_id = ?
       AND ( (student_id = ?) OR (student_id IS NULL AND class_name = ?) )
     ORDER BY post_date DESC, created_at DESC
     LIMIT 100`,
    [schoolId, student.id, student.class])
  return rows.map(r => ({ ...r, attachments: parseAtt(r.attachments) }))
}

module.exports = { createPost, listPosts, deletePost, getPostsForStudent }
/**
 * EnrollIQ — Support page backend (two-way threaded tickets)
 * School admins/staff open a ticket from the Support page; both the
 * school and the superadmin can send messages back and forth on that
 * ticket in support_messages, until it's marked resolved.
 */
const { pool } = require('../db/pool')

// POST /api/support/message  (any logged-in school user) — opens a NEW ticket
exports.sendMessage = async (req, res, next) => {
  try {
    const { subject, message, email, phone } = req.body
    if (!subject?.trim() || !message?.trim())
      return res.status(400).json({ message: 'subject and message are required' })

    const [result] = await pool.execute(
      `INSERT INTO support_requests (school_id, user_id, name, email, phone, subject, message)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.school_id, req.user.id, req.user.name,
       email?.trim() || req.user.email, phone?.trim() || null,
       subject.trim(), message.trim()])

    // First message in the thread = the ticket's own opening message
    await pool.execute(
      `INSERT INTO support_messages (request_id, sender_role, sender_name, message) VALUES (?,?,?,?)`,
      [result.insertId, 'school', req.user.name, message.trim()])

    res.status(201).json({ message: 'Message sent — our team will get back to you soon.', id: result.insertId })
  } catch (e) { next(e) }
}

// GET /api/support/my-messages  (school user — list their school's tickets, with a preview + unread hint)
exports.myMessages = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT sr.id, sr.subject, sr.status, sr.created_at,
              (SELECT m.message FROM support_messages m WHERE m.request_id=sr.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT m.sender_role FROM support_messages m WHERE m.request_id=sr.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
              (SELECT COUNT(*) FROM support_messages m WHERE m.request_id=sr.id) AS message_count
       FROM support_requests sr WHERE sr.school_id=? ORDER BY sr.created_at DESC LIMIT 50`,
      [req.user.school_id])
    res.json(rows)
  } catch (e) { next(e) }
}

// GET /api/support/:id/messages  (school user — full thread for their own ticket)
exports.getThread = async (req, res, next) => {
  try {
    const [[ticket]] = await pool.execute(
      `SELECT id, subject, status FROM support_requests WHERE id=? AND school_id=?`,
      [req.params.id, req.user.school_id])
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })

    const [messages] = await pool.execute(
      `SELECT id, sender_role, sender_name, message, created_at
       FROM support_messages WHERE request_id=? ORDER BY created_at ASC`, [req.params.id])
    res.json({ ticket, messages })
  } catch (e) { next(e) }
}

// POST /api/support/:id/messages  (school user — reply on their own ticket)
exports.replyAsSchool = async (req, res, next) => {
  try {
    const { message } = req.body
    if (!message?.trim()) return res.status(400).json({ message: 'message is required' })

    const [[ticket]] = await pool.execute(
      `SELECT id, status FROM support_requests WHERE id=? AND school_id=?`,
      [req.params.id, req.user.school_id])
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })

    await pool.execute(
      `INSERT INTO support_messages (request_id, sender_role, sender_name, message) VALUES (?,'school',?,?)`,
      [ticket.id, req.user.name, message.trim()])

    // A school reply re-opens a resolved ticket, or nudges a new one to in_progress
    const nextStatus = ticket.status === 'resolved' ? 'in_progress' : ticket.status
    await pool.execute(`UPDATE support_requests SET status=? WHERE id=?`, [nextStatus, ticket.id])

    res.status(201).json({ message: 'Sent' })
  } catch (e) { next(e) }
}

// ── Superadmin-only below ──────────────────────────────────────────────────

// GET /api/support/admin/messages?status=new  — ticket list across all schools
exports.listAll = async (req, res, next) => {
  try {
    const { status } = req.query
    const where = status ? 'WHERE sr.status = ?' : ''
    const params = status ? [status] : []
    const [rows] = await pool.execute(
      `SELECT sr.id, sr.subject, sr.status, sr.name, sr.email, sr.phone, sr.created_at, s.name AS school_name,
              (SELECT m.message FROM support_messages m WHERE m.request_id=sr.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT m.sender_role FROM support_messages m WHERE m.request_id=sr.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
              (SELECT COUNT(*) FROM support_messages m WHERE m.request_id=sr.id) AS message_count
       FROM support_requests sr
       JOIN schools s ON s.id = sr.school_id
       ${where}
       ORDER BY sr.created_at DESC LIMIT 200`, params)
    const [[counts]] = await pool.query(
      `SELECT
         SUM(status='new') AS new_count,
         SUM(status='in_progress') AS in_progress_count,
         SUM(status='resolved') AS resolved_count
       FROM support_requests`)
    res.json({ requests: rows, counts })
  } catch (e) { next(e) }
}

// GET /api/support/admin/:id/messages  — full thread, any school's ticket
exports.getThreadAsAdmin = async (req, res, next) => {
  try {
    const [[ticket]] = await pool.execute(
      `SELECT sr.id, sr.subject, sr.status, s.name AS school_name
       FROM support_requests sr JOIN schools s ON s.id = sr.school_id WHERE sr.id=?`, [req.params.id])
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })

    const [messages] = await pool.execute(
      `SELECT id, sender_role, sender_name, message, created_at
       FROM support_messages WHERE request_id=? ORDER BY created_at ASC`, [req.params.id])
    res.json({ ticket, messages })
  } catch (e) { next(e) }
}

// POST /api/support/admin/:id/messages  — superadmin reply
exports.replyAsAdmin = async (req, res, next) => {
  try {
    const { message } = req.body
    if (!message?.trim()) return res.status(400).json({ message: 'message is required' })

    const [[ticket]] = await pool.execute(`SELECT id, status FROM support_requests WHERE id=?`, [req.params.id])
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })

    await pool.execute(
      `INSERT INTO support_messages (request_id, sender_role, sender_name, message) VALUES (?,'superadmin',?,?)`,
      [ticket.id, req.superAdmin?.name || 'EnrollIQ Support', message.trim()])

    // A reply moves an Open ticket to In progress automatically
    if (ticket.status === 'new') await pool.execute(`UPDATE support_requests SET status='in_progress' WHERE id=?`, [ticket.id])

    res.status(201).json({ message: 'Sent' })
  } catch (e) { next(e) }
}

// PATCH /api/support/admin/messages/:id  — change status only (Resolve / Reopen)
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body
    if (!status) return res.status(400).json({ message: 'status is required' })
    await pool.execute(`UPDATE support_requests SET status=? WHERE id=?`, [status, req.params.id])
    res.json({ message: 'Updated' })
  } catch (e) { next(e) }
}
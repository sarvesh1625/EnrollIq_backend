const { pool } = require('../db/pool')

async function getMessages(req, res, next) {
  try {
    const { channel, search, limit = 50, offset = 0 } = req.query
    const schoolId = req.user.school_id
    let where = 'm.school_id = ?', params = [schoolId]

    if (channel && channel !== 'All') { where += ' AND m.channel = ?'; params.push(channel) }
    if (search) {
      where += ' AND (m.recipient_name LIKE ? OR m.recipient_phone LIKE ? OR m.body LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const [messages] = await pool.execute(
      `SELECT m.*, u.name AS sent_by_name, s.name AS student_name, s.class AS student_class
       FROM messages m
       LEFT JOIN users u ON u.id = m.sent_by
       LEFT JOIN students s ON s.id = m.student_id
       WHERE ${where} ORDER BY m.sent_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM messages m WHERE ${where}`, params)
    res.json({ messages, total: count[0].total })
  } catch (err) { next(err) }
}

async function sendMessage(req, res, next) {
  try {
    const { student_id, lead_id, recipient_name, recipient_phone, channel, body } = req.body
    const schoolId = req.user.school_id
    if (!body || !recipient_phone) return res.status(400).json({ message: 'body and recipient_phone are required' })

    const [result] = await pool.execute(
      `INSERT INTO messages (school_id, sent_by, student_id, lead_id, recipient_name, recipient_phone, channel, body, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sent')`,
      [schoolId, req.user.id, student_id||null, lead_id||null, recipient_name, recipient_phone, channel||'WhatsApp', body]
    )
    const [rows] = await pool.execute('SELECT * FROM messages WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function getAnnouncements(req, res, next) {
  try {
    const { limit = 30, offset = 0 } = req.query
    const schoolId = req.user.school_id
    const [announcements] = await pool.execute(
      `SELECT a.*, u.name AS sent_by_name FROM announcements a
       LEFT JOIN users u ON u.id = a.sent_by
       WHERE a.school_id = ? ORDER BY a.sent_at DESC LIMIT ? OFFSET ?`,
      [schoolId, parseInt(limit), parseInt(offset)]
    )
    const [[count]] = await pool.execute('SELECT COUNT(*) AS total FROM announcements WHERE school_id = ?', [schoolId])
    res.json({ announcements, total: count.total })
  } catch (err) { next(err) }
}

async function sendAnnouncement(req, res, next) {
  try {
    const { title, body, audience, audience_filter, channel } = req.body
    const schoolId = req.user.school_id
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' })

    let recipientCount = 0
    if (audience === 'All') {
      const [[cnt]] = await pool.execute(`SELECT COUNT(*) AS c FROM students WHERE school_id=? AND status='Active'`, [schoolId])
      recipientCount = cnt.c
    } else if (audience === 'Grade-wise' && audience_filter) {
      const [[cnt]] = await pool.execute(`SELECT COUNT(*) AS c FROM students WHERE school_id=? AND class=? AND status='Active'`, [schoolId, audience_filter])
      recipientCount = cnt.c
    }

    const [result] = await pool.execute(
      `INSERT INTO announcements (school_id, sent_by, title, body, audience, audience_filter, channel, recipient_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sent')`,
      [schoolId, req.user.id, title, body, audience||'All', audience_filter||null, channel||'WhatsApp', recipientCount]
    )
    const [rows] = await pool.execute('SELECT * FROM announcements WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function getNotifications(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [notifications] = await pool.execute(
      'SELECT * FROM notification_log WHERE school_id = ? ORDER BY created_at DESC LIMIT 50',
      [schoolId]
    )
    const [[unread]] = await pool.execute('SELECT COUNT(*) AS c FROM notification_log WHERE school_id=? AND is_read=0', [schoolId])
    res.json({ notifications, unread_count: unread.c })
  } catch (err) { next(err) }
}

async function markAllRead(req, res, next) {
  try {
    await pool.execute('UPDATE notification_log SET is_read = 1 WHERE school_id = ?', [req.user.school_id])
    res.json({ message: 'All notifications marked as read' })
  } catch (err) { next(err) }
}

async function getCommStats(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const today    = new Date().toISOString().slice(0, 10)
    const [[td]]  = await pool.execute(`SELECT COUNT(*) AS c FROM messages WHERE school_id=? AND DATE(sent_at)=?`, [schoolId, today])
    const [[tot]] = await pool.execute(`SELECT COUNT(*) AS c FROM messages WHERE school_id=?`, [schoolId])
    const [[ann]] = await pool.execute(`SELECT COUNT(*) AS c FROM announcements WHERE school_id=?`, [schoolId])
    const [[fal]] = await pool.execute(`SELECT COUNT(*) AS c FROM messages WHERE school_id=? AND status='Failed'`, [schoolId])
    res.json({ sent_today: td.c, total_messages: tot.c, announcements_sent: ann.c, failed: fal.c })
  } catch (err) { next(err) }
}

module.exports = { getMessages, sendMessage, getAnnouncements, sendAnnouncement, getNotifications, markAllRead, getCommStats }
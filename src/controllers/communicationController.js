const { pool } = require('../db/pool')
const { notifyParent } = require('../services/notificationService')

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

    // Push into the parent app's notifications feed — only possible when this
    // message is tied to an enrolled student (leads don't have app accounts).
    if (student_id) {
      try {
        const [[st]] = await pool.execute('SELECT parent_phone FROM students WHERE id=? AND school_id=?', [student_id, schoolId])
        if (st?.parent_phone) {
          const preview = body.length > 150 ? body.slice(0, 150) + '…' : body
          await notifyParent({
            schoolId, studentId: student_id, parentPhone: st.parent_phone,
            type: 'message', title: 'New message from school', body: preview,
          })
        }
      } catch {}
    }

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

    let targetStudents = []
    if (audience === 'All') {
      const [rows] = await pool.execute(
        `SELECT id, parent_phone FROM students WHERE school_id=? AND status='Active' AND parent_phone IS NOT NULL AND parent_phone<>''`, [schoolId])
      targetStudents = rows
    } else if (audience === 'Grade-wise' && audience_filter) {
      const [rows] = await pool.execute(
        `SELECT id, parent_phone FROM students WHERE school_id=? AND class=? AND status='Active' AND parent_phone IS NOT NULL AND parent_phone<>''`, [schoolId, audience_filter])
      targetStudents = rows
    }
    const recipientCount = targetStudents.length

    const [result] = await pool.execute(
      `INSERT INTO announcements (school_id, sent_by, title, body, audience, audience_filter, channel, recipient_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sent')`,
      [schoolId, req.user.id, title, body, audience||'All', audience_filter||null, channel||'WhatsApp', recipientCount]
    )
    const [rows] = await pool.execute('SELECT * FROM announcements WHERE id = ?', [result.insertId])

    // Fan the announcement out to every matching parent's notifications feed
    for (const s of targetStudents) {
      try {
        await notifyParent({
          schoolId, studentId: s.id, parentPhone: s.parent_phone,
          type: 'announcement', title, body,
        })
      } catch {}
    }

    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function getNotifications(req, res, next) {
  // Live activity feed generated from real recent events (no notification_log needed):
  // new leads, new admissions, fee payments, and today's absentees.
  try {
    const schoolId = req.user.school_id
    const items = []
    const safe = async (fn) => { try { await fn() } catch (e) { /* ignore missing table */ } }

    // 1) Recent new leads
    await safe(async () => {
      const [rows] = await pool.execute(
        `SELECT id, parent_name, child_grade, lead_source, created_at
         FROM leads WHERE school_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ORDER BY created_at DESC LIMIT 12`, [schoolId])
      for (const r of rows) items.push({
        id: `lead-${r.id}`, type: 'lead_alert',
        title: `New lead: ${r.parent_name}`,
        body: [r.child_grade, r.lead_source].filter(Boolean).join(' \u00b7 ') || 'New enquiry',
        is_read: 0, created_at: r.created_at,
      })
    })

    // 2) Recent admissions
    await safe(async () => {
      const [rows] = await pool.execute(
        `SELECT a.id, a.created_at, COALESCE(a.student_name, s.name) AS name
         FROM admissions a LEFT JOIN students s ON s.id = a.student_id
         WHERE a.school_id=? AND a.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ORDER BY a.created_at DESC LIMIT 10`, [schoolId])
      for (const r of rows) items.push({
        id: `adm-${r.id}`, type: 'admission_update',
        title: `New admission${r.name ? ': ' + r.name : ''}`,
        body: 'Admission confirmed', is_read: 0, created_at: r.created_at,
      })
    })

    // 3) Recent fee payments
    await safe(async () => {
      const [rows] = await pool.execute(
        `SELECT p.id, p.paid_amount, p.created_at, s.name
         FROM payments p LEFT JOIN students s ON s.id = p.student_id
         WHERE p.school_id=? AND p.paid_amount > 0
           AND p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ORDER BY p.created_at DESC LIMIT 10`, [schoolId])
      for (const r of rows) items.push({
        id: `pay-${r.id}`, type: 'fee_reminder',
        title: `Fee received${r.name ? ': ' + r.name : ''}`,
        body: `\u20b9${Number(r.paid_amount).toLocaleString('en-IN')} paid`,
        is_read: 0, created_at: r.created_at,
      })
    })

    // 4) Today's absentees (summary)
    await safe(async () => {
      const [[a]] = await pool.execute(
        `SELECT COUNT(*) c FROM class_attendance
         WHERE school_id=? AND date=CURDATE() AND status='Absent'`, [schoolId])
      if (a && a.c > 0) items.push({
        id: `abs-today`, type: 'system',
        title: `${a.c} student${a.c>1?'s':''} absent today`,
        body: 'Check attendance for follow-up', is_read: 0, created_at: new Date(),
      })
    })

    items.sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
    const notifications = items.slice(0, 20)
    res.json({ notifications, unread_count: notifications.length })
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
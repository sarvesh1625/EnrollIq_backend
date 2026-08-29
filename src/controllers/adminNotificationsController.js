/**
 * EnrollIQ — Admin dashboard notifications (live activity feed)
 * Save as:  src/controllers/adminNotificationsController.js
 *
 * Generates a notifications feed from REAL recent events (no new table):
 * new leads, new admissions, fee payments, and today's absentees.
 * All read-only, school-scoped. Matches the shape the dashboard expects:
 *   { id, type, title, body, is_read, created_at }
 *   type ∈ lead_alert | admission_update | fee_reminder | system
 */
const { pool } = require('../db/pool')

async function getNotifications(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const items = []

    // helper to safely run a gatherer
    const safe = async (fn) => { try { await fn() } catch (e) { /* ignore a missing table */ } }

    // 1) Recent new leads (last 7 days)
    await safe(async () => {
      const [rows] = await pool.execute(
        `SELECT id, parent_name, child_grade, lead_source, created_at
         FROM leads WHERE school_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ORDER BY created_at DESC LIMIT 10`, [schoolId])
      for (const r of rows) {
        items.push({
          id: `lead-${r.id}`, type: 'lead_alert',
          title: `New lead: ${r.parent_name}`,
          body: [r.child_grade, r.lead_source].filter(Boolean).join(' · ') || 'New enquiry',
          is_read: 0, created_at: r.created_at,
        })
      }
    })

    // 2) Recent admissions (last 14 days)
    await safe(async () => {
      const [rows] = await pool.execute(
        `SELECT a.id, a.created_at, COALESCE(a.student_name, s.name) AS name
         FROM admissions a LEFT JOIN students s ON s.id = a.student_id
         WHERE a.school_id=? AND a.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ORDER BY a.created_at DESC LIMIT 10`, [schoolId])
      for (const r of rows) {
        items.push({
          id: `adm-${r.id}`, type: 'admission_update',
          title: `New admission${r.name ? ': ' + r.name : ''}`,
          body: 'Admission confirmed',
          is_read: 0, created_at: r.created_at,
        })
      }
    })

    // 3) Recent fee payments (last 7 days)
    await safe(async () => {
      const [rows] = await pool.execute(
        `SELECT p.id, p.paid_amount, p.created_at, s.name
         FROM payments p LEFT JOIN students s ON s.id = p.student_id
         WHERE p.school_id=? AND p.paid_amount > 0
           AND p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ORDER BY p.created_at DESC LIMIT 10`, [schoolId])
      for (const r of rows) {
        items.push({
          id: `pay-${r.id}`, type: 'fee_reminder',
          title: `Fee received${r.name ? ': ' + r.name : ''}`,
          body: `₹${Number(r.paid_amount).toLocaleString('en-IN')} paid`,
          is_read: 0, created_at: r.created_at,
        })
      }
    })

    // 4) Today's absentees (summary)
    await safe(async () => {
      const [[a]] = await pool.execute(
        `SELECT COUNT(*) c FROM class_attendance
         WHERE school_id=? AND date=CURDATE() AND status='Absent'`, [schoolId])
      if (a && a.c > 0) {
        items.push({
          id: `abs-${new Date().toISOString().slice(0,10)}`, type: 'system',
          title: `${a.c} student${a.c>1?'s':''} absent today`,
          body: 'Check attendance for follow-up',
          is_read: 0, created_at: new Date(),
        })
      }
    })

    // sort newest first, cap the feed
    items.sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
    const notifications = items.slice(0, 20)

    res.json({ notifications, unread: notifications.length })
  } catch (err) { next(err) }
}

module.exports = { getNotifications }
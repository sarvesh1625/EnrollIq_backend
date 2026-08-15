/**
 * EnrollIQ — Notification service
 * Save as:  src/services/notificationService.js
 * Creates in-app notifications. (Phase 2 will also send push here.)
 */
const { pool } = require('../db/pool')

// Notify ONE parent (by phone) about their child
async function notifyParent({ schoolId, studentId, parentPhone, type, title, body, link }) {
  if (!parentPhone) return
  try {
    await pool.execute(
      `INSERT INTO notifications (school_id, student_id, parent_phone, type, title, body, link)
       VALUES (?,?,?,?,?,?,?)`,
      [schoolId, studentId || null, parentPhone, type, title, body || null, link || null])
  } catch (e) { console.error('notify failed:', e.message) }
}

// Notify all parents of a class (for class-wide diary/homework)
async function notifyClass({ schoolId, className, type, title, body, link }) {
  try {
    const [students] = await pool.execute(
      `SELECT id, parent_phone FROM students
       WHERE school_id=? AND class=? AND status='Active' AND parent_phone IS NOT NULL AND parent_phone<>''`,
      [schoolId, className])
    for (const s of students) {
      await notifyParent({ schoolId, studentId: s.id, parentPhone: s.parent_phone, type, title, body, link })
    }
    return students.length
  } catch (e) { console.error('notifyClass failed:', e.message); return 0 }
}

module.exports = { notifyParent, notifyClass }
/**
 * EnrollIQ — Support message threads
 * -------------------------------------
 * Save as:  src/db/migrate_support_threads.js
 * Run:      node src/db/migrate_support_threads.js  (after migrate_support.js)
 *
 * Upgrades the Support ticket system from a single admin_reply field to a
 * real two-way message thread — school and superadmin can go back and
 * forth on the same ticket until it's marked resolved.
 * support_requests stays as the ticket "header" (subject, status, school).
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      request_id   INT NOT NULL,
      sender_role  ENUM('school','superadmin') NOT NULL,
      sender_name  VARCHAR(150) NOT NULL,
      message      TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE,
      INDEX idx_support_msg_request (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Backfill: turn any existing single admin_reply into the first thread message,
  // and the original ticket message into the first school message — so nothing
  // already sent is lost when switching over to the thread view.
  const [tickets] = await pool.query(`SELECT id, name, message, admin_reply FROM support_requests`)
  for (const t of tickets) {
    const [[existing]] = await pool.query(
      `SELECT COUNT(*) c FROM support_messages WHERE request_id=?`, [t.id])
    if (existing.c > 0) continue // already backfilled
    await pool.execute(
      `INSERT INTO support_messages (request_id, sender_role, sender_name, message) VALUES (?,?,?,?)`,
      [t.id, 'school', t.name, t.message])
    if (t.admin_reply) {
      await pool.execute(
        `INSERT INTO support_messages (request_id, sender_role, sender_name, message) VALUES (?,?,?,?)`,
        [t.id, 'superadmin', 'EnrollIQ Support', t.admin_reply])
    }
  }

  console.log(`✅ support_messages table ready (backfilled ${tickets.length} ticket(s))`)
  process.exit(0)
}

run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })
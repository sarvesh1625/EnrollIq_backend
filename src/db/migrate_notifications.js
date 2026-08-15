/**
 * EnrollIQ — Notifications (Phase 1: in-app feed)
 * Save as:  src/db/migrate_notifications.js
 * Run:      node src/db/migrate_notifications.js
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('\n🔔  Notifications migration\n')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      school_id    INT NOT NULL,
      student_id   INT NULL,
      parent_phone VARCHAR(20) NOT NULL,
      type         VARCHAR(30) NOT NULL,      -- diary | homework | activity | test_graded | absent | fee
      title        VARCHAR(200) NOT NULL,
      body         TEXT NULL,
      link         VARCHAR(60) NULL,          -- which app section to open (e.g. 'diary','tests','attendance')
      is_read      TINYINT DEFAULT 0,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notif_phone (parent_phone, is_read),
      INDEX idx_notif_school (school_id)
    )
  `)
  console.log('  ✅ notifications table ready')
  console.log('\n✅  Done.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
/**
 * EnrollIQ — Support requests table
 * ------------------------------------
 * Save as:  src/db/migrate_support.js
 * Run:      node src/db/migrate_support.js
 *
 * Holds messages school admins send to EnrollIQ support from the new
 * Support page, so the superadmin has a real, persisted inbox to work
 * from (unlike the existing admin-notifications feed, which is derived
 * on the fly from other tables and can't hold a freeform message).
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      school_id    INT NOT NULL,
      user_id      INT NULL,
      name         VARCHAR(150) NOT NULL,
      email        VARCHAR(150) NULL,
      phone        VARCHAR(20)  NULL,
      subject      VARCHAR(200) NOT NULL,
      message      TEXT NOT NULL,
      status       ENUM('new','in_progress','resolved') NOT NULL DEFAULT 'new',
      admin_reply  TEXT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
      INDEX idx_support_status (status),
      INDEX idx_support_school (school_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  console.log('✅ support_requests table ready')
  process.exit(0)
}

run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })
/**
 * EnrollIQ — attendance v2 migration
 * Save as:  backend/src/db/migrate_attendance_v2.js
 * Run:      node src/db/migrate_attendance_v2.js      (safe to re-run)
 *
 *  1. leave_requests table  (parents apply for leave, school approves / rejects)
 *  2. class_attendance.source  ('leave' when a row was created automatically by an approved leave)
 *  3. an index on (school_id, date) so week / month / year reports stay fast
 */
require('dotenv').config()
const { pool } = require('./pool')

const has = async (sql, params) => (await pool.query(sql, params))[0][0].c > 0

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      school_id    INT NOT NULL,
      student_id   INT NOT NULL,
      parent_phone VARCHAR(20) NULL,
      from_date    DATE NOT NULL,
      to_date      DATE NOT NULL,
      reason       VARCHAR(500) NOT NULL,
      status       VARCHAR(12) NOT NULL DEFAULT 'Pending',
      remark       VARCHAR(255) NULL,
      reviewed_by  INT NULL,
      reviewed_at  DATETIME NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_leave_school_status (school_id, status),
      INDEX idx_leave_student (student_id, from_date),
      FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.log('  ✓ leave_requests')

  if (!(await has(`SELECT COUNT(*) c FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='class_attendance' AND column_name='source'`))) {
    await pool.query(`ALTER TABLE class_attendance ADD COLUMN source VARCHAR(12) NULL`)
    console.log('  + class_attendance.source')
  } else console.log('  · class_attendance.source exists')

  if (!(await has(`SELECT COUNT(*) c FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name='class_attendance' AND index_name='idx_att_school_date'`))) {
    await pool.query(`ALTER TABLE class_attendance ADD INDEX idx_att_school_date (school_id, date)`)
    console.log('  + index idx_att_school_date')
  } else console.log('  · index idx_att_school_date exists')

  console.log('✅ done')
  process.exit(0)
}
run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })
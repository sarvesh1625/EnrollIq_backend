/**
 * EnrollIQ — Staff & Teacher Onboarding migration (Node)
 * ------------------------------------------------------
 * Save as:  src/db/migrate_staff_onboarding.js
 * Run:      npm run db:migrate:staff   (or: node src/db/migrate_staff_onboarding.js)
 *
 * Safe to run multiple times on any environment (local XAMPP,
 * staging, client servers) — it checks what already exists
 * before making changes. Works on MySQL 5.7/8 and MariaDB.
 */
require('dotenv').config()
const { pool } = require('./pool')

// ── Columns to add to `users` ────────────────────────────────────
const USER_COLUMNS = [
  ['employee_id',             "VARCHAR(20)  NULL"],
  ['photo_url',               "VARCHAR(255) NULL"],
  ['gender',                  "VARCHAR(10)  NULL"],
  ['dob',                     "DATE         NULL"],
  ['blood_group',             "VARCHAR(5)   NULL"],
  ['date_of_joining',         "DATE         NULL"],
  ['employment_type',         "VARCHAR(20)  NULL DEFAULT 'Full-time'"],
  ['department',              "VARCHAR(40)  NULL"],
  ['designation',             "VARCHAR(80)  NULL"],
  ['reporting_to',            "INT          NULL"],
  ['qualification',           "VARCHAR(120) NULL"],
  ['experience_years',        "DECIMAL(4,1) NULL"],
  ['previous_school',         "VARCHAR(120) NULL"],
  ['class_teacher_of',        "VARCHAR(30)  NULL"],
  ['address',                 "TEXT         NULL"],
  ['emergency_contact_name',  "VARCHAR(80)  NULL"],
  ['emergency_contact_phone', "VARCHAR(15)  NULL"],
  ['aadhaar_number',          "VARCHAR(20)  NULL"],
  ['pan_number',              "VARCHAR(15)  NULL"],
  ['police_verification',     "VARCHAR(20)  NULL DEFAULT 'Pending'"],
  ['bank_account',            "VARCHAR(30)  NULL"],
  ['bank_ifsc',               "VARCHAR(15)  NULL"],
  ['pf_uan',                  "VARCHAR(20)  NULL"],
  ['esi_number',              "VARCHAR(20)  NULL"],
  ['must_change_password',    "TINYINT(1)   NOT NULL DEFAULT 1"],
]

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )
  return rows[0].n > 0
}

async function indexExists(table, indexName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  )
  return rows[0].n > 0
}

async function migrate() {
  console.log('\n🏗   Staff & Teacher Onboarding migration\n')

  // 1) users table columns
  let added = 0
  for (const [name, def] of USER_COLUMNS) {
    if (await columnExists('users', name)) {
      console.log(`  ⏭  users.${name} already exists`)
    } else {
      await pool.query(`ALTER TABLE users ADD COLUMN ${name} ${def}`)
      console.log(`  ✅ users.${name} added`)
      added++
    }
  }

  // 2) unique index on employee_id
  if (!(await indexExists('users', 'uq_users_employee_id'))) {
    try {
      await pool.query(`ALTER TABLE users ADD UNIQUE INDEX uq_users_employee_id (employee_id)`)
      console.log('  ✅ unique index on users.employee_id added')
    } catch (e) {
      console.log('  ⚠️  could not add unique index (duplicate employee_ids exist?) —', e.message)
    }
  } else {
    console.log('  ⏭  unique index on employee_id already exists')
  }

  // 3) teacher_assignments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      class      VARCHAR(20) NOT NULL,
      section    VARCHAR(5)  NOT NULL,
      subject    VARCHAR(40) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_assignment (user_id, class, section, subject),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ teacher_assignments table ready')

  // 4) staff_documents table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_documents (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      doc_type      VARCHAR(40)  NOT NULL,
      file_path     VARCHAR(255) NOT NULL,
      original_name VARCHAR(160) NULL,
      status        VARCHAR(15)  NOT NULL DEFAULT 'Uploaded',
      uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ staff_documents table ready')

  // 5) backfill employee IDs for existing users that have none
  const [res] = await pool.query(`
    UPDATE users
    SET employee_id = CONCAT(CASE WHEN role = 'teacher' THEN 'TCH-' ELSE 'EMP-' END, LPAD(id, 3, '0'))
    WHERE employee_id IS NULL OR employee_id = ''
  `)
  if (res.affectedRows > 0) console.log(`  ✅ backfilled employee IDs for ${res.affectedRows} existing user(s)`)

  console.log(`\n✅  Migration complete! (${added} new column(s) added)\n`)
  await pool.end()
}

migrate().catch((err) => {
  console.error('\n❌  Migration failed:', err.message)
  process.exit(1)
})
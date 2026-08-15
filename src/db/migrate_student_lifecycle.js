/**
 * EnrollIQ — Student Lifecycle (Phase 1)
 * --------------------------------------
 * Save as:  src/db/migrate_student_lifecycle.js
 * Run:      node src/db/migrate_student_lifecycle.js
 *
 * Adds lifecycle/exit columns to students and an exit-clearance table.
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function hasCol(table, col) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`, [table, col])
  return r[0].n > 0
}

async function addCol(table, col, ddl) {
  if (await hasCol(table, col)) { console.log(`  ⏭  ${table}.${col} exists`); return }
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  console.log(`  ✅ ${table}.${col} added`)
}

async function migrate() {
  console.log('\n🎓  Student Lifecycle migration (Phase 1)\n')

  // ── students: lifecycle + exit fields ──
  // status stays as-is but now supports the wider set of values.
  await addCol('students', 'exit_type',       "exit_type VARCHAR(40) NULL")        // Dropout, Withdrawn, School Transfer, Branch Transfer, Graduated, Expelled
  await addCol('students', 'exit_reason',      "exit_reason VARCHAR(500) NULL")
  await addCol('students', 'exit_date',        "exit_date DATE NULL")
  await addCol('students', 'exit_notes',       "exit_notes VARCHAR(1000) NULL")
  await addCol('students', 'archived',         "archived TINYINT(1) NOT NULL DEFAULT 0")
  await addCol('students', 'archived_at',      "archived_at TIMESTAMP NULL")
  await addCol('students', 'transfer_to',      "transfer_to VARCHAR(200) NULL")     // destination school/branch name

  // ── exit clearance checklist (one row per student exit) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_exit_clearance (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      student_id        INT NOT NULL,
      school_id         INT NOT NULL,
      fees_cleared      TINYINT(1) NOT NULL DEFAULT 0,
      fees_note         VARCHAR(300) NULL,
      library_cleared   TINYINT(1) NOT NULL DEFAULT 0,
      library_note      VARCHAR(300) NULL,
      transport_cleared TINYINT(1) NOT NULL DEFAULT 0,
      transport_note    VARCHAR(300) NULL,
      books_returned    TINYINT(1) NOT NULL DEFAULT 0,
      books_note        VARCHAR(300) NULL,
      principal_approved TINYINT(1) NOT NULL DEFAULT 0,
      principal_note    VARCHAR(300) NULL,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_exit_student (student_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ student_exit_clearance table ready')

  console.log('\n✅  Student lifecycle migration complete.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
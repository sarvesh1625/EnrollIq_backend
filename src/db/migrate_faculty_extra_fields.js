/**
 * EnrollIQ — add subject/years_experience columns to the existing
 * school_faculty table (created by migrate_faculty.js).
 * Save as: src/db/migrate_faculty_extra_fields.js
 * Run:     node src/db/migrate_faculty_extra_fields.js
 * Safe to re-run — checks for each column before adding it.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column])
  return rows[0].c > 0
}

async function migrate() {
  console.log('\n👩‍🏫  Adding subject / years_experience to school_faculty\n')

  if (!(await columnExists('school_faculty', 'subject'))) {
    await pool.query(`ALTER TABLE school_faculty ADD COLUMN subject VARCHAR(100) NULL AFTER role`)
    console.log('  ✅ Added subject column')
  } else {
    console.log('  ℹ  subject column already exists')
  }

  if (!(await columnExists('school_faculty', 'years_experience'))) {
    await pool.query(`ALTER TABLE school_faculty ADD COLUMN years_experience INT NULL AFTER subject`)
    console.log('  ✅ Added years_experience column')
  } else {
    console.log('  ℹ  years_experience column already exists')
  }

  console.log('\n✅  Done.\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
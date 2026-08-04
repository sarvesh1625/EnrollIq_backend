/**
 * EnrollIQ — Academic Year, part 2 (correct table names)
 * ------------------------------------------------------
 * Save as:  src/db/migrate_academic_year_2.js
 * Run:      node src/db/migrate_academic_year_2.js
 *
 * The first migration guessed at table names and skipped several.
 * This stamps academic_year_id on the tables your database actually has:
 *   class_attendance · fee_structures · payments · report_cards
 *   admissions · student_transport · transport_attendance
 *
 * Safe to re-run. Run migrate_academic_year.js first.
 */
require('dotenv').config()
const { pool } = require('./pool')

const TABLES = [
  'class_attendance',       // daily attendance
  'fee_structures',         // fee plans change every year
  'payments',               // fee collections
  'report_cards',           // generated report cards
  'admissions',             // applications target a specific intake year
  'student_transport',      // bus enrolment is per year
  'transport_attendance',   // daily bus scans
]

async function tableExists(t) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [t])
  return r[0].n > 0
}
async function columnExists(t, c) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [t, c])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n🎓  Academic Year — part 2 (real table names)\n')

  const [[activeYear]] = await pool.query(
    `SELECT id, name FROM academic_years WHERE is_active = 1 LIMIT 1`)
  if (!activeYear) {
    console.log('  ❌ No active academic year found. Run migrate_academic_year.js first.')
    await pool.end(); return
  }
  console.log(`  ℹ  Active year: ${activeYear.name}\n`)

  for (const t of TABLES) {
    if (!(await tableExists(t))) { console.log(`  ⏭  ${t} not present — skipped`); continue }

    if (!(await columnExists(t, 'academic_year_id'))) {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN academic_year_id INT NULL`)
      console.log(`  ✅ ${t}.academic_year_id added`)
    } else {
      console.log(`  ⏭  ${t}.academic_year_id exists`)
    }

    // index helps every "this year only" query later
    try {
      const [idx] = await pool.execute(
        `SELECT COUNT(*) n FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'idx_acad_year'`, [t])
      if (idx[0].n === 0) {
        await pool.query(`ALTER TABLE ${t} ADD INDEX idx_acad_year (academic_year_id)`)
      }
    } catch { /* non-fatal */ }

    const [r] = await pool.execute(
      `UPDATE ${t} SET academic_year_id = ? WHERE academic_year_id IS NULL`, [activeYear.id])
    if (r.affectedRows) console.log(`     ↳ stamped ${r.affectedRows} existing row(s)`)
  }

  console.log('\n✅  Part 2 complete — all year-scoped tables are stamped.\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
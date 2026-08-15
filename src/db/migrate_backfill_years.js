/**
 * EnrollIQ — Backfill missing academic_year_id before year-scoping
 * ----------------------------------------------------------------
 * Save as:  src/db/migrate_backfill_years.js
 * Run:      node src/db/migrate_backfill_years.js
 *
 * Some existing records (notably student_kit_issues) have no year set.
 * Filtering pages by year would make them vanish. This stamps any
 * unstamped rows to the FIRST/earliest year (2026-27), so nothing
 * disappears when scoping is turned on. Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

const TABLES = [
  'class_attendance', 'exams', 'exam_marks', 'report_cards',
  'fee_structures', 'payments', 'student_kit_issues',
]

async function columnExists(t, c) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [t, c])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n🎓  Backfilling missing academic_year_id\n')
  const [[firstYear]] = await pool.query(
    `SELECT id, name FROM academic_years ORDER BY name ASC LIMIT 1`)
  if (!firstYear) { console.log('  ❌ No academic years.'); await pool.end(); return }
  console.log(`  ℹ  Unstamped rows will be assigned to ${firstYear.name} (id ${firstYear.id})\n`)

  for (const t of TABLES) {
    if (!(await columnExists(t, 'academic_year_id'))) {
      console.log(`  ⏭  ${t} has no academic_year_id column, skipping`)
      continue
    }
    const [r] = await pool.execute(
      `UPDATE \`${t}\` SET academic_year_id=? WHERE academic_year_id IS NULL`, [firstYear.id])
    console.log(`  ✅ ${t.padEnd(20)} stamped ${r.affectedRows} row(s)`)
  }
  console.log('\n✅  Backfill complete. Safe to enable year filtering now.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
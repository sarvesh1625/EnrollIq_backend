/**
 * EnrollIQ — Backfill student_enrollments for the active year
 * -----------------------------------------------------------
 * Save as:  src/db/backfill_enrollments.js
 * Run:      node src/db/backfill_enrollments.js
 *
 * Any ACTIVE (non-archived) student without an enrollment row for the active
 * academic year gets one created, using their current class. This makes them
 * appear on the promotion page. Archived/exited students are skipped.
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  console.log('\n🎓  Backfilling enrollments for the active year\n')
  const [[ay]] = await pool.query('SELECT id, name FROM academic_years WHERE is_active=1 LIMIT 1')
  if (!ay) { console.log('  ❌ No active academic year.'); await pool.end(); return }
  console.log(`  Active year: ${ay.name} (id ${ay.id})\n`)

  // active, non-archived students with no enrollment in the active year
  const [missing] = await pool.query(`
    SELECT s.id, s.name, s.class, s.section, s.roll_number
    FROM students s
    WHERE (s.archived = 0 OR s.archived IS NULL)
      AND s.id NOT IN (
        SELECT student_id FROM student_enrollments WHERE academic_year_id = ?
      )`, [ay.id])

  if (!missing.length) { console.log('  ✅ Every active student already has an enrollment. Nothing to do.\n'); await pool.end(); return }

  for (const s of missing) {
    await pool.execute(
      `INSERT INTO student_enrollments (student_id, academic_year_id, class, section, roll_number, status)
       VALUES (?, ?, ?, ?, ?, 'Active')`,
      [s.id, ay.id, s.class, s.section || null, s.roll_number || null])
    console.log(`  ✅ enrolled ${s.name} (${s.class}) in ${ay.name}`)
  }
  console.log(`\n✅  Backfilled ${missing.length} enrollment(s).\n`)
  await pool.end()
}
run().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
/**
 * EnrollIQ — Fix student_kit_issues year stamps (v2)
 * --------------------------------------------------
 * Save as:  src/db/fix_kit_years.js   (overwrite the previous one)
 * Run:      node src/db/fix_kit_years.js
 *
 * Handles NULL-year kit rows that duplicate EITHER an existing stamped row
 * OR each other. Keeps one row per (student, item) for 2026-27, deletes the
 * rest, then stamps. Re-runnable.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function fix() {
  console.log('\n🧰  Fixing student_kit_issues year stamps (v2)\n')

  const [[first]] = await pool.query(`SELECT id FROM academic_years ORDER BY name ASC LIMIT 1`)
  const yearId = first.id  // 2026-27 = 1

  // 1. Delete NULL rows that duplicate an already-stamped 2026-27 row
  const [d1] = await pool.execute(`
    DELETE n FROM student_kit_issues n
    JOIN student_kit_issues e
      ON e.student_id = n.student_id
     AND e.item_id    = n.item_id
     AND e.academic_year_id = ?
    WHERE n.academic_year_id IS NULL`, [yearId])
  console.log(`  🗑  deleted ${d1.affectedRows} row(s) duplicating a stamped row`)

  // 2. Among remaining NULL rows, keep only the lowest id per (student,item),
  //    delete the other NULL duplicates.
  const [d2] = await pool.execute(`
    DELETE n FROM student_kit_issues n
    JOIN student_kit_issues k
      ON k.student_id = n.student_id
     AND k.item_id    = n.item_id
     AND k.academic_year_id IS NULL
     AND k.id < n.id
    WHERE n.academic_year_id IS NULL`)
  console.log(`  🗑  deleted ${d2.affectedRows} self-duplicate NULL row(s)`)

  // 3. Stamp the survivors to 2026-27
  const [upd] = await pool.execute(
    `UPDATE student_kit_issues SET academic_year_id = ? WHERE academic_year_id IS NULL`, [yearId])
  console.log(`  ✅ stamped ${upd.affectedRows} row(s) → 2026-27`)

  const [[left]] = await pool.query(`SELECT COUNT(*) c FROM student_kit_issues WHERE academic_year_id IS NULL`)
  console.log(`  ℹ  NULL-year rows remaining: ${left.c}`)
  console.log('\n✅  Kit years fixed.\n')
  await pool.end()
}
fix().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
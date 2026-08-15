/**
 * EnrollIQ — Stamp NULL-year leads/admissions to the active year
 * --------------------------------------------------------------
 * Save as:  src/db/fix_null_year_leads.js
 * Run:      node src/db/fix_null_year_leads.js
 *
 * Any lead or admission with academic_year_id = NULL is stamped to the
 * ACTIVE year, so it belongs to exactly one year (stops it showing in all
 * years). Re-runnable.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  console.log('\n🔧  Stamping NULL-year leads & admissions\n')
  const [[ay]] = await pool.query('SELECT id, name FROM academic_years WHERE is_active=1 LIMIT 1')
  if (!ay) { console.log('  ❌ No active year.'); await pool.end(); return }
  console.log(`  Active year: ${ay.name} (id ${ay.id})\n`)

  const [l] = await pool.execute('UPDATE leads SET academic_year_id=? WHERE academic_year_id IS NULL', [ay.id])
  console.log(`  ✅ stamped ${l.affectedRows} lead(s) → ${ay.name}`)

  const [a] = await pool.execute('UPDATE admissions SET academic_year_id=? WHERE academic_year_id IS NULL', [ay.id])
  console.log(`  ✅ stamped ${a.affectedRows} admission(s) → ${ay.name}`)

  console.log('\n✅  Done. Each lead/admission now belongs to one year.\n')
  await pool.end()
}
run().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
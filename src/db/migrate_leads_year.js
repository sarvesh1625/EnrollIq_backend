/**
 * EnrollIQ — Year-scope Leads + Admissions
 * ----------------------------------------
 * Save as:  src/db/migrate_leads_year.js
 * Run:      node src/db/migrate_leads_year.js
 *
 * 1. Adds academic_year_id to leads (if missing).
 * 2. Stamps EXISTING leads and admissions that have no year to the FIRST/
 *    earliest year (the year they were actually created in), NOT the active
 *    year — so old records show in their real year and disappear from the
 *    new active year.
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function columnExists(t, c) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [t, c])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n🎓  Year-scoping leads + admissions\n')

  // earliest year = the year existing records belong to
  const [[firstYear]] = await pool.query(
    `SELECT id, name FROM academic_years ORDER BY name ASC LIMIT 1`)
  const [[activeYear]] = await pool.query(
    `SELECT id, name FROM academic_years WHERE is_active = 1 LIMIT 1`)
  if (!firstYear) { console.log('  ❌ No academic years found.'); await pool.end(); return }

  console.log(`  ℹ  Existing records will be assigned to: ${firstYear.name} (id ${firstYear.id})`)
  console.log(`  ℹ  Active year is: ${activeYear?.name} (id ${activeYear?.id})\n`)

  // ── LEADS: add column ──
  if (!(await columnExists('leads', 'academic_year_id'))) {
    await pool.query(`ALTER TABLE leads ADD COLUMN academic_year_id INT NULL`)
    try { await pool.query(`ALTER TABLE leads ADD INDEX idx_leads_year (academic_year_id)`) } catch {}
    console.log('  ✅ leads.academic_year_id added')
  } else {
    console.log('  ⏭  leads.academic_year_id exists')
  }
  const [lr] = await pool.execute(
    `UPDATE leads SET academic_year_id = ? WHERE academic_year_id IS NULL`, [firstYear.id])
  console.log(`  ✅ stamped ${lr.affectedRows} lead(s) → ${firstYear.name}`)

  // ── ADMISSIONS: ensure column + stamp ──
  if (!(await columnExists('admissions', 'academic_year_id'))) {
    await pool.query(`ALTER TABLE admissions ADD COLUMN academic_year_id INT NULL`)
    try { await pool.query(`ALTER TABLE admissions ADD INDEX idx_adm_year (academic_year_id)`) } catch {}
    console.log('  ✅ admissions.academic_year_id added')
  }
  const [ar] = await pool.execute(
    `UPDATE admissions SET academic_year_id = ? WHERE academic_year_id IS NULL`, [firstYear.id])
  console.log(`  ✅ stamped ${ar.affectedRows} admission(s) → ${firstYear.name}`)

  console.log('\n✅  Done. Existing leads/admissions now belong to ' + firstYear.name + '.')
  console.log('   New ones will get the active year automatically (after the')
  console.log('   controller update). Switch the active year to see them separate.\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
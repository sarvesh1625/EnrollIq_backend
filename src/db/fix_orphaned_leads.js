const { pool } = require('./pool')

async function fix() {
  console.log('🔧 Backfilling academic_year_id on orphaned leads...\n')

  const [[activeYear]] = await pool.query('SELECT id FROM academic_years WHERE is_active=1 LIMIT 1')
  if (!activeYear) {
    console.log('  ⚠  No active academic year found — nothing to backfill against. Exiting.')
    await pool.end()
    return
  }

  const [result] = await pool.execute(
    `UPDATE leads SET academic_year_id=? WHERE academic_year_id IS NULL`,
    [activeYear.id])

  console.log(`  ✅ Backfilled ${result.affectedRows} lead(s) with academic_year_id=${activeYear.id}`)
  console.log('\n✅  Done. These leads should now appear on the dashboard.\n')
  await pool.end()
}
fix().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) }) 
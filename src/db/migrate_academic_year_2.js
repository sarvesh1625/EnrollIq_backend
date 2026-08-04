require('dotenv').config()
const { pool } = require('./pool')
const TABLES = ['class_attendance','fee_structures','payments','report_cards',
                'admissions','student_transport','transport_attendance']

async function has(t, c) {
  const q = c
    ? `SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`
    : `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`
  const [r] = await pool.execute(q, c ? [t, c] : [t])
  return r[0].n > 0
}

async function run() {
  console.log('\n Academic Year - part 2\n')
  const [[y]] = await pool.query(`SELECT id,name FROM academic_years WHERE is_active=1 LIMIT 1`)
  if (!y) { console.log('  No active year. Run migrate_academic_year.js first.'); await pool.end(); return }
  console.log('  Active year:', y.name, '\n')

  for (const t of TABLES) {
    if (!(await has(t))) { console.log('  [skip] ' + t + ' not present'); continue }
    if (!(await has(t, 'academic_year_id'))) {
      await pool.query('ALTER TABLE ' + t + ' ADD COLUMN academic_year_id INT NULL')
      console.log('  [ok] ' + t + '.academic_year_id added')
    } else {
      console.log('  [skip] ' + t + '.academic_year_id exists')
    }
    try { await pool.query('ALTER TABLE ' + t + ' ADD INDEX idx_acad_year (academic_year_id)') } catch {}
    const [r] = await pool.execute('UPDATE ' + t + ' SET academic_year_id=? WHERE academic_year_id IS NULL', [y.id])
    if (r.affectedRows) console.log('        stamped ' + r.affectedRows + ' row(s)')
  }
  console.log('\n Part 2 complete.\n')
  await pool.end()
}
run().catch(e => { console.error('Failed:', e.message); process.exit(1) })

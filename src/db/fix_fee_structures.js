/**
 * EnrollIQ — Fix fee_structures columns
 * -------------------------------------
 * Save as:  src/db/fix_fee_structures.js
 * Run:      node src/db/fix_fee_structures.js
 *
 * The fee_structures table is missing columns the code expects
 * (class_name, fee_type, term, due_day), causing
 * "Unknown column 'class_name'". This adds them safely. Re-runnable.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function has(col) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='fee_structures' AND column_name=?`, [col])
  return r[0].n > 0
}

async function fix() {
  console.log('\n🔧  Fixing fee_structures columns\n')

  const adds = [
    ['class_name', "ALTER TABLE fee_structures ADD COLUMN class_name VARCHAR(50) NULL"],
    ['fee_type',   "ALTER TABLE fee_structures ADD COLUMN fee_type VARCHAR(50) NULL"],
    ['term',       "ALTER TABLE fee_structures ADD COLUMN term VARCHAR(30) NULL"],
    ['due_day',    "ALTER TABLE fee_structures ADD COLUMN due_day INT NULL"],
  ]
  for (const [col, sql] of adds) {
    if (await has(col)) { console.log(`  ⏭  ${col} already exists`); continue }
    await pool.query(sql)
    console.log(`  ✅ added ${col}`)
  }

  // If an old 'class' column exists with data, copy it into class_name
  if (await has('class') && await has('class_name')) {
    await pool.query("UPDATE fee_structures SET class_name = `class` WHERE class_name IS NULL AND `class` IS NOT NULL")
    console.log('  ✅ copied existing class → class_name')
  }
  // If old 'name' column held the fee type, copy into fee_type
  if (await has('name') && await has('fee_type')) {
    await pool.query("UPDATE fee_structures SET fee_type = name WHERE fee_type IS NULL AND name IS NOT NULL")
    console.log('  ✅ copied existing name → fee_type')
  }

  // Make any legacy NOT-NULL columns nullable so they don't block inserts
  // from the new code (which doesn't populate old columns like 'name').
  for (const col of ['name', 'class', 'academic_year']) {
    if (await has(col)) {
      try {
        // detect type, then re-declare as NULL default NULL
        const [[info]] = await pool.query(
          `SELECT COLUMN_TYPE ct FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='fee_structures' AND column_name=?`, [col])
        await pool.query(`ALTER TABLE fee_structures MODIFY COLUMN \`${col}\` ${info.ct} NULL DEFAULT NULL`)
        console.log(`  ✅ made '${col}' nullable`)
      } catch (e) { console.log(`  ⏭  could not alter '${col}': ${e.message}`) }
    }
  }

  console.log('\n✅  fee_structures fixed. Fee structure creation will work now.\n')
  await pool.end()
}
fix().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
/**
 * scripts/backfillEnrollments.js
 *
 * Fixes: "0 students in 2026-27" on the Promotion page, while the
 * Students page correctly shows 31 students.
 *
 * Cause: students exist in the `students` table but have no matching
 * row in `student_enrollments` for the active academic year — so the
 * Promotion page's candidates query (which JOINs student_enrollments)
 * never finds them.
 *
 * This script creates the missing enrollment row for every active,
 * non-archived student who doesn't already have one for the given year,
 * using their current `students.class` / `students.section` / `students.roll_number`.
 *
 * USAGE (run from your backend project root, where `../db/pool` resolves):
 *
 *   node scripts/backfillEnrollments.js                # dry run — shows what would be created
 *   node scripts/backfillEnrollments.js --confirm       # actually inserts the missing rows
 *   node scripts/backfillEnrollments.js --year=3 --confirm
 *                                                        # target a specific academic_year_id
 *                                                        # instead of the currently active year
 *
 * Adjust the require path below if this script doesn't sit in a `scripts/`
 * folder at the same level as your `db/` folder.
 */

const { pool } = require('../src/db/pool')

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (name) => {
    const hit = args.find(a => a.startsWith(`--${name}=`))
    return hit ? hit.split('=')[1] : null
  }
  return {
    confirm: args.includes('--confirm'),
    yearArg: get('year'),
  }
}

async function main() {
  const { confirm, yearArg } = parseArgs()

  try {
    let yearId = yearArg
    let yearName = null

    if (yearId) {
      const [[y]] = await pool.execute(`SELECT id, name FROM academic_years WHERE id = ?`, [yearId])
      if (!y) { console.error(`❌ No academic_years row with id=${yearId}`); process.exit(1) }
      yearName = y.name
    } else {
      const [[active]] = await pool.query(`SELECT id, name FROM academic_years WHERE is_active = 1 LIMIT 1`)
      if (!active) { console.error('❌ No active academic year found. Pass --year=<id> explicitly.'); process.exit(1) }
      yearId = active.id
      yearName = active.name
    }

    // Students missing an enrollment row for this year
    const [missing] = await pool.execute(`
      SELECT s.id AS student_id, s.name, s.roll_number, s.class, s.section
      FROM students s
      LEFT JOIN student_enrollments e
        ON e.student_id = s.id AND e.academic_year_id = ?
      WHERE e.id IS NULL
        AND (s.archived = 0 OR s.archived IS NULL)
        AND s.class IS NOT NULL AND s.class != ''
    `, [yearId])

    console.log(`\nAcademic year: ${yearName} (id=${yearId})`)
    console.log(`Students missing an enrollment row: ${missing.length}\n`)

    if (missing.length === 0) {
      console.log('Nothing to backfill.')
      process.exit(0)
    }

    missing.slice(0, 10).forEach(s => {
      console.log(`  - ${s.name} (${s.roll_number || 'no roll'}) -> ${s.class}${s.section ? '-' + s.section : ''}`)
    })
    if (missing.length > 10) console.log(`  ...and ${missing.length - 10} more`)

    if (!confirm) {
      console.log('\n🔎 Dry run only — no rows created.')
      console.log('   Re-run with --confirm to actually create these enrollment rows.\n')
      process.exit(0)
    }

    console.log('\n⚠️  Creating missing enrollment rows...')

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      let created = 0
      for (const s of missing) {
        await conn.execute(
          `INSERT INTO student_enrollments
             (student_id, academic_year_id, class, section, roll_number, status)
           VALUES (?, ?, ?, ?, ?, 'Active')
           ON DUPLICATE KEY UPDATE class = VALUES(class), section = VALUES(section), status = 'Active'`,
          [s.student_id, yearId, s.class, s.section || null, s.roll_number || null]
        )
        created++
      }
      await conn.commit()
      console.log(`✅ Created/updated ${created} enrollment rows for ${yearName}.\n`)
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    process.exit(0)
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
/**
 * EnrollIQ — Academic Year + Student Promotion migration
 * ------------------------------------------------------
 * Save as:  src/db/migrate_academic_year.js
 * Run:      node src/db/migrate_academic_year.js
 *
 * WHAT THIS FIXES
 * Until now a student's class lived only on the students table, so promoting
 * a student silently rewrote their history. This adds:
 *   • academic_years        — 2025-26, 2026-27, one marked active
 *   • student_enrollments   — one row per student PER YEAR (class/section/roll)
 *   • academic_year_id      — stamped on attendance / fees / kit / marks
 *
 * students.class is KEPT and still updated on promotion, so every existing
 * page keeps working exactly as before. Enrollments are the history layer.
 *
 * Safe to re-run. Skips anything that already exists.
 */
require('dotenv').config()
const { pool } = require('./pool')

/* ── helpers ─────────────────────────────────────────────── */
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
async function indexExists(t, i) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, [t, i])
  return r[0].n > 0
}
async function addYearColumn(t) {
  if (!(await tableExists(t)))      { console.log(`  ⏭  ${t} not present — skipped`); return }
  if (await columnExists(t, 'academic_year_id')) { console.log(`  ⏭  ${t}.academic_year_id exists`); return }
  await pool.query(`ALTER TABLE ${t} ADD COLUMN academic_year_id INT NULL`)
  console.log(`  ✅ ${t}.academic_year_id added`)
}

/* ── current + next academic year names (Indian Jun–Mar cycle) ─ */
function yearNames() {
  const now = new Date()
  const startYr = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1  // Jun cutoff
  const cur  = `${startYr}-${String(startYr + 1).slice(-2)}`
  const next = `${startYr + 1}-${String(startYr + 2).slice(-2)}`
  return { startYr, cur, next }
}

async function migrate() {
  console.log('\n🎓  Academic Year + Promotion migration\n')

  /* 1) academic_years */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS academic_years (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(20) NOT NULL UNIQUE,     -- '2026-27'
      start_date DATE NULL,
      end_date   DATE NULL,
      is_active  TINYINT(1) NOT NULL DEFAULT 0,
      is_closed  TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('  ✅ academic_years table ready')

  /* 2) student_enrollments — the history layer */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_enrollments (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      student_id       INT NOT NULL,
      academic_year_id INT NOT NULL,
      class            VARCHAR(20) NOT NULL,
      section          VARCHAR(5)  NULL,
      roll_number      VARCHAR(20) NULL,
      status           VARCHAR(15) NOT NULL DEFAULT 'Active',
        -- Active | Promoted | Detained | Transferred | Graduated
      promoted_to      VARCHAR(20) NULL,
      remarks          VARCHAR(160) NULL,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_enroll (student_id, academic_year_id),
      INDEX idx_year_class (academic_year_id, class),
      FOREIGN KEY (student_id)       REFERENCES students(id)       ON DELETE CASCADE,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ student_enrollments table ready')

  /* 3) seed current + next year */
  const { startYr, cur, next } = yearNames()
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) n FROM academic_years`)
  if (n === 0) {
    await pool.execute(
      `INSERT INTO academic_years (name, start_date, end_date, is_active) VALUES (?,?,?,1)`,
      [cur, `${startYr}-06-01`, `${startYr + 1}-03-31`])
    await pool.execute(
      `INSERT INTO academic_years (name, start_date, end_date, is_active) VALUES (?,?,?,0)`,
      [next, `${startYr + 1}-06-01`, `${startYr + 2}-03-31`])
    console.log(`  ✅ seeded academic years ${cur} (active) and ${next}`)
  } else {
    console.log(`  ⏭  academic_years already has ${n} row(s)`)
  }

  const [[activeYear]] = await pool.query(
    `SELECT id, name FROM academic_years WHERE is_active = 1 LIMIT 1`)

  /* 4) stamp academic_year_id on year-scoped tables */
  for (const t of ['attendance', 'fees', 'fee_payments', 'student_kit_issues',
                   'exams', 'exam_marks', 'marks']) {
    await addYearColumn(t)
  }

  /* 5) kit re-issue fix — unique key must include the year,
        otherwise a promoted student can never be issued a new kit.
        ORDER MATTERS: MySQL refuses to drop an index a foreign key relies on,
        so the replacement is created FIRST (it also starts with student_id,
        so the FK can use it), and only then is the old one dropped. */
  if (await tableExists('student_kit_issues')) {
    // backfill the year on existing kit rows before adding the unique key
    if (activeYear && await columnExists('student_kit_issues', 'academic_year_id')) {
      await pool.execute(
        `UPDATE student_kit_issues SET academic_year_id = ? WHERE academic_year_id IS NULL`,
        [activeYear.id])
    }
    if (!(await indexExists('student_kit_issues', 'uq_issue_year'))) {
      try {
        await pool.query(
          `ALTER TABLE student_kit_issues
           ADD UNIQUE KEY uq_issue_year (student_id, item_id, academic_year_id)`)
        console.log('  ✅ kit unique key now includes academic year (re-issue works)')
      } catch (e) {
        console.log('  ⚠️  could not add kit year key —', e.message)
      }
    } else {
      console.log('  ⏭  kit year unique key already exists')
    }
    if (await indexExists('student_kit_issues', 'uq_issue')) {
      try {
        await pool.query(`ALTER TABLE student_kit_issues DROP INDEX uq_issue`)
        console.log('  ✅ dropped old kit unique key (student,item)')
      } catch (e) {
        console.log('  ⚠️  old kit key left in place —', e.message)
      }
    }
  }

  /* 6) backfill — existing records belong to the active year */
  if (activeYear) {
    // enrollments from current students
    if (await tableExists('students')) {
      const hasSection = await columnExists('students', 'section')
      const hasRoll    = await columnExists('students', 'roll_number')
      const [res] = await pool.execute(
        `INSERT IGNORE INTO student_enrollments
           (student_id, academic_year_id, class, section, roll_number, status)
         SELECT id, ?, COALESCE(class,'Unassigned'),
                ${hasSection ? 'section' : 'NULL'},
                ${hasRoll ? 'roll_number' : 'NULL'}, 'Active'
         FROM students`, [activeYear.id])
      if (res.affectedRows) console.log(`  ✅ created ${res.affectedRows} enrollment(s) for ${activeYear.name}`)
    }
    // stamp existing rows
    for (const t of ['attendance', 'fees', 'fee_payments', 'student_kit_issues',
                     'exams', 'exam_marks', 'marks']) {
      if (!(await tableExists(t)) || !(await columnExists(t, 'academic_year_id'))) continue
      const [r] = await pool.execute(
        `UPDATE ${t} SET academic_year_id = ? WHERE academic_year_id IS NULL`, [activeYear.id])
      if (r.affectedRows) console.log(`  ✅ stamped ${r.affectedRows} row(s) in ${t}`)
    }
  }

  console.log('\n✅  Academic Year migration complete!\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Migration failed:', e.message); process.exit(1) })
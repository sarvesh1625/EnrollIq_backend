/**
 * EnrollIQ - Lead counsellors + fee reminders migration
 * Run:  node src/db/migrate_counsellors_fees.js
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column])
  return rows[0].n > 0
}

async function addColumn(table, column, def) {
  if (await columnExists(table, column)) { console.log(`  skip  ${table}.${column}`); return }
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  console.log(`  added ${table}.${column}`)
}

async function migrate() {
  console.log('\nLead counsellors + fee reminders migration\n')

  // Counsellor flags on users
  await addColumn('users', 'is_counsellor',        'TINYINT(1) NOT NULL DEFAULT 0')
  await addColumn('users', 'counsellor_available', 'TINYINT(1) NOT NULL DEFAULT 1')

  // Who/when/how a lead was assigned
  await addColumn('leads', 'assigned_at',  'DATETIME NULL')
  await addColumn('leads', 'assigned_by',  'INT NULL')
  await addColumn('leads', 'assign_method', "VARCHAR(10) NULL")   // 'auto' | 'manual'

  // Per-school switch for automatic assignment
  await addColumn('schools', 'auto_assign_leads', 'TINYINT(1) NOT NULL DEFAULT 1')

  // Assignment history
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_assignments (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      school_id  INT NOT NULL,
      lead_id    INT NOT NULL,
      from_user  INT NULL,
      to_user    INT NULL,
      method     VARCHAR(10) NOT NULL,
      by_user    INT NULL,
      reason     VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_la_lead (lead_id),
      INDEX idx_la_school (school_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.log('  ok    lead_assignments')

  // Fee reminder log (also prevents sending the same reminder twice)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fee_reminder_log (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      school_id  INT NOT NULL,
      payment_id INT NOT NULL,
      student_id INT NULL,
      stage      VARCHAR(20) NOT NULL,      -- before3 | due_today | overdue
      sent_on    DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_frl (payment_id, stage, sent_on),
      INDEX idx_frl_school (school_id, sent_on)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.log('  ok    fee_reminder_log')

  console.log('\nDone.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\nFailed:', e.message); process.exit(1) })
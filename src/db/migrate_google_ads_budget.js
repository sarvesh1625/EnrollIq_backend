/**
 * EnrollIQ — Google Ads budget tracking
 * ----------------------------------------
 * Save as:  src/db/migrate_google_ads_budget.js
 * Run:      node src/db/migrate_google_ads_budget.js
 * (Run this AFTER migrate_google_ads.js — it adds columns to that table.)
 *
 * Adds budget/spend columns to google_ads_connections so the Ads dashboard
 * can show "budget allocated / spent / remaining" — pulled from Google's
 * account_budget resource (read-only; EnrollIQ can never add funds).
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column])
  return rows[0].c > 0
}

async function run() {
  const cols = [
    ['budget_limit',       'DECIMAL(12,2) NULL'],   // total approved spending limit (NULL if the account has no cap / is postpaid)
    ['budget_spent',       'DECIMAL(12,2) NULL'],   // amount served/spent against that limit so far
    ['budget_is_postpaid', 'TINYINT(1) NULL'],      // true if this account bills monthly rather than a prepaid limit
    ['budget_updated_at',  'DATETIME NULL'],
  ]
  for (const [name, def] of cols) {
    if (!(await columnExists('google_ads_connections', name))) {
      await pool.query(`ALTER TABLE google_ads_connections ADD COLUMN ${name} ${def}`)
      console.log(`  + added column ${name}`)
    } else {
      console.log(`  · ${name} already exists, skipping`)
    }
  }
  console.log('✅ google_ads_connections budget columns ready')
  process.exit(0)
}

run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })
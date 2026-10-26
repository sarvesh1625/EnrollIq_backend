/**
 * EnrollIQ — tracker push (CTPL) migration
 * Save as:  backend/src/db/migrate_gps_push.js
 * Run:      node src/db/migrate_gps_push.js      (safe to re-run)
 *
 *  1. bus_locations.device_time  — the tracker's own timestamp (used to ignore old / out-of-order packets)
 *  2. bus_locations.power        — tracker power state sent by the company
 *  3. gps_unknown_devices        — IMEIs that pushed to us but are not saved on any bus
 */
require('dotenv').config()
const { pool } = require('./pool')

const has = async (t, c) => (await pool.query(
  `SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [t, c]))[0][0].c > 0

async function run() {
  console.log('\n📡  Tracker push migration\n')
  for (const [col, def] of [['device_time', 'DATETIME NULL'], ['power', 'VARCHAR(20) NULL']]) {
    if (await has('bus_locations', col)) console.log(`  ⏭  bus_locations.${col} exists`)
    else { await pool.query(`ALTER TABLE bus_locations ADD COLUMN ${col} ${def}`); console.log(`  ✅ bus_locations.${col} added`) }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gps_unknown_devices (
      imei         VARCHAR(20) PRIMARY KEY,
      first_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      packets      INT NOT NULL DEFAULT 1,
      last_vehicle VARCHAR(80) NULL,
      last_lat     DECIMAL(10,7) NULL,
      last_lng     DECIMAL(10,7) NULL
    )`)
  console.log('  ✅ gps_unknown_devices ready')
  console.log('\n✅  Done\n')
  await pool.end()
}
run().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
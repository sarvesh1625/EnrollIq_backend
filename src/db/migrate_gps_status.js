/**
 * EnrollIQ — GPS device status fields for live tracking
 * -----------------------------------------------------
 * Save as:  src/db/migrate_gps_status.js
 * Run:      node src/db/migrate_gps_status.js
 *
 * Adds hardware-tracker fields to bus_locations so the map can show
 * device online/offline, signal, ignition, battery, and a Traccar link.
 * Works whether location comes from a driver phone OR a GPS device.
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

const COLS = [
  ['ignition',      "TINYINT(1)  NULL"],          // engine on/off (wired trackers)
  ['satellites',    "INT         NULL"],          // GPS satellites in view (signal quality)
  ['battery',       "INT         NULL"],          // device battery %
  ['source',        "VARCHAR(10) NULL DEFAULT 'phone'"],  // phone | device
  ['device_id',     "VARCHAR(40) NULL"],          // tracker IMEI / Traccar device id
  ['address',       "VARCHAR(200) NULL"],         // reverse-geocoded, if available
]

async function columnExists(t, c) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [t, c])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n📡  GPS device status migration\n')

  for (const [name, def] of COLS) {
    if (await columnExists('bus_locations', name)) {
      console.log(`  ⏭  bus_locations.${name} exists`)
    } else {
      await pool.query(`ALTER TABLE bus_locations ADD COLUMN ${name} ${def}`)
      console.log(`  ✅ bus_locations.${name} added`)
    }
  }

  // Optional: store a Traccar device id on each bus for the sync service
  if (!(await columnExists('buses', 'gps_device_id'))) {
    // (may already exist from your original schema — createBus uses it)
    await pool.query(`ALTER TABLE buses ADD COLUMN gps_device_id VARCHAR(40) NULL`)
    console.log('  ✅ buses.gps_device_id added')
  } else {
    console.log('  ⏭  buses.gps_device_id exists')
  }

  console.log('\n✅  GPS status migration complete!\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
/**
 * EnrollIQ — Live Bus Tracking + Cameras migration (Node)
 * -------------------------------------------------------
 * Save as:  src/db/migrate_tracking_cameras.js
 * Run:      node src/db/migrate_tracking_cameras.js
 *
 * Creates: bus_locations (live GPS), cameras (CCTV feeds)
 * Seeds a couple of demo cameras (public test streams) so the
 * camera grid is demoable with no hardware.
 * Safe to re-run on any environment.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('\n📍  Live Tracking + Cameras migration\n')

  // 1) Live bus location (one row per bus, updated in place)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bus_locations (
      bus_id       INT PRIMARY KEY,
      latitude     DECIMAL(10,7) NULL,
      longitude    DECIMAL(10,7) NULL,
      speed        DECIMAL(6,2)  NULL,          -- km/h
      heading      DECIMAL(6,2)  NULL,          -- degrees 0-360
      trip_active  TINYINT(1)    NOT NULL DEFAULT 0,
      trip_type    VARCHAR(10)   NULL,          -- Pickup | Drop
      driver_name  VARCHAR(80)   NULL,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ bus_locations table ready')

  // 2) Optional location history (breadcrumb trail) — kept small
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bus_location_history (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      bus_id     INT NOT NULL,
      latitude   DECIMAL(10,7) NOT NULL,
      longitude  DECIMAL(10,7) NOT NULL,
      speed      DECIMAL(6,2)  NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bus_time (bus_id, recorded_at),
      FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ bus_location_history table ready')

  // 3) Cameras (CCTV feeds per school)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cameras (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(80)  NOT NULL,
      location    VARCHAR(80)  NULL,            -- 'Main Gate', 'Playground'
      stream_url  TEXT         NOT NULL,        -- HLS (.m3u8), MP4, or embed URL
      stream_type VARCHAR(10)  NOT NULL DEFAULT 'hls',  -- hls | mp4 | iframe
      is_active   TINYINT(1)   NOT NULL DEFAULT 1,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('  ✅ cameras table ready')

  // 4) Seed demo cameras (public HLS test streams) if empty
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM cameras`)
  if (n === 0) {
    const demo = [
      ['Main Gate',      'Entrance',   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls'],
      ['Playground',     'Outdoor',    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls'],
      ['Reception',      'Lobby',      'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls'],
      ['Corridor A',     '1st Floor',  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls'],
    ]
    for (const [name, loc, url, type] of demo) {
      await pool.execute(
        `INSERT INTO cameras (name, location, stream_url, stream_type) VALUES (?,?,?,?)`,
        [name, loc, url, type])
    }
    console.log(`  ✅ seeded ${demo.length} demo cameras (public test stream)`)
  } else {
    console.log(`  ⏭  cameras already has ${n} row(s) — skipping seed`)
  }

  console.log('\n✅  Live Tracking + Cameras migration complete!\n')
  await pool.end()
}

migrate().catch((err) => {
  console.error('\n❌  Migration failed:', err.message)
  process.exit(1)
})
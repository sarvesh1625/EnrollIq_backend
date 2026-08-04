/**
 * EnrollIQ — One-shot database setup for deployment
 * -------------------------------------------------
 * Save as:  src/db/deploy_setup.js
 * Run:      node src/db/deploy_setup.js
 *
 * Runs EVERY migration in the correct dependency order against whatever
 * database your pool.js points to. Point pool.js (via .env) at your
 * Railway MySQL, run this once, and the whole schema is created there.
 *
 * Safe to re-run: each migration uses CREATE TABLE IF NOT EXISTS and
 * guarded ALTERs, so running twice does no harm.
 *
 * NOTE: this runs each migration file in its own process so that a file
 * calling pool.end() cannot close the pool for the others.
 */
const { execSync } = require('child_process')
const path = require('path')

// Order matters: base schema first, then feature migrations, then
// cross-cutting/patch migrations that depend on earlier tables.
const ORDER = [
  // ── base schema (schools, users, leads, admissions, students, fees…) ──
  'migrate.js',

  // ── feature areas ──
  'migrate_discovery.js',        // schools discovery columns + gallery/testimonials
  'migrate_landing.js',          // landing/profile columns
  'migrate_gallery.js',          // school_gallery (if not already in discovery)
  'migrate_ads.js',              // ads
  'migrate_communication.js',    // messages/announcements
  'migrate_superadmin.js',       // super admin
  'migrate_phase2.js',           // phase-2 tables
  'migrate_staff_onboarding.js', // staff/teacher onboarding
  'migrate_school_kit.js',       // school kit
  'migrate_transport.js',        // buses, routes, drivers, transport tables
  'migrate_tracking_cameras.js', // live tracking + cameras (needs buses)
  'migrate_gps_status.js',       // GPS device status fields
  'migrate_cameras_school.js',   // cameras multi-school isolation
  'migrate_faculty.js',          // faculty
  'migrate_academic_year.js',    // academic years + enrollments
  'migrate_academic_year_2.js',  // year-stamp remaining tables

  // ── fixes / column patches (run late; they patch earlier tables) ──
  'fix_schools_columns.js',
]

// Optional seeds — uncomment if you want demo data + an admin login.
// Make sure these files exist in src/db first.
const SEEDS = [
  'seed.js',                // demo school + admin login (admin@school.com / Admin@123) + leads + students
  'seed_transport.js',      // demo buses/routes/drivers
  'seed_communication.js',  // demo messages/announcements
]

const dir = __dirname

function run(file) {
  const full = path.join(dir, file)
  process.stdout.write(`\n▶  ${file}\n`)
  try {
    execSync(`node "${full}"`, { stdio: 'inherit' })
    console.log(`✅  ${file} done`)
    return true
  } catch (e) {
    console.error(`❌  ${file} FAILED (continuing) — ${e.message}`)
    return false
  }
}

;(function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  EnrollIQ — full database setup')
  console.log('══════════════════════════════════════════')

  const results = []
  for (const f of ORDER) results.push([f, run(f)])
  for (const f of SEEDS)  results.push([f, run(f)])

  console.log('\n══════════════════════════════════════════')
  console.log('  Summary')
  console.log('══════════════════════════════════════════')
  results.forEach(([f, ok]) => console.log(`  ${ok ? '✅' : '❌'}  ${f}`))
  const failed = results.filter(([, ok]) => !ok)
  if (failed.length) {
    console.log(`\n⚠️  ${failed.length} file(s) failed. Some may be safe to ignore`)
    console.log('   (e.g. a table already existing). Check the messages above.')
  } else {
    console.log('\n🎉  All migrations completed. Your database is ready.')
  }
  process.exit(0)
})()

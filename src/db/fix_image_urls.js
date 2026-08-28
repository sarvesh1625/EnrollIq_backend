const { pool } = require('./pool')

async function fix() {
  console.log('🔧 Fixing stale localhost:5000 image URLs...\n')

  // 1. School banners
  const [b] = await pool.execute(
    `UPDATE schools SET banner_url = REPLACE(banner_url, 'http://localhost:5000', '')
     WHERE banner_url LIKE 'http://localhost:5000%'`)
  console.log(`  ✅ Fixed ${b.affectedRows} school banner_url row(s)`)

  // 2. Gallery images
  const [g] = await pool.execute(
    `UPDATE school_gallery SET image_url = REPLACE(image_url, 'http://localhost:5000', '')
     WHERE image_url LIKE 'http://localhost:5000%'`)
  console.log(`  ✅ Fixed ${g.affectedRows} school_gallery row(s)`)

  // 3. Verify nothing bad is left (any localhost port, not just 5000)
  const [[remaining]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM schools WHERE banner_url LIKE 'http://localhost%') AS banners_left,
       (SELECT COUNT(*) FROM school_gallery WHERE image_url LIKE 'http://localhost%') AS gallery_left`)
  console.log(`  ℹ  Remaining bad rows — banners: ${remaining.banners_left}, gallery: ${remaining.gallery_left}`)

  console.log('\n✅  Image URLs fixed.\n')
  await pool.end()
}
fix().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
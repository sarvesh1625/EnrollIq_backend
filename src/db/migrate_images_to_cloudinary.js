require('dotenv').config()
const cloudinary = require('cloudinary').v2
const path = require('path')
const fs   = require('fs')
const { pool } = require('./pool')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const uploadDir  = path.join(__dirname, '../../uploads/banners')
const galleryDir = path.join(__dirname, '../../uploads/gallery')

// Handles both '/api/discovery/banners/x.png' and 'http://localhost:5000/api/discovery/banners/x.png'
function extractFilename(url) {
  return url.split('/').pop()
}

async function migrate() {
  console.log('☁️  Migrating local images to Cloudinary...\n')

  // ── Banners ──
  const [schools] = await pool.execute(
    `SELECT id, banner_url FROM schools
     WHERE banner_url IS NOT NULL AND banner_url != ''
       AND banner_url NOT LIKE 'https://res.cloudinary.com%'`)
  let bannersFixed = 0
  for (const sc of schools) {
    const filename = extractFilename(sc.banner_url)
    const filePath = path.join(uploadDir, filename)
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠  Skipping school ${sc.id}: local file not found (${filename})`)
      continue
    }
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'enrolliq/banners', public_id: `school_${sc.id}_migrated`, overwrite: true,
    })
    await pool.execute('UPDATE schools SET banner_url=? WHERE id=?', [result.secure_url, sc.id])
    console.log(`  ✅ School ${sc.id} banner → ${result.secure_url}`)
    bannersFixed++
  }

  // ── Gallery ──
  const [gallery] = await pool.execute(
    `SELECT id, image_url FROM school_gallery
     WHERE image_url NOT LIKE 'https://res.cloudinary.com%'`)
  let galleryFixed = 0
  for (const g of gallery) {
    const filename = extractFilename(g.image_url)
    const filePath = path.join(galleryDir, filename)
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠  Skipping gallery row ${g.id}: local file not found (${filename})`)
      continue
    }
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'enrolliq/gallery', public_id: `gallery_${g.id}_migrated`, overwrite: true,
    })
    await pool.execute('UPDATE school_gallery SET image_url=? WHERE id=?', [result.secure_url, g.id])
    console.log(`  ✅ Gallery row ${g.id} → ${result.secure_url}`)
    galleryFixed++
  }

  console.log(`\n✅  Done. Banners migrated: ${bannersFixed}, Gallery migrated: ${galleryFixed}\n`)
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })
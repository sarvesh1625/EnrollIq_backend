/**
 * EnrollIQ — Cloudinary upload service
 * Save as:  src/services/cloudinaryService.js
 *
 * Requires env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * Install: npm install cloudinary
 */
const cloudinary = require('cloudinary').v2

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Upload a buffer (from multer memoryStorage) to Cloudinary.
// resource_type 'auto' handles images, PDFs, and other files.
function uploadBuffer(buffer, folder = 'enrolliq/diary', filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', public_id: filename ? filename.replace(/\.[^.]+$/, '') : undefined },
      (err, result) => {
        if (err) return reject(err)
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          bytes: result.bytes,
        })
      }
    )
    stream.end(buffer)
  })
}

function isConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

module.exports = { uploadBuffer, isConfigured, cloudinary }
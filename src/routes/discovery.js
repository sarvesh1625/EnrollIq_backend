const router  = require('express').Router()
const { pool }= require('../db/pool')
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')
const { protect } = require('../middleware/auth')

// ── Upload setup — Cloudinary (persists across redeploys) ─────────────────────
const cloudinary = require('cloudinary').v2
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const memStorage = multer.memoryStorage()
const imgFilter = (req, file, cb) => {
  ['.jpg','.jpeg','.png','.webp'].includes(path.extname(file.originalname).toLowerCase())
    ? cb(null, true) : cb(new Error('Images only'))
}

const uploadBanner  = multer({ storage: memStorage, limits:{fileSize:5*1024*1024}, fileFilter: imgFilter })
const uploadGallery = multer({ storage: memStorage, limits:{fileSize:5*1024*1024}, fileFilter: imgFilter })

function uploadBufferToCloudinary(buffer, folder, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, overwrite: true, resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result)
    )
    stream.end(buffer)
  })
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function dist(lat1,lon1,lat2,lon2) {
  if (!lat1||!lat2) return 9999
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

// ── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

router.get('/schools', async (req, res, next) => {
  try {
    const { lat, lng, area, board } = req.query
    let where = "sc.status='Active' AND sc.is_listed=1", params=[]
    if (area)  { where+=' AND (sc.city LIKE ? OR sc.area LIKE ?)'; params.push(`%${area}%`,`%${area}%`) }
    if (board) { where+=' AND sc.board=?'; params.push(board) }

    const [schools] = await pool.execute(
      `SELECT sc.id,sc.name,sc.city,sc.area,sc.board,sc.grades_offered,sc.fee_range_min,
              sc.fee_range_max,sc.banner_url,sc.description,sc.facilities,sc.tagline,
              sc.latitude,sc.longitude,sc.rating,sc.review_count,sc.established_year
       FROM schools sc WHERE ${where} ORDER BY sc.rating DESC,sc.name`, params)

    const result = schools.map(sc => ({
      ...sc,
      distance_km: lat&&lng ? Math.round(dist(parseFloat(lat),parseFloat(lng),parseFloat(sc.latitude),parseFloat(sc.longitude))*10)/10 : null,
      facilities: sc.facilities ? sc.facilities.split(',').map(f=>f.trim()) : [],
    }))
    if (lat&&lng) result.sort((a,b)=>(a.distance_km||999)-(b.distance_km||999))
    res.json(result)
  } catch(err){next(err)}
})

router.get('/schools/:id', async (req, res, next) => {
  try {
    const [schools] = await pool.execute(`SELECT * FROM schools WHERE id=? AND status='Active'`, [req.params.id])
    if (!schools.length) return res.status(404).json({message:'School not found'})
    const sc = schools[0]
    sc.facilities = sc.facilities ? sc.facilities.split(',').map(f=>f.trim()) : []
    sc.highlights  = sc.highlights  ? sc.highlights.split(',').map(h=>h.trim())  : []

    // Gallery images
    const [gallery] = await pool.execute(
      `SELECT * FROM school_gallery WHERE school_id=? ORDER BY sort_order,created_at`, [sc.id])
    sc.gallery = gallery

    res.json(sc)
  } catch(err){next(err)}
})

router.post('/enquire', async (req, res, next) => {
  try {
    const {school_id,parent_name,phone,email,child_grade,area,message} = req.body
    if (!school_id||!parent_name||!phone) return res.status(400).json({message:'school_id, parent_name and phone required'})
    const [schools] = await pool.execute('SELECT id,name FROM schools WHERE id=?',[school_id])
    if (!schools.length) return res.status(404).json({message:'School not found'})

    let ai_score=50
    if (email) ai_score+=8
    if (['Pre-KG','LKG','UKG','Grade 1','Grade 9','Grade 10'].includes(child_grade)) ai_score+=12
    if (area) ai_score+=5
    ai_score+=10
    ai_score=Math.min(ai_score,100)
    const ai_label=ai_score>=75?'Hot':ai_score>=55?'Warm':'Cold'
    const [dup] = await pool.execute(`SELECT id FROM leads WHERE school_id=? AND phone=? AND created_at>DATE_SUB(NOW(),INTERVAL 30 DAY)`,[school_id,phone])

    const [result] = await pool.execute(
      `INSERT INTO leads (school_id,parent_name,phone,email,child_grade,area,lead_source,notes,ai_score,ai_label,is_duplicate,status)
       VALUES (?,?,?,?,?,?,'Discovery',?,?,?,?,'New')`,
      [school_id,parent_name,phone,email||null,child_grade||null,area||null,message||null,ai_score,ai_label,dup.length>0?1:0])

    res.status(201).json({success:true,lead_id:result.insertId,school_name:schools[0].name,ai_score,ai_label,
      message:`Thank you! ${schools[0].name} will contact you within 24 hours.`})
  } catch(err){next(err)}
})

// ── AUTHENTICATED ROUTES ──────────────────────────────────────────────────────

// Upload banner
router.post('/upload-banner/:school_id', protect, uploadBanner.single('banner'), async (req, res, next) => {
  try {
    if (req.user.school_id != req.params.school_id && req.user.role !== 'superadmin')
      return res.status(403).json({message:'Can only upload for your own school'})
    if (!req.file) return res.status(400).json({message:'No image uploaded'})
    const result = await uploadBufferToCloudinary(req.file.buffer, 'enrolliq/banners', `school_${req.params.school_id}_${Date.now()}`)
    const bannerUrl = result.secure_url
    await pool.execute('UPDATE schools SET banner_url=? WHERE id=?',[bannerUrl,req.params.school_id])
    res.json({success:true,banner_url:bannerUrl})
  } catch(err){next(err)}
})

// Upload gallery image(s)
router.post('/upload-gallery', protect, uploadGallery.array('images', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({message:'No images uploaded'})
    const schoolId = req.user.school_id
    const { caption } = req.body
    const inserted = []
    for (const file of req.files) {
      const cldResult = await uploadBufferToCloudinary(
        file.buffer, 'enrolliq/gallery',
        `gallery_${schoolId}_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      const imageUrl = cldResult.secure_url
      const [result] = await pool.execute(
        `INSERT INTO school_gallery (school_id,image_url,caption) VALUES (?,?,?)`,
        [schoolId, imageUrl, caption||null])
      inserted.push({id:result.insertId, image_url:imageUrl, caption:caption||null})
    }
    res.status(201).json({success:true, images:inserted})
  } catch(err){next(err)}
})

// Delete gallery image
router.delete('/gallery/:id', protect, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM school_gallery WHERE id=? AND school_id=?',[req.params.id,req.user.school_id])
    if (!rows.length) return res.status(404).json({message:'Image not found'})
    // Best-effort: remove from Cloudinary too (derive public_id from the stored URL)
    try {
      const m = rows[0].image_url.match(/\/enrolliq\/gallery\/([^./]+)\.[a-zA-Z0-9]+$/)
      if (m) await cloudinary.uploader.destroy(`enrolliq/gallery/${m[1]}`)
    } catch {}
    await pool.execute('DELETE FROM school_gallery WHERE id=?',[req.params.id])
    res.json({success:true})
  } catch(err){next(err)}
})

// Get gallery
router.get('/gallery', protect, async (req, res, next) => {
  try {
    const [images] = await pool.execute(
      'SELECT * FROM school_gallery WHERE school_id=? ORDER BY sort_order,created_at',[req.user.school_id])
    res.json(images)
  } catch(err){next(err)}
})

// Update school profile
router.patch('/school-profile', protect, async (req, res, next) => {
  try {
    const {description,grades_offered,fee_range_min,fee_range_max,facilities,
           area,latitude,longitude,established_year,phone,tagline,highlights} = req.body
    await pool.execute(`
      UPDATE schools SET
        description       = COALESCE(NULLIF(?,''), description),
        grades_offered    = COALESCE(NULLIF(?,''), grades_offered),
        fee_range_min     = COALESCE(NULLIF(?,''), fee_range_min),
        fee_range_max     = COALESCE(NULLIF(?,''), fee_range_max),
        facilities        = COALESCE(NULLIF(?,''), facilities),
        area              = COALESCE(NULLIF(?,''), area),
        latitude          = COALESCE(NULLIF(?,''), latitude),
        longitude         = COALESCE(NULLIF(?,''), longitude),
        established_year  = COALESCE(NULLIF(?,''), established_year),
        phone             = COALESCE(NULLIF(?,''), phone),
        tagline           = COALESCE(NULLIF(?,''), tagline),
        highlights        = COALESCE(NULLIF(?,''), highlights),
        is_listed         = 1
      WHERE id=?
    `,[description||null,grades_offered||null,fee_range_min||null,fee_range_max||null,
       facilities||null,area||null,latitude||null,longitude||null,
       established_year||null,phone||null,tagline||null,highlights||null,req.user.school_id])
    res.json({success:true,message:'Profile updated!'})
  } catch(err){next(err)}
})

module.exports = router
// Add these routes to discovery.js

// ── TESTIMONIALS & CHATBOT ──────────────────────────────────────────────────
// GET /api/discovery/school/:id/testimonials
router.get('/school/:id/testimonials', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM school_testimonials WHERE school_id=? AND is_active=1 ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch(err){next(err)}
})

// POST /api/discovery/school/:id/testimonials (admin adds)
router.post('/school/:id/testimonials', protect, async (req, res, next) => {
  try {
    const { parent_name, child_grade, rating, review } = req.body
    if (!parent_name || !review) return res.status(400).json({message:'parent_name and review required'})
    const [result] = await pool.execute(
      `INSERT INTO school_testimonials (school_id,parent_name,child_grade,rating,review) VALUES (?,?,?,?,?)`,
      [req.params.id, parent_name, child_grade||null, rating||5, review]
    )
    res.status(201).json({id:result.insertId, parent_name, child_grade, rating, review})
  } catch(err){next(err)}
})

// POST /api/discovery/chatbot — Smart chatbot with rule-based + Groq fallback
router.post('/chatbot', async (req, res, next) => {
  try {
    const { school_id, message, history } = req.body
    if (!school_id || !message) return res.status(400).json({ message: 'school_id and message required' })

    const [schools] = await pool.execute('SELECT * FROM schools WHERE id=?', [school_id])
    if (!schools.length) return res.status(404).json({ message: 'School not found' })
    const sc = schools[0]

    const fmtFee = (min, max) => {
      if (min && max) return 'Rs.' + Number(min).toLocaleString('en-IN') + ' to Rs.' + Number(max).toLocaleString('en-IN') + ' per year'
      if (min) return 'Starting from Rs.' + Number(min).toLocaleString('en-IN') + ' per year'
      return 'Please contact the school for fee details'
    }

    const msg = message.toLowerCase().trim()
    const hasPhone = /\b[6-9]\d{9}\b/.test(message)

    const reply = (text) => res.json({ reply: text, has_lead_data: hasPhone })

    if (msg.includes('fee') || msg.includes('cost') || msg.includes('charge') || msg.includes('price')) {
      return reply('The fee range at ' + sc.name + ' is ' + fmtFee(sc.fee_range_min, sc.fee_range_max) + '. Fees may vary by grade and term. Would you like to book a free campus visit to discuss fees in detail with our admissions team?')
    }

    if (msg.includes('admission') || msg.includes('apply') || msg.includes('enroll') || msg.includes('join') || msg.includes('process')) {
      return reply('Admission at ' + sc.name + ' is simple: 1) Fill the enquiry form on this page, 2) Our team calls you within 24 hours, 3) Schedule a campus visit, 4) Submit documents and registration fee, 5) Admission confirmed! Would you like to start the enquiry now?')
    }

    if (msg.includes('grade') || msg.includes('class') || msg.includes('standard') || msg.includes('kg') || msg.includes('nursery')) {
      return reply(sc.name + ' offers classes from ' + (sc.grades_offered || 'Pre-KG to Grade 10') + '. We follow the ' + (sc.board || 'CBSE') + ' curriculum with ' + (sc.medium || 'English') + ' medium. Would you like to enquire for a specific grade?')
    }

    if (msg.includes('facilit') || msg.includes('lab') || msg.includes('sport') || msg.includes('library') || msg.includes('transport') || msg.includes('infrastructure')) {
      const facs = sc.facilities ? sc.facilities.split(',').map(f => f.trim()).join(', ') : 'Library, Science Lab, Computer Lab, Sports Ground, Transport'
      return reply(sc.name + ' has excellent facilities including: ' + facs + '. Come visit our campus to see everything in person!')
    }

    if (msg.includes('location') || msg.includes('address') || msg.includes('where') || msg.includes('direction') || msg.includes('near')) {
      const addr = sc.address ? sc.address + '. ' : ''
      return reply(sc.name + ' is located in ' + (sc.area || sc.city || 'our city') + '. ' + addr + 'Timing: ' + (sc.school_timing || '8:00 AM - 4:00 PM') + '. Phone: ' + (sc.phone || 'Available on enquiry') + '. Would you like to book a campus visit?')
    }

    if (msg.includes('visit') || msg.includes('tour') || msg.includes('campus') || msg.includes('come') || msg.includes('book')) {
      return reply('We would love to show you around ' + sc.name + '! Click the Enquire Now button above, fill your name, phone and child\'s grade. Our team will call you to confirm a visit date. Visits are available Monday to Saturday, ' + (sc.school_timing || '9 AM - 3 PM') + '.')
    }

    if (msg.includes('board') || msg.includes('cbse') || msg.includes('icse') || msg.includes('syllabus') || msg.includes('curriculum')) {
      return reply(sc.name + ' is affiliated with ' + (sc.board || 'CBSE') + ' board with ' + (sc.medium || 'English') + ' as the medium of instruction.' + (sc.affiliation_no ? ' Affiliation No: ' + sc.affiliation_no + '.' : '') + ' Would you like to know more about our academic programs?')
    }

    if (msg.includes('contact') || msg.includes('phone') || msg.includes('call') || msg.includes('number') || msg.includes('whatsapp')) {
      return reply('You can reach ' + sc.name + ' at Phone: ' + (sc.phone || 'fill the enquiry form') + (sc.whatsapp_number ? ', WhatsApp: ' + sc.whatsapp_number : '') + (sc.email ? ', Email: ' + sc.email : '') + '. Timing: ' + (sc.school_timing || 'Monday-Saturday, 9 AM-4 PM') + '. Or click Enquire Now and we will call you!')
    }

    if (msg.includes('principal') || msg.includes('teacher') || msg.includes('staff') || msg.includes('faculty')) {
      return reply(sc.name + ' has highly qualified and experienced faculty.' + (sc.principal_name ? ' Principal: ' + sc.principal_name + '.' : '') + ' Our teachers are trained in modern teaching methods and dedicated to each student\'s growth. Would you like to meet our team? Book a campus visit!')
    }

    if (msg.includes('established') || msg.includes('founded') || msg.includes('since') || msg.includes('history')) {
      return reply(sc.name + (sc.established_year ? ' was established in ' + sc.established_year + '.' : ' has been serving the community for years.') + ' ' + (sc.description || 'We are committed to providing quality education and holistic development.') + ' Would you like to know more?')
    }

    // Try Groq if available
    if (process.env.GROQ_API_KEY) {
      try {
        const systemPrompt = 'You are the admissions assistant for ' + sc.name + ', a ' + (sc.board||'CBSE') + ' school in ' + (sc.area||sc.city||'') + '. ONLY answer about this school. Be warm, helpful, concise (2-3 sentences). School info - Grades: ' + (sc.grades_offered||'Pre-KG to Grade 10') + ', Fees: ' + fmtFee(sc.fee_range_min,sc.fee_range_max) + ', Phone: ' + (sc.phone||'on request') + ', Timing: ' + (sc.school_timing||'contact school')
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
          body: JSON.stringify({
            model: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
            max_tokens: 200,
            messages: [
              { role: 'system', content: systemPrompt },
              ...(history||[]).slice(-4),
              { role: 'user', content: message }
            ]
          })
        })
        const data = await response.json()
        const aiReply = data.choices?.[0]?.message?.content
        if (aiReply) return res.json({ reply: aiReply, has_lead_data: hasPhone })
      } catch {}
    }

    // Default response
    return reply('Hi! I am the admissions assistant for ' + sc.name + '. I can help you with fees, admission process, facilities, location, timings, and booking a campus visit. What would you like to know?')

  } catch(err) { next(err) }
})
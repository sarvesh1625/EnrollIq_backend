require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 5000

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    // allow non-browser clients (mobile app, curl) with no origin
    if (!origin) return callback(null, true)
    const allowed = [
      'http://localhost:5173',
      'http://localhost:8081',
      'http://localhost:19006',
      process.env.CLIENT_URL,          // your Hostinger frontend domain
    ].filter(Boolean)
    // allow configured origins + local dev network (Expo on LAN)
    if (allowed.includes(origin) || origin.startsWith('http://192.168.') || origin.startsWith('http://10.')) {
      return callback(null, true)
    }
    // In production, reject unknown origins. Set ALLOW_ALL_ORIGINS=true to relax.
    if (process.env.ALLOW_ALL_ORIGINS === 'true') return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(11,19)}  ${req.method.padEnd(6)} ${req.path}`)
  next()
})

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status:'ok', db:'cmr_of_school', time: new Date().toISOString() })
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'))
app.use('/api/leads',         require('./routes/leads'))
app.use('/api/schools',       require('./routes/schools'))
app.use('/api/admissions',    require('./routes/admissions'))
app.use('/api/students',      require('./routes/students'))
app.use('/api/fees',          require('./routes/fees'))
app.use('/api/communication', require('./routes/communication'))
app.use('/api/analytics',     require('./routes/analytics'))
app.use('/api/whatsapp',      require('./routes/whatsapp'))
app.use('/api/transport',     require('./routes/transport'))
app.use('/api/attendance',    require('./routes/attendance'))
app.use('/api/exams',         require('./routes/exams'))
app.use('/api/roles',         require('./routes/roles'))
app.use('/api/ai',            require('./routes/ai'))
app.use('/api/import',        require('./routes/import'))
app.use('/api/discovery',     require('./routes/discovery'))
app.use('/api/ads',           require('./routes/ads'))
app.use('/api/kit', require('./routes/kit'))
app.use('/api/tracking', require('./routes/tracking'))
app.use('/api/academic', require('./routes/academic'))
app.use('/api/assistant', require('./routes/assistant'))

const parentRouter                 = require('./routes/parent')
const { router: driverRouter }     = require('./routes/driver')
const { router: superAdminRouter } = require('./routes/superadmin')
app.use('/api/features', require('./routes/features'))
app.use('/api/ai-exams', require('./routes/aiExams'))
app.use('/api/diary', require('./routes/diary'))

app.use('/api/parent',     parentRouter)
app.use('/api/driver',     driverRouter)
app.use('/api/superadmin', superAdminRouter)

// ── Error Handlers ────────────────────────────────────────────────────────────
app.use(require('./middleware/errorHandler').notFound)
app.use(require('./middleware/errorHandler').errorHandler)

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Backend running  → http://localhost:${PORT}`)
  console.log(`🗄️   Database        → cmr_of_school (MySQL)`)
  console.log(`🌐  Frontend origin  → ${process.env.CLIENT_URL || 'http://localhost:5173'}\n`)
})
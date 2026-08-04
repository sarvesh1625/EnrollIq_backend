const router  = require('express').Router()
const { pool }= require('../db/pool')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')

// ── Super Admin Auth ──────────────────────────────────────────────────────────
function superAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'superadmin') return res.status(403).json({ message: 'Super admin access required' })
    req.superAdmin = decoded
    next()
  } catch { res.status(401).json({ message: 'Session expired. Please login again.' }) }
}

// ── POST /api/superadmin/login ────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

    const [admins] = await pool.execute(
      'SELECT * FROM super_admins WHERE email = ? AND is_active = 1',
      [email.toLowerCase().trim()]
    )
    if (!admins.length) return res.status(401).json({ message: 'Invalid credentials' })

    const admin = admins[0]
    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

    await pool.execute('UPDATE super_admins SET last_login=NOW() WHERE id=?', [admin.id])

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'superadmin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } })
  } catch (err) { next(err) }
})

// ── GET /api/superadmin/me ────────────────────────────────────────────────────
router.get('/me', superAuth, (req, res) => {
  res.json({ id: req.superAdmin.id, name: req.superAdmin.name, email: req.superAdmin.email, role: 'superadmin' })
})

// ── GET /api/superadmin/dashboard ────────────────────────────────────────────
router.get('/dashboard', superAuth, async (req, res, next) => {
  try {
    // Count all schools — no status filter
    const [[schools]]     = await pool.execute('SELECT COUNT(*) AS c FROM schools')
    const [[allStudents]] = await pool.execute("SELECT COUNT(*) AS c FROM students WHERE status='Active'")
    const [[allLeads]]    = await pool.execute('SELECT COUNT(*) AS c FROM leads')
    const [[allFees]]     = await pool.execute('SELECT COALESCE(SUM(paid_amount),0) AS total FROM payments')
    const [[todayLeads]]  = await pool.execute('SELECT COUNT(*) AS c FROM leads WHERE DATE(created_at)=CURDATE()')
    const [[hotLeads]]    = await pool.execute("SELECT COUNT(*) AS c FROM leads WHERE ai_label='Hot' AND status NOT IN ('Admission','Lost')")

    // Per school breakdown — no status filter on schools
    const [schoolStats] = await pool.execute(`
      SELECT
        sc.id, sc.name, sc.city, sc.board,
        COALESCE(sc.status,'Active')            AS status,
        COALESCE(sc.subscription_plan,'Basic')  AS subscription_plan,
        sc.subscription_status, sc.created_at,
        COUNT(DISTINCT s.id)                    AS total_students,
        COUNT(DISTINCT l.id)                    AS total_leads,
        COUNT(DISTINCT u.id)                    AS total_staff,
        COALESCE(SUM(DISTINCT p.paid_amount),0) AS total_collected
      FROM schools sc
      LEFT JOIN students s ON s.school_id = sc.id AND s.status='Active'
      LEFT JOIN leads    l ON l.school_id = sc.id
      LEFT JOIN users    u ON u.school_id = sc.id AND u.is_active=1
      LEFT JOIN payments p ON p.school_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
    `)

    const [recentLeads] = await pool.execute(`
      SELECT l.*, sc.name AS school_name
      FROM leads l JOIN schools sc ON sc.id = l.school_id
      ORDER BY l.created_at DESC LIMIT 10
    `)

    res.json({
      platform_stats: {
        total_schools:   schools.c,
        total_students:  allStudents.c,
        total_leads:     allLeads.c,
        total_collected: parseFloat(allFees.total),
        today_leads:     todayLeads.c,
        hot_leads:       hotLeads.c,
      },
      schools:      schoolStats,
      recent_leads: recentLeads,
    })
  } catch (err) { next(err) }
})

// ── GET /api/superadmin/schools ───────────────────────────────────────────────
router.get('/schools', superAuth, async (req, res, next) => {
  try {
    const [schools] = await pool.execute(`
      SELECT sc.*,
        COALESCE(sc.status,'Active')           AS status,
        COALESCE(sc.subscription_plan,'Basic') AS subscription_plan,
        COUNT(DISTINCT s.id) AS total_students,
        COUNT(DISTINCT l.id) AS total_leads,
        COUNT(DISTINCT u.id) AS total_staff,
        COALESCE(SUM(p.paid_amount),0) AS total_collected
      FROM schools sc
      LEFT JOIN students s ON s.school_id = sc.id AND s.status='Active'
      LEFT JOIN leads    l ON l.school_id = sc.id
      LEFT JOIN users    u ON u.school_id = sc.id AND u.role='admin'
      LEFT JOIN payments p ON p.school_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
    `)
    res.json(schools)
  } catch (err) { next(err) }
})

// ── POST /api/superadmin/schools ─────────────────────────────────────────────
router.post('/schools', superAuth, async (req, res, next) => {
  try {
    const { name, city, board, phone, email, plan, admin_name, admin_email, admin_password } = req.body
    if (!name || !admin_email || !admin_password)
      return res.status(400).json({ message: 'School name, admin email and password are required' })

    const [existing] = await pool.execute('SELECT id FROM users WHERE email=?', [admin_email.toLowerCase()])
    if (existing.length) return res.status(400).json({ message: 'Admin email already exists' })

    const [schoolResult] = await pool.execute(
      `INSERT INTO schools (name, city, board, phone, email, subscription_plan, subscription_status, status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [name, city||null, board||'CBSE', phone||null, email||null, plan||'Basic', 'Active', 'Active']
    )
    const schoolId = schoolResult.insertId

    const hash = await bcrypt.hash(admin_password, 10)
    await pool.execute(
      `INSERT INTO users (school_id, name, email, password_hash, role, is_active) VALUES (?,?,?,?,'admin',1)`,
      [schoolId, admin_name || name + ' Admin', admin_email.toLowerCase(), hash]
    )

    const [rows] = await pool.execute('SELECT * FROM schools WHERE id=?', [schoolId])
    res.status(201).json({ school: rows[0], message: 'School created successfully' })
  } catch (err) { next(err) }
})

// ── GET /api/superadmin/school/:id ────────────────────────────────────────────
router.get('/school/:id', superAuth, async (req, res, next) => {
  try {
    const sid = req.params.id
    const [schools] = await pool.execute('SELECT * FROM schools WHERE id=?', [sid])
    if (!schools.length) return res.status(404).json({ message: 'School not found' })

    const [[students]] = await pool.execute("SELECT COUNT(*) AS c FROM students  WHERE school_id=? AND status='Active'", [sid])
    const [[leads]]    = await pool.execute('SELECT COUNT(*) AS c FROM leads     WHERE school_id=?', [sid])
    const [[hotLeads]] = await pool.execute("SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND ai_label='Hot'", [sid])
    const [[fees]]     = await pool.execute('SELECT COALESCE(SUM(paid_amount),0) AS collected, COALESCE(SUM(amount-COALESCE(paid_amount,0)),0) AS pending FROM payments WHERE school_id=?', [sid])
    const [staff]      = await pool.execute('SELECT id,name,email,role,is_active FROM users WHERE school_id=? ORDER BY role,name', [sid])
    const [recentLeads]= await pool.execute('SELECT * FROM leads WHERE school_id=? ORDER BY created_at DESC LIMIT 5', [sid])

    res.json({
      school: { ...schools[0], status: schools[0].status || 'Active', subscription_plan: schools[0].subscription_plan || 'Basic' },
      stats: {
        students:        students.c,
        leads:           leads.c,
        hot_leads:       hotLeads.c,
        total_collected: parseFloat(fees.collected),
        total_pending:   parseFloat(fees.pending),
      },
      staff,
      recent_leads: recentLeads,
    })
  } catch (err) { next(err) }
})

// ── PATCH /api/superadmin/school/:id ─────────────────────────────────────────
router.patch('/school/:id', superAuth, async (req, res, next) => {
  try {
    const { status, subscription_plan, subscription_status, rating } = req.body
    await pool.execute(
      `UPDATE schools SET
        status              = COALESCE(?,status),
        subscription_plan   = COALESCE(?,subscription_plan),
        subscription_status = COALESCE(?,subscription_status),
        rating              = COALESCE(?,rating)
       WHERE id=?`,
      [status||null, subscription_plan||null, subscription_status||null, rating||null, req.params.id]
    )
    res.json({ message: 'School updated' })
  } catch (err) { next(err) }
})

// ── POST /api/superadmin/impersonate/:school_id ───────────────────────────────
router.post('/impersonate/:school_id', superAuth, async (req, res, next) => {
  try {
    const [admins] = await pool.execute(
      "SELECT * FROM users WHERE school_id=? AND role='admin' AND is_active=1 LIMIT 1",
      [req.params.school_id]
    )
    if (!admins.length) return res.status(404).json({ message: 'No active admin for this school' })

    const admin = admins[0]
    const [schools] = await pool.execute('SELECT * FROM schools WHERE id=?', [req.params.school_id])

    const token = jwt.sign(
      { id: admin.id, name: admin.name, email: admin.email, role: admin.role,
        school_id: admin.school_id, school_name: schools[0]?.name,
        impersonated_by: req.superAdmin.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    res.json({ token, admin: { name: admin.name, email: admin.email, school_name: schools[0]?.name } })
  } catch (err) { next(err) }
})

// ── POST /api/superadmin/reset-password/:user_id ─────────────────────────────
router.post('/reset-password/:user_id', superAuth, async (req, res, next) => {
  try {
    const { new_password } = req.body
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    const hash = await bcrypt.hash(new_password, 10)
    await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, req.params.user_id])
    res.json({ message: 'Password reset successfully' })
  } catch (err) { next(err) }
})

module.exports = { router, superAuth }
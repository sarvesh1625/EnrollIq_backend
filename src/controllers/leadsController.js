const { pool } = require('../db/pool')

function calculateAIScore(lead) {
  let score = 40
  const sourceWeights = { 'Google Ads':20, 'Referral':18, 'WhatsApp':15, 'Walk-in':15, 'Instagram':10, 'Facebook':8, 'Form':5 }
  score += sourceWeights[lead.lead_source] || 0
  if (lead.email && lead.email.trim()) score += 8
  const highGrades = ['Grade 1','Pre-KG','LKG','UKG','Grade 9','Grade 10']
  if (highGrades.includes(lead.child_grade)) score += 12
  if (lead.keyword && lead.keyword.trim()) score += 10
  const hotKeywords = ['best school','admission','fees','cbse near me','top school']
  if (hotKeywords.some(k => (lead.keyword || '').toLowerCase().includes(k))) score += 10
  const capped = Math.min(score, 100)
  return { ai_score: capped, ai_label: capped >= 75 ? 'Hot' : capped >= 55 ? 'Warm' : 'Cold' }
}

// GET /api/leads
async function getLeads(req, res, next) {
  try {
    const { status, ai_label, search, limit = 50, offset = 0 } = req.query
    const schoolId = req.user.school_id

    let where  = 'l.school_id = ?'
    let params = [schoolId]

    if (status && status !== 'All')   { where += ' AND l.status = ?';   params.push(status) }
    if (ai_label && ai_label !== 'All') { where += ' AND l.ai_label = ?'; params.push(ai_label) }
    if (search) {
      where += ' AND (l.parent_name LIKE ? OR l.phone LIKE ? OR l.child_grade LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const [leads] = await pool.execute(
      `SELECT l.*, u.name AS assigned_name FROM leads l
       LEFT JOIN users u ON u.id = l.assigned_to
       WHERE ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM leads l WHERE ${where}`, params)
    res.json({ leads, total: count[0].total })
  } catch (err) { next(err) }
}

// GET /api/leads/stats
async function getLeadStats(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const today    = new Date().toISOString().slice(0, 10)

    const [[td]]  = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND DATE(created_at)=?`, [schoolId, today])
    const [[hot]] = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND ai_label='Hot' AND status NOT IN ('Admission','Lost')`, [schoolId])
    const [[vis]] = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND status='Campus Visit'`, [schoolId])
    const [[adm]] = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND status='Admission'`, [schoolId])
    const [[tot]] = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=?`, [schoolId])

    const total = tot.c, admissions = adm.c
    res.json({
      today_leads:     td.c,
      hot_leads:       hot.c,
      visits_booked:   vis.c,
      admissions,
      total_leads:     total,
      conversion_rate: total > 0 ? Math.round((admissions / total) * 100) : 0,
    })
  } catch (err) { next(err) }
}

// GET /api/leads/:id
async function getLead(req, res, next) {
  try {
    const [leads] = await pool.execute(
      `SELECT l.*, u.name AS assigned_name FROM leads l
       LEFT JOIN users u ON u.id = l.assigned_to
       WHERE l.id = ? AND l.school_id = ?`,
      [req.params.id, req.user.school_id]
    )
    if (!leads.length) return res.status(404).json({ message: 'Lead not found' })

    const [interactions] = await pool.execute(
      `SELECT li.*, u.name AS user_name FROM lead_interactions li
       LEFT JOIN users u ON u.id = li.user_id
       WHERE li.lead_id = ? ORDER BY li.created_at ASC`,
      [req.params.id]
    )
    res.json({ ...leads[0], interactions })
  } catch (err) { next(err) }
}

// POST /api/leads
async function createLead(req, res, next) {
  try {
    const { parent_name, phone, email, child_grade, area, lead_source, keyword, notes } = req.body
    const schoolId = req.user.school_id
    if (!parent_name || !phone) return res.status(400).json({ message: 'parent_name and phone are required' })

    const [dup] = await pool.execute(
      `SELECT id FROM leads WHERE school_id=? AND phone=? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [schoolId, phone]
    )
    const is_duplicate = dup.length > 0 ? 1 : 0
    const { ai_score, ai_label } = calculateAIScore({ lead_source, email, child_grade, keyword })

    const [result] = await pool.execute(
      `INSERT INTO leads (school_id, parent_name, phone, email, child_grade, area, lead_source, keyword, notes, ai_score, ai_label, is_duplicate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, parent_name, phone.trim(), email||null, child_grade, area, lead_source||'Website', keyword||null, notes, ai_score, ai_label, is_duplicate]
    )
    const [newLead] = await pool.execute('SELECT * FROM leads WHERE id = ?', [result.insertId])
    res.status(201).json(newLead[0])
  } catch (err) { next(err) }
}

// PUT /api/leads/:id
async function updateLead(req, res, next) {
  try {
    const { parent_name, phone, email, child_grade, area, lead_source, keyword, notes, assigned_to } = req.body
    await pool.execute(
      `UPDATE leads SET
        parent_name = COALESCE(?, parent_name),
        phone       = COALESCE(?, phone),
        email       = COALESCE(?, email),
        child_grade = COALESCE(?, child_grade),
        area        = COALESCE(?, area),
        lead_source = COALESCE(?, lead_source),
        keyword     = COALESCE(?, keyword),
        notes       = COALESCE(?, notes),
        assigned_to = COALESCE(?, assigned_to)
       WHERE id = ? AND school_id = ?`,
      [parent_name, phone, email, child_grade, area, lead_source, keyword, notes, assigned_to, req.params.id, req.user.school_id]
    )
    const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Lead not found' })
    res.json(rows[0])
  } catch (err) { next(err) }
}

// PATCH /api/leads/:id/status
async function updateLeadStatus(req, res, next) {
  try {
    const { status } = req.body
    const valid = ['New','Contacted','Campus Visit','Admission','Lost']
    if (!valid.includes(status)) return res.status(400).json({ message: `Invalid status. Must be one of: ${valid.join(', ')}` })

    const [result] = await pool.execute(
      'UPDATE leads SET status = ? WHERE id = ? AND school_id = ?',
      [status, req.params.id, req.user.school_id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Lead not found' })

    await pool.execute(
      'INSERT INTO lead_interactions (lead_id, user_id, type, notes) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'Status Change', `Status updated to "${status}"`]
    )
    res.json({ id: parseInt(req.params.id), status })
  } catch (err) { next(err) }
}

// DELETE /api/leads/:id
async function deleteLead(req, res, next) {
  try {
    const [result] = await pool.execute('DELETE FROM leads WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Lead not found' })
    res.json({ message: 'Lead deleted', id: parseInt(req.params.id) })
  } catch (err) { next(err) }
}

// POST /api/leads/:id/interactions
async function addInteraction(req, res, next) {
  try {
    const { type, notes } = req.body
    if (!type) return res.status(400).json({ message: 'type is required' })
    const [result] = await pool.execute(
      'INSERT INTO lead_interactions (lead_id, user_id, type, notes) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, type, notes]
    )
    const [rows] = await pool.execute('SELECT * FROM lead_interactions WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

// POST /api/leads/public
async function createPublicLead(req, res, next) {
  try {
    const { parent_name, phone, email, child_grade, message, school_id } = req.body
    if (!parent_name || !phone || !school_id) return res.status(400).json({ message: 'parent_name, phone and school_id are required' })

    const [school] = await pool.execute('SELECT id FROM schools WHERE id = ? AND is_active = 1', [school_id])
    if (!school.length) return res.status(404).json({ message: 'School not found' })

    const { ai_score, ai_label } = calculateAIScore({ lead_source: 'Landing Page', email, child_grade, keyword: '' })
    await pool.execute(
      `INSERT INTO leads (school_id, parent_name, phone, email, child_grade, lead_source, notes, ai_score, ai_label)
       VALUES (?, ?, ?, ?, ?, 'Landing Page', ?, ?, ?)`,
      [school_id, parent_name, phone, email||null, child_grade, message||null, ai_score, ai_label]
    )
    res.status(201).json({ message: 'Enquiry received. The school will contact you within 24 hours.' })
  } catch (err) { next(err) }
}

module.exports = { getLeads, getLeadStats, getLead, createLead, updateLead, updateLeadStatus, deleteLead, addInteraction, createPublicLead }
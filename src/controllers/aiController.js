const { pool } = require('../db/pool')

// Rule-based AI scoring (works without OpenAI key)
function calculateScore(lead) {
  let score = 40

  // Source weights
  const sourceWeights = {
    'Google Ads': 20, 'Referral': 18, 'WhatsApp': 15,
    'Walk-in': 15, 'Instagram': 10, 'Facebook': 8, 'Form': 5,
  }
  score += sourceWeights[lead.lead_source] || 0

  // Email provided
  if (lead.email && lead.email.trim()) score += 8

  // High-demand grades
  if (['Pre-KG','LKG','UKG','Grade 1','Grade 9','Grade 10'].includes(lead.child_grade)) score += 12

  // Keyword signals
  if (lead.keyword) {
    score += 10
    const hotKeywords = ['best school','admission','fees','cbse','top school','near me']
    if (hotKeywords.some(k => lead.keyword.toLowerCase().includes(k))) score += 10
  }

  // Area bonus (local area shows intent)
  if (lead.area && lead.area.trim()) score += 5

  const capped = Math.min(score, 100)
  return {
    ai_score: capped,
    ai_label: capped >= 75 ? 'Hot' : capped >= 55 ? 'Warm' : 'Cold',
    breakdown: {
      base:     40,
      source:   sourceWeights[lead.lead_source] || 0,
      email:    lead.email ? 8 : 0,
      grade:    ['Pre-KG','LKG','UKG','Grade 1','Grade 9','Grade 10'].includes(lead.child_grade) ? 12 : 0,
      keyword:  lead.keyword ? (hotKeywords => hotKeywords.some(k => lead.keyword?.toLowerCase().includes(k)) ? 20 : 10)(['best school','admission','fees','cbse','top school','near me']) : 0,
      area:     lead.area ? 5 : 0,
    }
  }
}

// POST /api/ai/score-lead — score a single lead
async function scoreLead(req, res, next) {
  try {
    const lead = req.body
    const result = calculateScore(lead)
    res.json(result)
  } catch (err) { next(err) }
}

// POST /api/ai/rescore-all — rescore all leads in school
async function rescoreAll(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [leads]  = await pool.execute(
      'SELECT * FROM leads WHERE school_id=?', [schoolId])

    let updated = 0
    for (const lead of leads) {
      const { ai_score, ai_label } = calculateScore(lead)
      await pool.execute(
        'UPDATE leads SET ai_score=?, ai_label=? WHERE id=?',
        [ai_score, ai_label, lead.id]
      )
      updated++
    }

    res.json({ message: `Rescored ${updated} leads`, updated })
  } catch (err) { next(err) }
}

// GET /api/ai/insights — school insights
async function getInsights(req, res, next) {
  try {
    const schoolId = req.user.school_id

    const [[hotLeads]]  = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND ai_label='Hot' AND status NOT IN ('Admission','Lost')`, [schoolId])
    const [[todayLeads]]= await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND DATE(created_at)=CURDATE()`, [schoolId])
    const [topSources]  = await pool.execute(`SELECT lead_source, COUNT(*) AS c FROM leads WHERE school_id=? GROUP BY lead_source ORDER BY c DESC LIMIT 3`, [schoolId])
    const [hotGrades]   = await pool.execute(`SELECT child_grade, COUNT(*) AS c FROM leads WHERE school_id=? AND ai_label='Hot' GROUP BY child_grade ORDER BY c DESC LIMIT 3`, [schoolId])
    const [[overduePayments]] = await pool.execute(`SELECT COUNT(*) AS c FROM payments WHERE school_id=? AND status='Overdue'`, [schoolId])
    const [[lowAttendance]]   = await pool.execute(`
      SELECT COUNT(*) AS c FROM (
        SELECT student_id,
               SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END)/COUNT(*)*100 AS pct
        FROM class_attendance WHERE school_id=?
        GROUP BY student_id HAVING pct < 75
      ) AS low_att
    `, [schoolId])

    res.json({
      alerts: [
        hotLeads.c > 0     && { type:'hot_leads',        severity:'high',   message:`${hotLeads.c} hot leads need immediate callback`, action:'/leads' },
        todayLeads.c > 0   && { type:'new_leads',        severity:'info',   message:`${todayLeads.c} new leads today`, action:'/leads' },
        overduePayments.c > 0 && { type:'overdue_fees',  severity:'high',   message:`${overduePayments.c} payments overdue`, action:'/fees' },
        lowAttendance.c > 0   && { type:'low_attendance',severity:'medium', message:`${lowAttendance.c} students below 75% attendance`, action:'/attendance' },
      ].filter(Boolean),
      top_sources: topSources,
      hot_grades:  hotGrades,
    })
  } catch (err) { next(err) }
}

// POST /api/ai/bulk-score — score leads from bulk import
async function bulkScore(leads) {
  return leads.map(lead => ({ ...lead, ...calculateScore(lead) }))
}

module.exports = { scoreLead, rescoreAll, getInsights, bulkScore }
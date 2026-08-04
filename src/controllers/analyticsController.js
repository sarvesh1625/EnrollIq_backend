const { pool } = require('../db/pool')

async function getOverview(req, res, next) {
  try {
    const schoolId = req.user.school_id

    // Monthly leads + admissions — last 6 months
    const [monthlyLeads] = await pool.execute(`
      SELECT DATE_FORMAT(created_at, '%b') AS month,
             DATE_FORMAT(created_at, '%Y-%m') AS month_key,
             COUNT(*) AS leads
      FROM leads
      WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month, month_key ORDER BY month_key
    `, [schoolId])

    const [monthlyAdm] = await pool.execute(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key, COUNT(*) AS admissions
      FROM admissions
      WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month_key
    `, [schoolId])

    const admMap = {}
    monthlyAdm.forEach(r => { admMap[r.month_key] = parseInt(r.admissions) })
    const monthly = monthlyLeads.map(r => ({
      month:      r.month,
      leads:      parseInt(r.leads),
      admissions: admMap[r.month_key] || 0,
    }))

    // Lead sources
    const [sources] = await pool.execute(`
      SELECT lead_source AS label, COUNT(*) AS count
      FROM leads WHERE school_id = ?
      GROUP BY lead_source ORDER BY count DESC
    `, [schoolId])

    const totalLeads = sources.reduce((s, r) => s + parseInt(r.count), 0)
    const sourcesOut = sources.map(r => ({
      label: r.label,
      count: parseInt(r.count),
      pct:   totalLeads > 0 ? Math.round((parseInt(r.count) / totalLeads) * 100) : 0,
    }))

    // Top keywords
    const [keywords] = await pool.execute(`
      SELECT keyword,
             COUNT(*) AS leads,
             SUM(CASE WHEN status='Admission' THEN 1 ELSE 0 END) AS conversions
      FROM leads
      WHERE school_id = ? AND keyword IS NOT NULL AND keyword != ''
      GROUP BY keyword ORDER BY leads DESC LIMIT 10
    `, [schoolId])

    const keywordsOut = keywords.map(r => ({
      keyword: r.keyword,
      leads:   parseInt(r.leads),
      conv:    parseInt(r.leads) > 0 ? Math.round((parseInt(r.conversions) / parseInt(r.leads)) * 100) + '%' : '0%',
    }))

    // Fee collection trend
    const [feeTrend] = await pool.execute(`
      SELECT DATE_FORMAT(paid_date, '%b') AS month,
             DATE_FORMAT(paid_date, '%Y-%m') AS month_key,
             COALESCE(SUM(paid_amount), 0) AS collected
      FROM payments
      WHERE school_id = ? AND paid_date IS NOT NULL AND paid_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month, month_key ORDER BY month_key
    `, [schoolId])

    // KPIs
    const [[tlRes]] = await pool.execute('SELECT COUNT(*) AS c FROM leads WHERE school_id=?', [schoolId])
    const [[taRes]] = await pool.execute(`SELECT COUNT(*) AS c FROM admissions WHERE school_id=? AND status='Admitted'`, [schoolId])
    const [[revRes]]= await pool.execute('SELECT COALESCE(SUM(paid_amount),0) AS total FROM payments WHERE school_id=?', [schoolId])

    const tl = tlRes.c, ta = taRes.c
    res.json({
      kpis: {
        total_leads:     tl,
        admissions:      ta,
        conversion_rate: tl > 0 ? Math.round((ta / tl) * 100) : 0,
        revenue_driven:  parseFloat(revRes.total),
      },
      monthly,
      sources: sourcesOut,
      keywords: keywordsOut,
      fee_trend: feeTrend.map(r => ({ month: r.month, collected: parseFloat(r.collected) })),
    })
  } catch (err) { next(err) }
}

module.exports = { getOverview }
const router  = require('express').Router()
const { pool }= require('../db/pool')
const { protect } = require('../middleware/auth')

function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim()
}

// GET /api/ads/my
router.get('/my', protect, async (req, res, next) => {
  try {
    const schoolId = req.user.school_id
    let [ads] = await pool.execute('SELECT * FROM school_ads WHERE school_id=? ORDER BY created_at DESC LIMIT 1',[schoolId])

    if (!ads.length) {
      const [schools] = await pool.execute('SELECT name FROM schools WHERE id=?',[schoolId])
      const slug = makeSlug(schools[0]?.name || `school-${schoolId}`) + '-' + schoolId
      await pool.execute(
        `INSERT INTO school_ads (school_id,campaign_name,landing_slug,status) VALUES (?,?,?,'Active')`,
        [schoolId, `${schools[0]?.name} Ads`, slug]
      )
      ;[ads] = await pool.execute('SELECT * FROM school_ads WHERE school_id=? LIMIT 1',[schoolId])
    }

    const ad = ads[0]
    // Parse integrations JSON
    let integrations = {}
    try { integrations = JSON.parse(ad.integrations || '{}') } catch {}

    const [[clicks]]   = await pool.execute(`SELECT COUNT(*) AS c FROM ad_events WHERE school_id=? AND event_type='click'   AND created_at>DATE_SUB(NOW(),INTERVAL 30 DAY)`,[schoolId])
    const [[enquiries]]= await pool.execute(`SELECT COUNT(*) AS c FROM ad_events WHERE school_id=? AND event_type='enquiry' AND created_at>DATE_SUB(NOW(),INTERVAL 30 DAY)`,[schoolId])
    const [[gLeads]]   = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=? AND lead_source='Google Ads'  AND created_at>DATE_SUB(NOW(),INTERVAL 30 DAY)`,[schoolId])

    const [daily] = await pool.execute(
      `SELECT DATE(created_at) AS date, COUNT(*) AS clicks, SUM(event_type='enquiry') AS enquiries
       FROM ad_events WHERE school_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 7 DAY)
       GROUP BY DATE(created_at) ORDER BY date ASC`,
      [schoolId]
    )

    res.json({
      ad: { ...ad, integrations },
      stats: {
        clicks:          clicks.c,
        enquiries:       enquiries.c,
        google_leads:    gLeads.c,
        conversion_rate: clicks.c > 0 ? Math.round((enquiries.c/clicks.c)*100) : 0,
        cost_per_lead:   ad.monthly_budget && gLeads.c > 0 ? Math.round(ad.monthly_budget/gLeads.c) : null,
      },
      daily_chart: daily,
    })
  } catch(err){next(err)}
})

// PATCH /api/ads/my — update settings
router.patch('/my', protect, async (req, res, next) => {
  try {
    const { campaign_name, google_ads_account, google_campaign_id, monthly_budget, status } = req.body
    await pool.execute(
      `UPDATE school_ads SET
        campaign_name=COALESCE(NULLIF(?,''),campaign_name),
        google_ads_account=COALESCE(NULLIF(?,''),google_ads_account),
        google_campaign_id=COALESCE(NULLIF(?,''),google_campaign_id),
        monthly_budget=COALESCE(NULLIF(?,''),monthly_budget),
        status=COALESCE(NULLIF(?,''),status)
       WHERE school_id=?`,
      [campaign_name||null,google_ads_account||null,google_campaign_id||null,monthly_budget||null,status||null,req.user.school_id]
    )
    res.json({success:true})
  } catch(err){next(err)}
})

// PATCH /api/ads/integrations — save platform credentials
router.patch('/integrations', protect, async (req, res, next) => {
  try {
    const { platform, credentials } = req.body
    const schoolId = req.user.school_id

    // Get current integrations
    const [ads] = await pool.execute('SELECT integrations FROM school_ads WHERE school_id=? LIMIT 1',[schoolId])
    if (!ads.length) return res.status(404).json({message:'No ad account found'})

    let current = {}
    try { current = JSON.parse(ads[0].integrations || '{}') } catch {}

    // Update the specific platform
    current[platform] = credentials

    await pool.execute('UPDATE school_ads SET integrations=? WHERE school_id=?',[JSON.stringify(current),schoolId])

    // If WhatsApp credentials saved, update .env-like config
    if (platform === 'whatsapp_business' && credentials.phone_number_id) {
      await pool.execute(
        `UPDATE schools SET whatsapp_number=? WHERE id=?`,
        [credentials.phone_number_id, schoolId]
      )
    }

    res.json({success:true, message:`${platform} credentials saved`})
  } catch(err){next(err)}
})

// POST /api/ads/track — track a click (public)
router.post('/track', async (req, res, next) => {
  try {
    const { school_id, event_type, source } = req.body
    if (!school_id) return res.status(400).json({message:'school_id required'})
    const [ads] = await pool.execute('SELECT id FROM school_ads WHERE school_id=? AND status="Active" LIMIT 1',[school_id])
    await pool.execute(
      `INSERT INTO ad_events (school_id,ad_id,event_type,source) VALUES (?,?,?,?)`,
      [school_id, ads[0]?.id||null, event_type||'click', source||'google']
    )
    res.json({success:true})
  } catch(err){next(err)}
})

// GET /api/ads/slug/:slug — resolve slug to school (public)
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const [ads] = await pool.execute(
      `SELECT sa.*, sc.id AS school_id, sc.name AS school_name
       FROM school_ads sa JOIN schools sc ON sc.id=sa.school_id
       WHERE sa.landing_slug=? AND sa.status='Active'`,
      [req.params.slug]
    )
    if (!ads.length) return res.status(404).json({message:'Campaign not found'})
    res.json(ads[0])
  } catch(err){next(err)}
})

module.exports = router
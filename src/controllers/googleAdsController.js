const axios = require('axios')
const { pool } = require('../db/pool')

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPE     = 'https://www.googleapis.com/auth/adwords'

function envReady() {
  return !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_REDIRECT_URI)
}

exports.getConnectUrl = async (req, res, next) => {
  try {
    if (!envReady())
      return res.status(503).json({ message: 'Google Ads isn\'t configured on the server yet (missing OAuth client credentials). Contact support.' })
    const state = Buffer.from(JSON.stringify({ school_id: req.user.school_id, t: Date.now() })).toString('base64url')
    const url = `${AUTH_URL}?` + new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString()
    res.json({ url })
  } catch (e) { next(e) }
}

exports.callback = async (req, res, next) => {
  const frontend = process.env.FRONTEND_URL || '/'
  try {
    const { code, state, error } = req.query
    if (error) return res.redirect(`${frontend}/ads?google_ads=error&reason=${encodeURIComponent(error)}`)
    if (!code || !state) return res.redirect(`${frontend}/ads?google_ads=error&reason=missing_code`)
    let schoolId
    try { schoolId = JSON.parse(Buffer.from(state, 'base64url').toString()).school_id }
    catch { return res.redirect(`${frontend}/ads?google_ads=error&reason=bad_state`) }

    const tokenRes = await axios.post(TOKEN_URL, new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

    const { refresh_token, access_token } = tokenRes.data
    if (!refresh_token) return res.redirect(`${frontend}/ads?google_ads=error&reason=no_refresh_token_try_reconnect`)

    await pool.execute(
      `INSERT INTO google_ads_connections (school_id, refresh_token, connected_at, sync_enabled)
       VALUES (?, ?, NOW(), 1)
       ON DUPLICATE KEY UPDATE refresh_token = VALUES(refresh_token), connected_at = NOW(), last_error = NULL`,
      [schoolId, refresh_token])

    let accessibleCustomers = []
    try {
      const listRes = await axios.get('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
        headers: { Authorization: `Bearer ${access_token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '' },
      })
      accessibleCustomers = (listRes.data.resourceNames || []).map(rn => rn.split('/')[1])
    } catch {}

    if (accessibleCustomers.length === 1) {
      await pool.execute(`UPDATE google_ads_connections SET customer_id = ? WHERE school_id = ?`, [accessibleCustomers[0], schoolId])
    }

    res.redirect(`${frontend}/ads?google_ads=connected${accessibleCustomers.length !== 1 ? '&pick_account=1' : ''}`)
  } catch (e) {
    console.error('Google Ads callback error:', e.response?.data || e.message)
    res.redirect(`${frontend}/ads?google_ads=error&reason=token_exchange_failed`)
  }
}

exports.status = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, customer_id, connected_at, last_synced_at, last_error, sync_enabled,
              budget_limit, budget_spent, budget_updated_at
       FROM google_ads_connections WHERE school_id = ?`, [req.user.school_id])
    if (!rows.length) return res.json({ connected: false })

    const conn = rows[0]
    let accessibleCustomers = []
    if (!conn.customer_id) {
      try { accessibleCustomers = await listAccessibleCustomers(req.user.school_id) } catch {}
    }

    const [last30] = await pool.execute(
      `SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(cost) cost, SUM(conversions) conversions
       FROM ad_platform_stats WHERE school_id=? AND platform='google_ads' AND stat_date > DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [req.user.school_id])

    res.json({ connected: true, ...conn, accessible_customers: accessibleCustomers, stats_30d: last30[0] })
  } catch (e) { next(e) }
}

exports.setCustomerId = async (req, res, next) => {
  try {
    const { customer_id } = req.body
    if (!customer_id?.trim()) return res.status(400).json({ message: 'customer_id is required' })
    const clean = customer_id.replace(/-/g, '').trim()
    const [result] = await pool.execute(
      `UPDATE google_ads_connections SET customer_id = ? WHERE school_id = ?`, [clean, req.user.school_id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Connect Google Ads first' })
    res.json({ message: 'Google Ads account linked' })
  } catch (e) { next(e) }
}

exports.disconnect = async (req, res, next) => {
  try {
    await pool.execute(`DELETE FROM google_ads_connections WHERE school_id = ?`, [req.user.school_id])
    res.json({ message: 'Google Ads disconnected' })
  } catch (e) { next(e) }
}

async function getAccessToken(refresh_token) {
  const r = await axios.post(TOKEN_URL, new URLSearchParams({
    refresh_token,
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    grant_type: 'refresh_token',
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  return r.data.access_token
}

async function listAccessibleCustomers(schoolId) {
  const [[conn]] = await pool.execute(`SELECT refresh_token FROM google_ads_connections WHERE school_id=?`, [schoolId])
  if (!conn) return []
  const access_token = await getAccessToken(conn.refresh_token)
  const r = await axios.get('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
    headers: { Authorization: `Bearer ${access_token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '' },
  })
  return (r.data.resourceNames || []).map(rn => rn.split('/')[1])
}

exports.getAccessToken = getAccessToken
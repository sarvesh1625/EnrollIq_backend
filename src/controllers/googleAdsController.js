const axios = require('axios')
const { pool } = require('../db/pool')

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPE     = 'https://www.googleapis.com/auth/adwords'

// Google retires each Ads API version about a year after release (v18 died 20 Aug 2025,
// v20 on 10 Jun 2026). Check https://developers.google.com/google-ads/api/docs/sunset-dates
// and change GOOGLE_ADS_API_VERSION in the server environment — no code change needed.
const API_VERSION = (process.env.GOOGLE_ADS_API_VERSION || 'v24').trim()
const ADS_BASE    = `https://googleads.googleapis.com/${API_VERSION}`

// Plain-English next step for the Google errors we actually run into.
const GOOGLE_HINTS = {
  SERVICE_DISABLED:              'The Google Ads API is switched off in the Google Cloud project that owns your OAuth client — open the link in the message and click Enable.',
  DEVELOPER_TOKEN_NOT_APPROVED:  'Your developer token is only approved for test accounts — apply for Basic access in Google Ads > Tools > API Center.',
  DEVELOPER_TOKEN_PROHIBITED:    'Google does not allow this developer token to be used from here — check it in Google Ads > Tools > API Center.',
  USER_PERMISSION_DENIED:        'The Google user you signed in with cannot open this account directly (it may sit under a manager account).',
  CUSTOMER_NOT_ENABLED:          'That Google Ads account is not active (cancelled or never finished set-up).',
  CUSTOMER_NOT_FOUND:            'That Customer ID was not found — re-check the number.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: 'The sign-in did not grant Google Ads access — click Connect with Google again and allow it.',
  invalid_client:                'This server\'s GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET are missing or wrong (or belong to a different Google Cloud project than the sign-in). Fix them in the server settings.',
  unauthorized_client:           'The saved Google sign-in was issued to a different OAuth client than this server uses — click Connect with Google again.',
  invalid_grant:                 'The Google sign-in expired or was revoked — click Connect with Google again (testing-mode sign-ins last about 7 days).',
}

// Pull the useful parts out of a Google error. Google answers in several shapes:
//   { error: { message, status, details: [...] } }          (most calls)
//   [ { error: { message, status, details: [...] } } ]      (searchStream wraps errors in a list)
//   { error: 'invalid_grant', error_description: '...' }    (the sign-in token endpoint)
//   an HTML page                                            (never shown to users)
function parseGoogleError(e) {
  const data = e.response?.data
  const body = Array.isArray(data) ? data[0] : data
  const err = body && typeof body === 'object' ? body.error : null
  let code = null, message = null, project = null
  if (typeof err === 'string') {                        // OAuth style
    code = err; message = body.error_description || null
  } else if (err && typeof err === 'object') {
    for (const d of (err.details || [])) {
      if (!code && d.reason) code = d.reason                                 // e.g. SERVICE_DISABLED
      if (!project && d.metadata && d.metadata.consumer) project = String(d.metadata.consumer).replace('projects/', '')
      for (const f of (d.errors || [])) {                                    // Google Ads failure list
        if (!code && f.errorCode && typeof f.errorCode === 'object') code = Object.values(f.errorCode)[0]
        if (!message && f.message) message = f.message
      }
    }
    code = code || err.status || null
    message = message || err.message || null
  } else if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) {
    message = data.slice(0, 160)
  }
  return { status: e.response?.status, code, project, message: message || e.message }
}

// Turn a failed Google call into one readable sentence (shown on the Ads card / logged).
// Fits the 250-character last_error column: code + hint first, Google's own words after.
function describeGoogleError(e) {
  const { status, code, project, message } = parseGoogleError(e)
  let hint = GOOGLE_HINTS[code]
  if (code === 'SERVICE_DISABLED' && project)       // say WHICH project, so it can't be missed or cut off
    hint = `The Google Ads API is switched off in Google Cloud project ${project} (the one that owns your OAuth client). Enable it there: APIs & Services > Library > Google Ads API.`
  if (status === 404 && !code)
    return `Google returned 404 — the Google Ads API version (${API_VERSION}) may have been retired. Set GOOGLE_ADS_API_VERSION to a current version. (${message})`
  const head = `${status ? 'HTTP ' + status : 'Error'}${code ? ' ' + code : ''}`
  return hint ? `${head}: ${hint} — Google said: ${message}` : `${head}: ${message}`
}

// Right after an account is linked, pull its stats once straight away instead of making the
// school wait for the 6-hourly job — and record any failure on the card so it is visible at once.
function kickSync(schoolId) {
  setImmediate(async () => {
    try {
      const [[conn]] = await pool.execute(
        'SELECT * FROM google_ads_connections WHERE school_id=? AND customer_id IS NOT NULL', [schoolId])
      if (!conn) return
      const n = await require('../services/googleAdsSync').syncSchool(conn)
      console.log(`📊  [school ${schoolId}] first Google Ads sync: ${n} stat row(s)`)
    } catch (e) {
      const msg = describeGoogleError(e)
      console.error(`⚠️  [school ${schoolId}] first Google Ads sync failed:`, msg)
      pool.execute('UPDATE google_ads_connections SET last_error=? WHERE school_id=?',
        [String(msg).slice(0, 250), schoolId]).catch(() => {})
    }
  })
}

async function fetchAccessibleCustomers(access_token) {
  const r = await axios.get(`${ADS_BASE}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${access_token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '' },
  })
  return (r.data.resourceNames || []).map(rn => rn.split('/')[1])
}

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
      accessibleCustomers = await fetchAccessibleCustomers(access_token)
    } catch (e) {
      // The sign-in itself succeeded and is saved; only the account list failed. Keep going so the
      // school can type its Customer ID — but never hide WHY (this used to fail silently).
      console.error('Google Ads: listing accessible accounts failed:', describeGoogleError(e))
    }

    if (accessibleCustomers.length === 1) {
      await pool.execute(`UPDATE google_ads_connections SET customer_id = ? WHERE school_id = ?`, [accessibleCustomers[0], schoolId])
      kickSync(schoolId)
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
    let accountsError = null
    if (!conn.customer_id) {
      // Still needs an account picked — try listing again with a fresh access token
      try {
        accessibleCustomers = await listAccessibleCustomers(req.user.school_id)
        if (accessibleCustomers.length === 1) {          // same rule as the sign-in callback
          await pool.execute(`UPDATE google_ads_connections SET customer_id = ? WHERE school_id = ?`,
            [accessibleCustomers[0], req.user.school_id])
          conn.customer_id = accessibleCustomers[0]
          accessibleCustomers = []
          kickSync(req.user.school_id)
        }
      } catch (e) {
        accountsError = describeGoogleError(e)
        console.error('Google Ads: listing accessible accounts failed:', accountsError)
      }
    }

    const [last30] = await pool.execute(
      `SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(cost) cost, SUM(conversions) conversions
       FROM ad_platform_stats WHERE school_id=? AND platform='google_ads' AND stat_date > DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [req.user.school_id])

    res.json({ connected: true, ...conn, accessible_customers: accessibleCustomers, accounts_error: accountsError, stats_30d: last30[0] })
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
    kickSync(req.user.school_id)
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
  // Without these, URLSearchParams would send the literal text "undefined" to Google and the
  // error would be a confusing "OAuth client was not found". Say what is actually wrong instead.
  if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET)
    throw new Error('This server has no GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET set, so it cannot talk to Google. (On your own computer, set GOOGLE_ADS_SYNC=off in .env.)')
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
  return fetchAccessibleCustomers(access_token)
}

exports.getAccessToken = getAccessToken
exports.API_VERSION = API_VERSION
exports.ADS_BASE = ADS_BASE
exports.describeGoogleError = describeGoogleError
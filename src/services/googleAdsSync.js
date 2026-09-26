/**
 * EnrollIQ — Google Ads stats + budget sync
 * --------------------------------------------
 * For every connected school:
 *  1. Pulls last-7-day campaign performance (impressions/clicks/cost/conversions)
 *  2. Pulls account_budget (Google's own budget/spend tracking) — read-only,
 *     this can NEVER add or move funds, only report what Google already has.
 *     If the account is postpaid (no prepaid limit), account_budget comes
 *     back empty — we mark it budget_is_postpaid=1 so the UI shows
 *     "amount spent" instead of a fabricated "remaining" number.
 */
const axios = require('axios')
const { pool } = require('../db/pool')
const { getAccessToken } = require('../controllers/googleAdsController')

const POLL_MS = Number(process.env.GOOGLE_ADS_SYNC_MS || 6 * 60 * 60 * 1000)
const API_VERSION = 'v18'

const CAMPAIGN_GAQL = `
  SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, segments.date
  FROM campaign
  WHERE segments.date DURING LAST_7_DAYS
`

const BUDGET_GAQL = `
  SELECT account_budget.approved_spending_limit_micros,
         account_budget.amount_served_micros,
         account_budget.status
  FROM account_budget
  WHERE account_budget.status = 'APPROVED'
`

async function gaqlSearch(customerId, access_token, query) {
  const r = await axios.post(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    { query },
    { headers: {
        Authorization: `Bearer ${access_token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
        'Content-Type': 'application/json',
    } })
  return (r.data || []).flatMap(chunk => chunk.results || [])
}

async function syncSchool(conn) {
  const access_token = await getAccessToken(conn.refresh_token)

  // ── Campaign performance ──────────────────────────────────────────
  const rows = await gaqlSearch(conn.customer_id, access_token, CAMPAIGN_GAQL)
  let updated = 0
  for (const row of rows) {
    const date = row.segments?.date
    if (!date) continue
    const campaign = row.campaign?.name || 'Unnamed campaign'
    const impressions = Number(row.metrics?.impressions || 0)
    const clicks = Number(row.metrics?.clicks || 0)
    const cost = Number(row.metrics?.costMicros || 0) / 1_000_000
    const conversions = Math.round(Number(row.metrics?.conversions || 0))

    await pool.execute(
      `INSERT INTO ad_platform_stats (school_id, platform, stat_date, campaign_name, impressions, clicks, cost, conversions)
       VALUES (?, 'google_ads', ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE impressions=VALUES(impressions), clicks=VALUES(clicks),
         cost=VALUES(cost), conversions=VALUES(conversions), updated_at=NOW()`,
      [conn.school_id, date, campaign, impressions, clicks, cost, conversions])
    updated++
  }

  // ── Account budget (read-only — never writes anything back to Google) ──
  let budgetLimit = null, budgetSpent = null, isPostpaid = 1
  try {
    const budgetRows = await gaqlSearch(conn.customer_id, access_token, BUDGET_GAQL)
    if (budgetRows.length) {
      // Sum across all approved budget documents (an account can have more than one)
      budgetLimit = budgetRows.reduce((s, r) => s + Number(r.accountBudget?.approvedSpendingLimitMicros || 0), 0) / 1_000_000
      budgetSpent = budgetRows.reduce((s, r) => s + Number(r.accountBudget?.amountServedMicros || 0), 0) / 1_000_000
      isPostpaid = 0
    }
  } catch {
    // account_budget query can fail outright for standard postpaid (credit card) accounts —
    // that's expected, not an error; it just means there's no prepaid limit to report.
  }

  await pool.execute(
    `UPDATE google_ads_connections
     SET last_synced_at=NOW(), last_error=NULL,
         budget_limit=?, budget_spent=?, budget_is_postpaid=?, budget_updated_at=NOW()
     WHERE id=?`,
    [budgetLimit, budgetSpent, isPostpaid, conn.id])

  return updated
}

async function tick() {
  let connections
  try {
    [connections] = await pool.query(
      `SELECT * FROM google_ads_connections WHERE sync_enabled = 1 AND customer_id IS NOT NULL`)
  } catch { return }

  for (const conn of connections) {
    try {
      const n = await syncSchool(conn)
      if (n) console.log(`📊  [school ${conn.school_id}] synced ${n} Google Ads stat row(s)`)
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message
      console.log(`⚠️  [school ${conn.school_id}] Google Ads sync error:`, msg)
      pool.execute(`UPDATE google_ads_connections SET last_error = ? WHERE id = ?`,
        [String(msg).slice(0, 250), conn.id]).catch(() => {})
    }
  }
}

let timer = null
function start() {
  if ((process.env.GOOGLE_ADS_SYNC || 'on').toLowerCase() === 'off') {
    console.log('ℹ️  Google Ads sync is OFF')
    return
  }
  console.log(`📊  Google Ads sync started (every ${Math.round(POLL_MS / 60000)}min)`)
  tick()
  timer = setInterval(tick, POLL_MS)
}
function stop() { if (timer) clearInterval(timer) }

module.exports = { start, stop, tick, syncSchool }
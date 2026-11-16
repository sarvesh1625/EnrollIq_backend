/**
 * EnrollIQ — payment gateway connectors (Razorpay · Cashfree · PhonePe)
 * Save as:  backend/src/services/paymentGateways.js
 *
 * No extra npm packages: plain HTTPS calls. Each school uses ITS OWN gateway account, so every
 * call here receives that school's credentials. Money goes straight to the school.
 *
 * A connector offers:
 *   fields                         what the school must enter in Settings
 *   createOrder(ctx)               → { providerOrderId, client }     (client = what the pay page needs)
 *   fetchStatus(ctx)               → { state:'paid'|'failed'|'pending', paymentId, amountPaise }
 *   verifyWebhook(req, creds, mode)→ true | false
 *   webhookRef(body)               → { merchantOrderId?, providerOrderId? }  (which attempt it is about)
 *   ping(creds, mode)              → { ok, message }                 ("Test connection" button)
 */
const crypto = require('crypto')
const https = require('https')
const { URL } = require('url')

/* ── secrets at rest (AES-256-GCM) ─────────────────────────────────────────── */
function secretKey() {
  const s = process.env.PAYMENT_SECRET_KEY || process.env.JWT_SECRET
  if (!s) throw new Error('Set PAYMENT_SECRET_KEY (any long random text) in the backend .env')
  return crypto.createHash('sha256').update(String(s)).digest()
}
function encrypt(obj) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}
function decrypt(str) {
  const [v, iv, tag, ct] = String(str || '').split(':')
  if (v !== 'v1') throw new Error('Unreadable saved credentials — please save them again')
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'))
}

/* ── tiny HTTPS helper (replaceable in tests via net.request) ──────────────── */
const net = {
  request({ method = 'GET', url, headers = {}, json, form, timeout = 20000 }) {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      let payload = null
      const h = { Accept: 'application/json', ...headers }
      if (json !== undefined) { payload = JSON.stringify(json); h['Content-Type'] = 'application/json' }
      else if (form) { payload = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded' }
      if (payload) h['Content-Length'] = Buffer.byteLength(payload)
      const req = https.request({ method, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: h, timeout }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let body = null
          try { body = text ? JSON.parse(text) : null } catch { /* not JSON */ }
          resolve({ status: res.statusCode, body, text })
        })
      })
      req.on('timeout', () => req.destroy(new Error('The payment gateway took too long to answer')))
      req.on('error', reject)
      if (payload) req.write(payload)
      req.end()
    })
  },
}
const call = (opts) => net.request(opts)
const errText = (r) => r?.body?.error?.description || r?.body?.message || r?.body?.error_description || r?.body?.code || (r?.text || '').slice(0, 200) || `HTTP ${r?.status}`
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y) }
const paise = (rupees) => Math.round(Number(rupees) * 100)
const clean10 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : '' }

/* ═══════════════════════════ RAZORPAY ═══════════════════════════ */
const razorpay = {
  label: 'Razorpay',
  fields: [
    { key: 'key_id', label: 'Key ID', required: true, help: 'Razorpay Dashboard → Account & Settings → API Keys. Starts with rzp_test_ or rzp_live_' },
    { key: 'key_secret', label: 'Key Secret', secret: true, required: true },
    { key: 'webhook_secret', label: 'Webhook secret (optional)', secret: true, help: 'Dashboard → Webhooks → add the URL shown below → type any secret here and in Razorpay. Payments still confirm without it.' },
  ],
  auth: (c) => ({ Authorization: 'Basic ' + Buffer.from(`${c.key_id}:${c.key_secret}`).toString('base64') }),
  async createOrder({ creds, attempt }) {
    const r = await call({ method: 'POST', url: 'https://api.razorpay.com/v1/orders', headers: razorpay.auth(creds),
      json: { amount: paise(attempt.amount), currency: 'INR', receipt: attempt.merchantOrderId.slice(0, 40), notes: { merchant_order_id: attempt.merchantOrderId } } })
    if (r.status !== 200 || !r.body?.id) throw new Error('Razorpay: ' + errText(r))
    return { providerOrderId: r.body.id, client: { type: 'razorpay', key_id: creds.key_id, order_id: r.body.id, amount_paise: r.body.amount, currency: 'INR' } }
  },
  async fetchStatus({ creds, attempt }) {
    const r = await call({ url: `https://api.razorpay.com/v1/orders/${encodeURIComponent(attempt.providerOrderId)}/payments`, headers: razorpay.auth(creds) })
    if (r.status !== 200) throw new Error('Razorpay: ' + errText(r))
    const ok = (r.body?.items || []).find((p) => p.status === 'captured')
    if (ok) return { state: 'paid', paymentId: ok.id, amountPaise: Number(ok.amount) }
    return { state: 'pending' }                     // a failed card can be retried on the same order
  },
  verifyCheckout(creds, orderId, paymentId, signature) {
    const expect = crypto.createHmac('sha256', creds.key_secret).update(`${orderId}|${paymentId}`).digest('hex')
    return safeEq(expect, signature)
  },
  verifyWebhook(req, creds) {
    if (!creds.webhook_secret) return true           // optional — the payment is re-checked with Razorpay anyway
    const sig = req.headers['x-razorpay-signature']
    if (!req.rawBody || !sig) return false
    return safeEq(crypto.createHmac('sha256', creds.webhook_secret).update(req.rawBody).digest('hex'), sig)
  },
  webhookRef(b) {
    const pay = b?.payload?.payment?.entity, ord = b?.payload?.order?.entity
    return { providerOrderId: pay?.order_id || ord?.id }
  },
  async ping(creds) {
    const r = await call({ url: 'https://api.razorpay.com/v1/orders?count=1', headers: razorpay.auth(creds) })
    return r.status === 200 ? { ok: true, message: 'Connected to Razorpay.' } : { ok: false, message: 'Razorpay said: ' + errText(r) }
  },
}

/* ═══════════════════════════ CASHFREE ═══════════════════════════ */
const CF_VERSION = '2025-01-01'
const cfBase = (mode) => (mode === 'live' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg')
const cfHead = (c) => ({ 'x-client-id': c.client_id, 'x-client-secret': c.client_secret, 'x-api-version': CF_VERSION })
const cashfree = {
  label: 'Cashfree',
  fields: [
    { key: 'client_id', label: 'App ID (Client ID)', required: true, help: 'Cashfree Dashboard → Payment Gateway → Developers → API Keys' },
    { key: 'client_secret', label: 'Secret Key', secret: true, required: true },
  ],
  async createOrder({ creds, mode, attempt, payer, returnUrl, notifyUrl, description }) {
    const body = {
      order_id: attempt.merchantOrderId, order_amount: Number(attempt.amount), order_currency: 'INR',
      customer_details: { customer_id: 'stu' + payer.studentId, customer_phone: clean10(payer.phone) || '9999999999', customer_name: (payer.name || 'Parent').slice(0, 100), ...(payer.email ? { customer_email: payer.email } : {}) },
      order_meta: { return_url: returnUrl, ...(notifyUrl ? { notify_url: notifyUrl } : {}) },
      order_note: (description || 'School fees').slice(0, 200),
    }
    const r = await call({ method: 'POST', url: cfBase(mode) + '/orders', headers: cfHead(creds), json: body })
    if (r.status !== 200 || !r.body?.payment_session_id) throw new Error('Cashfree: ' + errText(r))
    return { providerOrderId: r.body.cf_order_id ? String(r.body.cf_order_id) : attempt.merchantOrderId,
             client: { type: 'cashfree', payment_session_id: r.body.payment_session_id, mode: mode === 'live' ? 'production' : 'sandbox' } }
  },
  async fetchStatus({ creds, mode, attempt }) {
    const r = await call({ url: `${cfBase(mode)}/orders/${encodeURIComponent(attempt.merchantOrderId)}`, headers: cfHead(creds) })
    if (r.status !== 200) throw new Error('Cashfree: ' + errText(r))
    const st = r.body?.order_status
    if (st === 'PAID') {
      let paymentId = null, amountPaise = paise(r.body.order_amount)
      const p = await call({ url: `${cfBase(mode)}/orders/${encodeURIComponent(attempt.merchantOrderId)}/payments`, headers: cfHead(creds) })
      const hit = Array.isArray(p.body) ? p.body.find((x) => x.payment_status === 'SUCCESS') : null
      if (hit) paymentId = String(hit.cf_payment_id)
      return { state: 'paid', paymentId, amountPaise }
    }
    if (st === 'EXPIRED' || st === 'TERMINATED' || st === 'TERMINATION_REQUESTED') return { state: 'failed' }
    return { state: 'pending' }
  },
  verifyWebhook(req, creds) {
    const sig = req.headers['x-webhook-signature'], ts = req.headers['x-webhook-timestamp']
    if (!req.rawBody || !sig || !ts) return false
    const expect = crypto.createHmac('sha256', creds.client_secret).update(String(ts) + req.rawBody.toString('utf8')).digest('base64')
    return safeEq(expect, sig)
  },
  webhookRef(b) { return { merchantOrderId: b?.data?.order?.order_id } },
  async ping(creds, mode) {
    const r = await call({ url: `${cfBase(mode)}/orders/enrolliq_connection_test`, headers: cfHead(creds) })
    if (r.status === 404 || r.status === 200) return { ok: true, message: 'Connected to Cashfree.' }      // order not found = keys were accepted
    return { ok: false, message: 'Cashfree said: ' + errText(r) }
  },
}

/* ═══════════════════════════ PHONEPE (Standard Checkout v2) ═══════════════════════════ */
const ppBase = (mode) => (mode === 'live' ? 'https://api.phonepe.com/apis' : 'https://api-preprod.phonepe.com/apis/pg-sandbox')
const ppTokenUrl = (mode) => (mode === 'live' ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token' : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token')
const ppApi = (mode) => (mode === 'live' ? 'https://api.phonepe.com/apis/pg' : 'https://api-preprod.phonepe.com/apis/pg-sandbox')
const ppTokens = new Map()                           // client_id+mode → { token, exp }
async function ppToken(creds, mode) {
  const k = creds.client_id + '|' + mode, hit = ppTokens.get(k)
  if (hit && hit.exp > Date.now() + 60000) return hit.token
  const r = await call({ method: 'POST', url: ppTokenUrl(mode), form: { client_id: creds.client_id, client_version: creds.client_version || '1', client_secret: creds.client_secret, grant_type: 'client_credentials' } })
  if (r.status !== 200 || !r.body?.access_token) throw new Error('PhonePe: ' + errText(r))
  const exp = Number(r.body.expires_at) ? Number(r.body.expires_at) * 1000 : Date.now() + 10 * 60000
  ppTokens.set(k, { token: r.body.access_token, exp })
  return r.body.access_token
}
const phonepe = {
  label: 'PhonePe',
  fields: [
    { key: 'client_id', label: 'Client ID', required: true, help: 'PhonePe Business → Developer Settings → API Keys' },
    { key: 'client_secret', label: 'Client Secret', secret: true, required: true },
    { key: 'client_version', label: 'Client Version', required: true, default: '1' },
    { key: 'webhook_username', label: 'Webhook username (optional)', help: 'PhonePe Dashboard → Developer Settings → Webhook → add the URL shown below with a username and password.' },
    { key: 'webhook_password', label: 'Webhook password (optional)', secret: true },
  ],
  async createOrder({ creds, mode, attempt, payer, returnUrl }) {
    const token = await ppToken(creds, mode)
    const body = { merchantOrderId: attempt.merchantOrderId, amount: paise(attempt.amount), expireAfter: 1800,
      metaInfo: { udf1: String(payer.studentId), udf2: String(attempt.linkId) },
      paymentFlow: { type: 'PG_CHECKOUT', merchantUrls: { redirectUrl: returnUrl } } }
    const r = await call({ method: 'POST', url: ppApi(mode) + '/checkout/v2/pay', headers: { Authorization: 'O-Bearer ' + token }, json: body })
    if (r.status !== 200 || !r.body?.redirectUrl) throw new Error('PhonePe: ' + errText(r))
    return { providerOrderId: r.body.orderId || attempt.merchantOrderId, client: { type: 'phonepe', redirect_url: r.body.redirectUrl } }
  },
  async fetchStatus({ creds, mode, attempt }) {
    const token = await ppToken(creds, mode)
    const r = await call({ url: `${ppApi(mode)}/checkout/v2/order/${encodeURIComponent(attempt.merchantOrderId)}/status?details=true`, headers: { Authorization: 'O-Bearer ' + token } })
    if (r.status !== 200) throw new Error('PhonePe: ' + errText(r))
    const st = r.body?.state
    if (st === 'COMPLETED') {
      const d = (r.body.paymentDetails || []).find((x) => x.state === 'COMPLETED') || {}
      return { state: 'paid', paymentId: d.transactionId || r.body.orderId || null, amountPaise: Number(r.body.amount) }
    }
    if (st === 'FAILED') return { state: 'failed' }
    return { state: 'pending' }
  },
  verifyWebhook(req, creds) {
    if (!creds.webhook_username || !creds.webhook_password) return true      // optional — re-checked with PhonePe anyway
    const expect = crypto.createHash('sha256').update(`${creds.webhook_username}:${creds.webhook_password}`).digest('hex')
    const got = String(req.headers.authorization || '').replace(/^SHA256\s*\(?/i, '').replace(/\)$/, '')
    return safeEq(expect, got)
  },
  webhookRef(b) { return { merchantOrderId: b?.payload?.merchantOrderId } },
  async ping(creds, mode) {
    try { ppTokens.delete(creds.client_id + '|' + mode); await ppToken(creds, mode); return { ok: true, message: 'Connected to PhonePe.' } }
    catch (e) { return { ok: false, message: e.message } }
  },
}

const PROVIDERS = { razorpay, cashfree, phonepe }
const ORDER = ['razorpay', 'cashfree', 'phonepe']      // display order: Razorpay first, Cashfree second, PhonePe third

module.exports = { PROVIDERS, ORDER, encrypt, decrypt, net, paise, safeEq }
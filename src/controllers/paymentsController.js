/**
 * EnrollIQ — online fee payments (controller)
 * Save as:  backend/src/controllers/paymentsController.js
 *
 * School side  (login needed):  gateway keys, test connection, create pay link, transactions
 * Parent side  (public token):  view link, start payment, confirm / re-check
 * Gateways     (public, signed): webhooks
 *
 * Rules that keep money safe:
 *  • the amount is ALWAYS worked out on the server from the fee rows — never taken from the browser
 *  • a payment is marked Paid only after the gateway itself confirms it (signature or a status call)
 *  • marking Paid is done once, inside a transaction (webhook + page return can both arrive)
 */
const crypto = require('crypto')
const { pool } = require('../db/pool')
const gw = require('../services/paymentGateways')
const { PROVIDERS, ORDER, encrypt, decrypt } = gw

const MANAGERS = ['admin', 'chairman', 'accountant', 'principal', 'super_admin', 'superadmin']
const clientBase = () => String(process.env.CLIENT_URL || 'https://enrolliq.io').replace(/\/+$/, '')
const apiBase = () => String(process.env.API_URL || 'https://api.enrolliq.io').replace(/\/+$/, '')
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const fail = (res, code, message) => res.status(code).json({ message })

/* ── helpers ─────────────────────────────────────────────────────────────── */
const colCache = {}
async function tableCols(name) {
  if (!colCache[name]) {
    const [rows] = await pool.query('SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [name])
    colCache[name] = new Set(rows.map((r) => r.c))
  }
  return colCache[name]
}
const isManager = (req) => MANAGERS.includes(String(req.user?.role || '').toLowerCase())
const guard = (req, res) => { if (!isManager(req)) { fail(res, 403, 'Only the school admin, chairman or accountant can do this.'); return false } return true }

function configured(provider, creds) {
  return !!creds && PROVIDERS[provider].fields.filter((f) => f.required).every((f) => String(creds[f.key] || '').trim())
}
async function loadGateway(schoolId, provider) {
  const [[row]] = await pool.query('SELECT * FROM school_payment_gateways WHERE school_id=? AND provider=?', [schoolId, provider])
  if (!row) return null
  let creds = null
  try { creds = decrypt(row.credentials_enc) } catch { creds = null }
  return { row, creds, mode: row.mode === 'live' ? 'live' : 'test', enabled: !!row.is_enabled && configured(provider, creds) }
}

/* amounts still owed on a set of fee rows */
async function dueRows(db, schoolId, studentId, ids) {
  const cols = await tableCols('payments')
  const hasPaid = cols.has('paid_amount')
  let sql = `SELECT * FROM payments WHERE school_id=? AND student_id=? AND (status IS NULL OR status<>'Paid')`
  const params = [schoolId, studentId]
  if (ids && ids.length) { sql += ' AND id IN (?)'; params.push(ids) }
  sql += ' ORDER BY due_date, id'
  const [rows] = await db.query(sql, params)
  return rows.map((p) => ({ id: p.id, fee_type: p.fee_type || 'Fee', due_date: p.due_date, status: p.status, total: r2(p.amount), due: r2(Number(p.amount) - (hasPaid ? Number(p.paid_amount || 0) : 0)) })).filter((p) => p.due > 0)
}

/* ═══════════════ SCHOOL SIDE ═══════════════ */
const mask = (v) => (v ? '••••' + String(v).slice(-4) : '')

exports.listGateways = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    const schoolId = req.user.school_id
    const out = []
    for (const p of ORDER) {
      const g = await loadGateway(schoolId, p)
      const fields = PROVIDERS[p].fields.map((f) => ({
        key: f.key, label: f.label, secret: !!f.secret, required: !!f.required, help: f.help || null, default: f.default || null,
        value: f.secret ? mask(g?.creds?.[f.key]) : (g?.creds?.[f.key] || ''), has_value: !!g?.creds?.[f.key],
      }))
      out.push({ provider: p, label: PROVIDERS[p].label, saved: !!g, configured: !!g && configured(p, g.creds), enabled: !!g?.row.is_enabled, mode: g?.mode || 'test',
        fields, webhook_url: `${apiBase()}/api/payments/webhook/${p}`, shown_to_parents: !!g?.enabled })
    }
    res.json(out)
  } catch (e) { next(e) }
}

exports.saveGateway = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    const provider = req.params.provider, P = PROVIDERS[provider]
    if (!P) return fail(res, 404, 'Unknown payment gateway.')
    const schoolId = req.user.school_id
    const old = await loadGateway(schoolId, provider)
    const incoming = req.body?.credentials || {}
    const creds = {}
    for (const f of P.fields) {
      const v = typeof incoming[f.key] === 'string' ? incoming[f.key].trim() : ''
      creds[f.key] = v || (old?.creds?.[f.key] || f.default || '')            // blank secret box = keep the saved one
    }
    const missing = P.fields.filter((f) => f.required && !creds[f.key]).map((f) => f.label)
    if (missing.length) return fail(res, 400, `Please fill: ${missing.join(', ')}`)
    let mode = req.body?.mode === 'live' ? 'live' : 'test'
    if (provider === 'razorpay') {
      if (!/^rzp_(test|live)_/.test(creds.key_id)) return fail(res, 400, 'Razorpay Key ID should start with rzp_test_ or rzp_live_.')
      mode = creds.key_id.startsWith('rzp_live_') ? 'live' : 'test'
    }
    const enabled = req.body?.enabled === false ? 0 : 1
    await pool.query(
      `INSERT INTO school_payment_gateways (school_id, provider, is_enabled, mode, credentials_enc) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE is_enabled=VALUES(is_enabled), mode=VALUES(mode), credentials_enc=VALUES(credentials_enc)`,
      [schoolId, provider, enabled, mode, encrypt(creds)])
    res.json({ message: `${P.label} saved (${mode} mode).` })
  } catch (e) { next(e) }
}

exports.toggleGateway = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    const provider = req.params.provider
    if (!PROVIDERS[provider]) return fail(res, 404, 'Unknown payment gateway.')
    const [r] = await pool.query('UPDATE school_payment_gateways SET is_enabled=? WHERE school_id=? AND provider=?', [req.body?.enabled ? 1 : 0, req.user.school_id, provider])
    if (!r.affectedRows) return fail(res, 404, 'Save the keys first.')
    res.json({ message: req.body?.enabled ? 'Enabled — parents can now pay with it.' : 'Disabled — parents will no longer see it.' })
  } catch (e) { next(e) }
}

exports.deleteGateway = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    if (!PROVIDERS[req.params.provider]) return fail(res, 404, 'Unknown payment gateway.')
    await pool.query('DELETE FROM school_payment_gateways WHERE school_id=? AND provider=?', [req.user.school_id, req.params.provider])
    res.json({ message: 'Removed.' })
  } catch (e) { next(e) }
}

exports.testGateway = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    const p = req.params.provider
    if (!PROVIDERS[p]) return fail(res, 404, 'Unknown payment gateway.')
    const g = await loadGateway(req.user.school_id, p)
    if (!g || !configured(p, g.creds)) return fail(res, 400, 'Save the keys first.')
    let out
    try { out = await PROVIDERS[p].ping(g.creds, g.mode) } catch (e) { out = { ok: false, message: e.message } }
    res.json(out)
  } catch (e) { next(e) }
}

/* ── pay links ── */
async function createLink({ schoolId, studentId, paymentIds, createdBy, days = 7 }) {
  const [[st]] = await pool.query('SELECT id FROM students WHERE id=? AND school_id=?', [studentId, schoolId])
  if (!st) { const e = new Error('Student not found in this school.'); e.status = 404; throw e }
  const items = await dueRows(pool, schoolId, studentId, paymentIds)
  if (!items.length) { const e = new Error('There are no pending fees for this student.'); e.status = 400; throw e }
  const amount = r2(items.reduce((a, b) => a + b.due, 0))
  const token = crypto.randomBytes(16).toString('hex')
  await pool.query(
    `INSERT INTO payment_links (token, school_id, student_id, payment_ids, amount, expires_at, created_by)
     VALUES (?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)`,
    [token, schoolId, studentId, JSON.stringify(items.map((i) => i.id)), amount, days, createdBy || null])
  return { token, url: `${clientBase()}/pay/${token}`, amount, items }
}
exports._createLink = createLink

exports.createLinkRoute = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    const studentId = Number(req.body?.student_id)
    if (!studentId) return fail(res, 400, 'student_id is required.')
    const ids = Array.isArray(req.body?.payment_ids) ? req.body.payment_ids.map(Number).filter(Boolean) : null
    res.status(201).json(await createLink({ schoolId: req.user.school_id, studentId, paymentIds: ids, createdBy: req.user.id }))
  } catch (e) { if (e.status) return fail(res, e.status, e.message); next(e) }
}

exports.transactions = async (req, res, next) => {
  try {
    if (!guard(req, res)) return
    const [rows] = await pool.query(
      `SELECT a.id, a.provider, a.amount, a.status, a.provider_payment_id, a.merchant_order_id, a.error, a.created_at, a.paid_at,
              l.student_id, s.name AS student_name, s.class AS student_class
         FROM payment_attempts a
         JOIN payment_links l ON l.id = a.link_id
         LEFT JOIN students s ON s.id = l.student_id
        WHERE a.school_id = ? ORDER BY a.id DESC LIMIT 200`, [req.user.school_id])
    res.json(rows)
  } catch (e) { next(e) }
}

/* ═══════════════ settling a payment (shared by return page, webhook, verify) ═══════════════ */
async function markPaid(attemptId, providerPaymentId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[a]] = await conn.query('SELECT * FROM payment_attempts WHERE id=? FOR UPDATE', [attemptId])
    if (!a) { await conn.rollback(); return { done: false } }
    if (a.status === 'paid') { await conn.commit(); return { done: true, already: true } }
    const [[link]] = await conn.query('SELECT * FROM payment_links WHERE id=? FOR UPDATE', [a.link_id])
    const ids = JSON.parse(link.payment_ids || '[]')
    const cols = await tableCols('payments')
    const [rows] = ids.length ? await conn.query('SELECT * FROM payments WHERE id IN (?) AND school_id=? ORDER BY due_date, id FOR UPDATE', [ids, a.school_id]) : [[]]
    let remaining = r2(a.amount)
    const label = PROVIDERS[a.provider]?.label || a.provider
    for (const p of rows) {
      if (remaining <= 0) break
      const total = Number(p.amount), already = cols.has('paid_amount') ? Number(p.paid_amount || 0) : 0
      const due = r2(total - already)
      if (due <= 0) continue
      const pay = Math.min(due, remaining)
      const newPaid = r2(already + pay)
      const sets = ['status=?'], vals = [newPaid >= total - 0.001 ? 'Paid' : 'Partial']
      if (cols.has('paid_amount')) { sets.push('paid_amount=?'); vals.push(newPaid) }
      if (cols.has('paid_date')) sets.push('paid_date=CURDATE()')
      if (cols.has('payment_mode')) { sets.push('payment_mode=?'); vals.push(label) }
      if (cols.has('reference_no') && providerPaymentId) { sets.push('reference_no=?'); vals.push(String(providerPaymentId).slice(0, 100)) }
      await conn.query(`UPDATE payments SET ${sets.join(', ')} WHERE id=?`, [...vals, p.id])
      remaining = r2(remaining - pay)
    }
    const note = remaining > 0.009 ? `Received ₹${a.amount}, but only ₹${r2(a.amount - remaining)} was still due (the rest may have been paid another way) — please review.` : null
    await conn.query(`UPDATE payment_attempts SET status='paid', provider_payment_id=?, paid_at=NOW(), error=? WHERE id=?`, [providerPaymentId ? String(providerPaymentId).slice(0, 100) : null, note, a.id])
    const left = await dueRows(conn, a.school_id, link.student_id, ids)
    if (!left.length) await conn.query(`UPDATE payment_links SET status='paid', paid_at=NOW() WHERE id=?`, [link.id])
    await conn.commit()
    return { done: true }
  } catch (e) { try { await conn.rollback() } catch { /* ignore */ } throw e }
  finally { conn.release() }
}

/* Ask the gateway what happened to one attempt, and record it. → 'paid' | 'failed' | 'pending' */
async function settleAttempt(a, g) {
  if (a.status === 'paid') return 'paid'
  const P = PROVIDERS[a.provider]
  const st = await P.fetchStatus({ creds: g.creds, mode: g.mode, attempt: { merchantOrderId: a.merchant_order_id, providerOrderId: a.provider_order_id, amount: a.amount } })
  if (st.state === 'paid') {
    if (st.amountPaise && Math.abs(st.amountPaise - gw.paise(a.amount)) > 1) {
      await pool.query(`UPDATE payment_attempts SET error=? WHERE id=?`, [`Gateway reports ${st.amountPaise / 100} but ${a.amount} was expected — not marked paid. Check the gateway dashboard.`, a.id])
      return 'pending'
    }
    await markPaid(a.id, st.paymentId)
    return 'paid'
  }
  if (st.state === 'failed') { await pool.query(`UPDATE payment_attempts SET status='failed' WHERE id=? AND status='created'`, [a.id]); return 'failed' }
  return 'pending'
}

/* ═══════════════ PARENT SIDE (public, by pay-link token) ═══════════════ */
const hits = new Map()
function limited(req, res, perMin = 40) {
  const k = (req.headers['x-forwarded-for'] || req.ip || '') + '|' + req.path.split('/')[1]
  const now = Date.now(), arr = (hits.get(k) || []).filter((t) => now - t < 60000)
  arr.push(now); hits.set(k, arr)
  if (hits.size > 5000) hits.clear()
  if (arr.length > perMin) { fail(res, 429, 'Too many tries. Please wait a minute.'); return true }
  return false
}
async function getLink(req, res) {
  const token = String(req.params.token || '')
  if (!/^[a-f0-9]{32}$/.test(token)) { fail(res, 404, 'This payment link is not valid.'); return null }
  const [[l]] = await pool.query('SELECT * FROM payment_links WHERE token=?', [token])
  if (!l) { fail(res, 404, 'This payment link is not valid.'); return null }
  return l
}
const linkExpired = (l) => l.expires_at && new Date(l.expires_at).getTime() < Date.now()

async function enabledGateways(schoolId) {
  const [rows] = await pool.query('SELECT provider FROM school_payment_gateways WHERE school_id=? AND is_enabled=1', [schoolId])
  const out = []
  for (const p of ORDER) {
    if (!rows.some((r) => r.provider === p)) continue
    const g = await loadGateway(schoolId, p)
    if (g?.enabled) out.push({ provider: p, label: PROVIDERS[p].label, mode: g.mode })
  }
  return out
}

exports.publicLink = async (req, res, next) => {
  try {
    if (limited(req, res)) return
    const l = await getLink(req, res); if (!l) return
    const ids = JSON.parse(l.payment_ids || '[]')
    const items = await dueRows(pool, l.school_id, l.student_id, ids)
    const [[school]] = await pool.query('SELECT * FROM schools WHERE id=?', [l.school_id])
    const [[stu]] = await pool.query('SELECT * FROM students WHERE id=?', [l.student_id])
    let status = l.status
    if (status === 'open' && !items.length) status = 'paid'
    if (status === 'open' && linkExpired(l)) status = 'expired'
    const amount = r2(items.reduce((a, b) => a + b.due, 0))
    res.json({
      status, amount, items,
      school: { name: school?.name || '', logo: school?.brand_logo_url || null },
      student: { name: stu?.name || '', class: stu?.class || '', section: stu?.section || '' },
      gateways: status === 'open' ? await enabledGateways(l.school_id) : [],
    })
  } catch (e) { next(e) }
}

exports.publicStart = async (req, res, next) => {
  try {
    if (limited(req, res, 20)) return
    const l = await getLink(req, res); if (!l) return
    if (l.status !== 'open' || linkExpired(l)) return fail(res, 400, 'This payment link is no longer open.')
    const provider = String(req.body?.provider || '')
    const P = PROVIDERS[provider]
    if (!P) return fail(res, 400, 'Choose a payment method.')
    const g = await loadGateway(l.school_id, provider)
    if (!g?.enabled) return fail(res, 400, `${P.label} is not available for this school.`)

    const ids = JSON.parse(l.payment_ids || '[]')
    const items = await dueRows(pool, l.school_id, l.student_id, ids)
    const amount = r2(items.reduce((a, b) => a + b.due, 0))
    if (amount <= 0) return fail(res, 400, 'Nothing is due on this link.')
    if (amount < 1) return fail(res, 400, 'The amount is too small to pay online.')
    await pool.query('UPDATE payment_links SET amount=? WHERE id=?', [amount, l.id])

    const [ins] = await pool.query('INSERT INTO payment_attempts (link_id, school_id, provider, amount) VALUES (?,?,?,?)', [l.id, l.school_id, provider, amount])
    const merchantOrderId = `EIQ${ins.insertId}X${crypto.randomBytes(4).toString('hex')}`
    await pool.query('UPDATE payment_attempts SET merchant_order_id=? WHERE id=?', [merchantOrderId, ins.insertId])

    const [[stu]] = await pool.query('SELECT * FROM students WHERE id=?', [l.student_id])
    const payer = { studentId: l.student_id, name: stu?.parent_name || stu?.name, phone: stu?.parent_phone, email: stu?.parent_email }
    const returnUrl = `${clientBase()}/pay/${l.token}?attempt=${merchantOrderId}`
    const notifyUrl = `${apiBase()}/api/payments/webhook/${provider}`
    try {
      const o = await P.createOrder({ creds: g.creds, mode: g.mode, attempt: { id: ins.insertId, linkId: l.id, merchantOrderId, amount }, payer, returnUrl, notifyUrl,
        description: `School fees – ${stu?.name || ''}` })
      await pool.query('UPDATE payment_attempts SET provider_order_id=? WHERE id=?', [o.providerOrderId, ins.insertId])
      res.json({ attempt: merchantOrderId, amount, test_mode: g.mode === 'test', ...o.client, return_url: returnUrl })
    } catch (e) {
      await pool.query(`UPDATE payment_attempts SET status='failed', error=? WHERE id=?`, [String(e.message).slice(0, 500), ins.insertId])
      console.error('[payments] createOrder failed:', provider, e.message)
      fail(res, 502, `${P.label} could not start the payment. Please try another method or contact the school.`)
    }
  } catch (e) { next(e) }
}

/* Razorpay returns three values to the page; the signature proves the payment. */
exports.publicRazorpayVerify = async (req, res, next) => {
  try {
    if (limited(req, res, 20)) return
    const l = await getLink(req, res); if (!l) return
    const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body || {}
    if (!oid || !pid || !sig) return fail(res, 400, 'Missing payment details.')
    const [[a]] = await pool.query(`SELECT * FROM payment_attempts WHERE provider='razorpay' AND provider_order_id=? AND link_id=?`, [oid, l.id])
    if (!a) return fail(res, 404, 'Payment not found.')
    const g = await loadGateway(a.school_id, 'razorpay')
    if (!g?.creds) return fail(res, 400, 'Razorpay is not set up.')
    if (!PROVIDERS.razorpay.verifyCheckout(g.creds, oid, pid, sig)) return fail(res, 400, 'Payment could not be verified.')
    await markPaid(a.id, pid)
    res.json({ status: 'paid' })
  } catch (e) { next(e) }
}

/* The pay page calls this when the parent comes back from the gateway (or taps "check again"). */
exports.publicStatus = async (req, res, next) => {
  try {
    if (limited(req, res, 60)) return
    const l = await getLink(req, res); if (!l) return
    const [pend] = await pool.query(`SELECT * FROM payment_attempts WHERE link_id=? AND status='created' AND created_at > DATE_SUB(NOW(), INTERVAL 2 DAY) ORDER BY id DESC LIMIT 5`, [l.id])
    let last = 'pending'
    for (const a of pend) {
      const g = await loadGateway(a.school_id, a.provider)
      if (!g?.creds) continue
      try { const s = await settleAttempt(a, g); if (s === 'paid') { last = 'paid'; break } if (s === 'failed') last = 'failed' } catch (e) { console.error('[payments] status check failed:', a.provider, e.message) }
    }
    const [[fresh]] = await pool.query('SELECT status, paid_at FROM payment_links WHERE id=?', [l.id])
    const [[anyPaid]] = await pool.query(`SELECT COUNT(*) n FROM payment_attempts WHERE link_id=? AND status='paid'`, [l.id])
    const paid = last === 'paid' || fresh.status === 'paid' || anyPaid.n > 0
    res.json({ status: paid ? 'paid' : last, link_status: fresh.status })
  } catch (e) { next(e) }
}

/* ═══════════════ GATEWAY WEBHOOKS (public, but verified) ═══════════════ */
exports.webhook = async (req, res) => {
  try {
    const provider = req.params.provider, P = PROVIDERS[provider]
    if (!P) return res.status(404).json({ ok: false })
    const ref = P.webhookRef(req.body || {})
    let a = null
    if (ref.merchantOrderId) [[a]] = await pool.query('SELECT * FROM payment_attempts WHERE provider=? AND merchant_order_id=?', [provider, ref.merchantOrderId])
    if (!a && ref.providerOrderId) [[a]] = await pool.query('SELECT * FROM payment_attempts WHERE provider=? AND provider_order_id=?', [provider, ref.providerOrderId])
    if (!a) return res.json({ ok: true })                          // not ours / test ping — acknowledge
    const g = await loadGateway(a.school_id, provider)
    if (!g?.creds) return res.json({ ok: true })
    if (!P.verifyWebhook(req, g.creds, g.mode)) { console.warn('[payments] webhook signature mismatch', provider); return res.status(401).json({ ok: false }) }
    await settleAttempt(a, g)
    res.json({ ok: true })
  } catch (e) {
    console.error('[payments] webhook error:', e.message)
    res.status(500).json({ ok: false })                            // gateway will retry
  }
}
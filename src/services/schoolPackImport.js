/**
 * EnrollIQ — import a full "school pack" (students, parents, class history, fees, leads) into ONE existing school.
 * Save as:  backend/src/services/schoolPackImport.js
 * Used by the Super Admin → Data tools → "Full school pack" tab (routes/superadminPack.js).
 * Same rules as the command-line script src/db/import_synthetic_school.js: safe to re-run, nothing is overwritten.
 */
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { pool } = require('../db/pool')

const BATCH = 1000
const REQUIRED_FILES = ['students.csv', 'guardians.csv', 'student_enrollments.csv', 'fee_transactions.csv', 'admission_leads.csv', 'academic_years.csv', 'branches.csv']
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)

function splitLine(line) {
  if (!line.includes('"')) return line.split(',')
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out
}
const gradeName = (g) => 'Grade ' + String(g).trim()
const labelFor = (s) => (s >= 75 ? 'Hot' : s >= 55 ? 'Warm' : 'Cold')
const leadStatus = (s) => ({ Admitted: 'Admission', Lost: 'Lost', New: 'New', Contacted: 'Contacted', Visited: 'Campus Visit', 'Visit Scheduled': 'Campus Visit', Application: 'Campus Visit' }[s] || 'New')
function yearNameOf(dateStr) {                                   // June 1 starts a school year: 2026-06-15 → "2026-27"
  const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7))
  const s = m >= 6 ? y : y - 1
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`
}

/** options: { dataDir, schoolId, branch='ALL', history=false, skip=[], dry=false, log, onProgress } → summary */
async function runPackImport(o) {
  const DATA = o.dataDir, SCHOOL_ID = Number(o.schoolId), BRANCH = String(o.branch || 'ALL').toUpperCase()
  const HISTORY = !!o.history, DRY = !!o.dry, SKIP = new Set(o.skip || [])
  const log = o.log || (() => {}), progress = o.onProgress || (() => {})
  const TODAY = todayIST()
  const fail = (m) => { throw new Error(m) }

  async function* rows(file) {
    const p = path.join(DATA, file)
    if (!fs.existsSync(p)) fail(`${file} was not uploaded.`)
    const rl = readline.createInterface({ input: fs.createReadStream(p, { encoding: 'utf8' }), crlfDelay: Infinity })
    let head = null
    for await (const line of rl) {
      if (head === null) { head = splitLine(line.replace(/^﻿/, '')).map(s => s.trim()); continue }
      if (!line) continue
      const f = splitLine(line); const r = {}
      for (let i = 0; i < head.length; i++) r[head[i]] = f[i] === undefined ? '' : f[i].trim()
      yield r
    }
  }
  const readAll = async (file) => { const a = []; for await (const r of rows(file)) a.push(r); return a }
  const colsCache = {}
  async function cols(table) {
    if (!colsCache[table]) {
      const [r] = await pool.query('SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table])
      colsCache[table] = new Set(r.map(x => x.c))
    }
    return colsCache[table]
  }
  async function insertBatches(table, columns, data, label) {
    let n = 0
    for (let i = 0; i < data.length; i += BATCH) {
      const chunk = data.slice(i, i + BATCH)
      await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ?`, [chunk])
      n += chunk.length
      progress({ label, done: n, total: data.length })
    }
    return n
  }

  if (!fs.existsSync(path.join(DATA, 'students.csv'))) fail('students.csv was not uploaded.')
  const [[sc]] = await pool.query('SELECT id, name FROM schools WHERE id=?', [SCHOOL_ID])
  if (!sc) fail(`School ${SCHOOL_ID} does not exist.`)
  const [[cnt]] = await pool.query('SELECT COUNT(*) n FROM students WHERE school_id=?', [SCHOOL_ID])
  if (cnt.n > 0 && !o.allowNonEmpty) fail(`"${sc.name}" already has ${cnt.n} students. To avoid mixing this data with real records, import the pack into a school that has no students yet.`)
  log(`🏫  Target school: "${sc.name}" (id ${SCHOOL_ID})  ·  branch scope: ${BRANCH}  ·  ${HISTORY ? 'all years' : 'current year only'}  ·  ${DRY ? 'PREVIEW (nothing is written)' : 'LIVE IMPORT'}`)

  const sCols = await cols('students'), pCols = await cols('payments'), lCols = await cols('leads')
  const eCols = await cols('student_enrollments'), yCols = await cols('academic_years')
  if (!sCols.size || !yCols.size || !eCols.size) fail('Tables students / academic_years / student_enrollments are missing on the server — run the academic-year migration first.')

  const branches = Object.fromEntries((await readAll('branches.csv')).map(b => [b.branch_id, b]))
  const years = await readAll('academic_years.csv')
  if (!years.length) fail('academic_years.csv has no rows.')
  const activeY = years.find(y => y.status === 'ACTIVE') || years[years.length - 1]
  const inBranch = (b) => BRANCH === 'ALL' || b === BRANCH
  if (BRANCH !== 'ALL' && !branches[BRANCH]) fail(`Unknown branch ${BRANCH}. Use one of: ${Object.keys(branches).join(', ')} or ALL.`)

  progress({ label: 'reading students' })
  const curEnr = new Map()
  for await (const e of rows('student_enrollments.csv'))
    if (e.academic_year_id === activeY.academic_year_id && e.status === 'ACTIVE' && inBranch(e.branch_id)) curEnr.set(e.student_id, e)
  if (!curEnr.size) fail('No active students found for that branch.')
  const stu = new Map()
  for await (const s of rows('students.csv')) if (curEnr.has(s.student_id)) stu.set(s.student_id, s)
  const guard = new Map()
  for await (const g of rows('guardians.csv')) if (stu.has(g.student_id)) guard.set(g.student_id, g)
  log(`🔎  Found ${stu.size.toLocaleString()} active students${BRANCH === 'ALL' ? ' across ' + new Set([...curEnr.values()].map(e => e.branch_id)).size + ' branches' : ' in ' + branches[BRANCH].branch_name}`)

  const [dbYears] = await pool.query('SELECT * FROM academic_years')
  const yearIdByName = new Map(dbYears.map(y => [y.name, y.id]))
  const dbActive = dbYears.find(y => y.is_active)
  const ayName = new Map(years.map(y => [y.academic_year_id, y.name]))
  async function ensureYear(name) {
    if (yearIdByName.has(name)) return yearIdByName.get(name)
    const y = years.find(z => z.name === name)
    if (DRY) { yearIdByName.set(name, -1); return -1 }
    const k = ['name'], v = [name]
    const startYear = Number(name.slice(0, 4))
    if (yCols.has('start_date')) { k.push('start_date'); v.push(y ? y.start_date : `${startYear}-06-01`) }
    if (yCols.has('end_date')) { k.push('end_date'); v.push(y ? y.end_date : `${startYear + 1}-04-30`) }
    if (yCols.has('is_active')) { k.push('is_active'); v.push(0) }
    if (yCols.has('is_closed')) { k.push('is_closed'); v.push(name === ayName.get(activeY.academic_year_id) ? 0 : 1) }
    const [r] = await pool.query(`INSERT INTO academic_years (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, v)
    yearIdByName.set(name, r.insertId); return r.insertId
  }
  const curName = ayName.get(activeY.academic_year_id)
  await ensureYear(curName)
  if (dbActive && dbActive.name !== curName)
    log(`⚠   The website's ACTIVE academic year is ${dbActive.name}, but the data's current year is ${curName}. Students import fine, but pages that filter by the active year will show them only after you switch the active year to ${curName}.`)

  const summary = {}
  const [exist] = await pool.query('SELECT id, roll_number FROM students WHERE school_id=?', [SCHOOL_ID])
  const idByAdm = new Map(exist.map(x => [x.roll_number, x.id]))
  const newStu = []
  for (const [sid, s] of stu) {
    if (idByAdm.has(s.admission_no)) continue
    const e = curEnr.get(sid), g = guard.get(sid) || {}
    newStu.push({ school_id: SCHOOL_ID, roll_number: s.admission_no, name: `${s.first_name} ${s.last_name}`.trim(), class: gradeName(e.grade), section: e.section,
      dob: s.dob || null, parent_name: g.guardian_name || null, parent_phone: g.phone || null, parent_email: g.email || null,
      area: g.city || branches[e.branch_id]?.city || null, status: 'Active', created_at: `${s.admission_year}-06-01 09:00:00` })
  }
  const sKeys = ['school_id', 'roll_number', 'name', 'class', 'section', 'dob', 'parent_name', 'parent_phone', 'parent_email', 'area', 'status', 'created_at'].filter(k => sCols.has(k))
  summary.students = { new: newStu.length, skipped: stu.size - newStu.length }
  log(`👩‍🎓  Students: ${newStu.length.toLocaleString()} to add, ${summary.students.skipped.toLocaleString()} already there`)
  if (!DRY && newStu.length) await insertBatches('students', sKeys, newStu.map(r => sKeys.map(k => r[k])), 'students')

  if (!DRY) { const [all] = await pool.query('SELECT id, roll_number FROM students WHERE school_id=?', [SCHOOL_ID]); all.forEach(x => idByAdm.set(x.roll_number, x.id)) }
  const dbId = (sid) => idByAdm.get(stu.get(sid)?.admission_no)
  const wantYear = (ayId) => HISTORY || ayId === activeY.academic_year_id

  if (!SKIP.has('enrollments')) {
    progress({ label: 'reading class history' })
    const enrRows = []
    for await (const e of rows('student_enrollments.csv')) { if (stu.has(e.student_id) && wantYear(e.academic_year_id)) enrRows.push(e) }
    const yIds = {}; for (const ay of new Set(enrRows.map(e => e.academic_year_id))) yIds[ay] = await ensureYear(ayName.get(ay))
    let have = new Set()
    if (!DRY) { const [h] = await pool.query('SELECT student_id, academic_year_id FROM student_enrollments WHERE student_id IN (SELECT id FROM students WHERE school_id=?)', [SCHOOL_ID]); have = new Set(h.map(x => x.student_id + ':' + x.academic_year_id)) }
    const eKeys = ['student_id', 'academic_year_id', 'class', 'section', 'roll_number', 'status'].filter(k => eCols.has(k))
    const out = []
    for (const e of enrRows) {
      const id = dbId(e.student_id); if (!id && !DRY) continue
      if (have.has(id + ':' + yIds[e.academic_year_id])) continue
      const rec = { student_id: id, academic_year_id: yIds[e.academic_year_id], class: gradeName(e.grade), section: e.section, roll_number: e.roll_no, status: e.status === 'ACTIVE' ? 'Active' : 'Promoted' }
      out.push(eKeys.map(k => rec[k]))
    }
    summary.enrollments = out.length
    log(`📚  Class history rows: ${out.length.toLocaleString()} to add`)
    if (!DRY && out.length) await insertBatches('student_enrollments', eKeys, out, 'class history')
  }

  if (!SKIP.has('fees')) {
    progress({ label: 'reading fees' })
    const have = new Set()
    if (!DRY && pCols.has('reference_no')) { const [h] = await pool.query('SELECT reference_no FROM payments WHERE school_id=? AND reference_no LIKE ?', [SCHOOL_ID, 'FEE%']); h.forEach(x => have.add(x.reference_no)) }
    const pKeys = ['school_id', 'student_id', 'fee_type', 'amount', 'paid_amount', 'due_date', 'paid_date', 'payment_mode', 'status', 'reference_no', 'academic_year_id'].filter(k => pCols.has(k))
    let buf = [], total = 0, paid = 0, pending = 0, skipped = 0, written = 0
    const flush = async () => { if (buf.length && !DRY) { await insertBatches('payments', pKeys, buf, 'fees'); written += buf.length; progress({ label: 'fees', done: written }) } buf = [] }
    const yCache = {}
    for await (const f of rows('fee_transactions.csv')) {
      if (!stu.has(f.student_id) || !wantYear(f.academic_year_id)) continue
      if (have.has(f.fee_txn_id)) { skipped++; continue }
      const id = dbId(f.student_id); if (!id && !DRY) continue
      const amt = Number(f.amount_paid)
      const isPaid = f.payment_date && f.payment_date <= TODAY
      const ayId = yCache[f.academic_year_id] ??= await ensureYear(ayName.get(f.academic_year_id))
      const rec = { school_id: SCHOOL_ID, student_id: id, fee_type: `Tuition Fee – Instalment ${f.installment_no}`, amount: amt, paid_amount: isPaid ? amt : 0,
                    due_date: f.payment_date || null, paid_date: isPaid ? f.payment_date : null, payment_mode: isPaid ? f.payment_mode : null,
                    status: isPaid ? 'Paid' : 'Pending', reference_no: f.fee_txn_id, academic_year_id: ayId }
      isPaid ? paid++ : pending++; total++
      buf.push(pKeys.map(k => rec[k]))
      if (buf.length >= BATCH * 5) await flush()
    }
    await flush()
    summary.fees = { total, paid, pending, skipped }
    log(`💰  Fee instalments: ${total.toLocaleString()} to add  (${paid.toLocaleString()} paid, ${pending.toLocaleString()} still due because their date is in the future)${skipped ? `, ${skipped.toLocaleString()} already there` : ''}`)
  }

  if (!SKIP.has('leads')) {
    progress({ label: 'reading leads' })
    const have = new Set()
    if (!DRY) { const [h] = await pool.query("SELECT notes FROM leads WHERE school_id=? AND notes LIKE 'Imported LEAD%'", [SCHOOL_ID]); h.forEach(x => have.add(x.notes.replace('Imported ', ''))) }
    const lKeys = ['school_id', 'parent_name', 'phone', 'child_grade', 'area', 'lead_source', 'notes', 'status', 'ai_score', 'ai_label', 'is_duplicate', 'created_at', 'academic_year_id'].filter(k => lCols.has(k))
    const out = []; let old = 0, skipped = 0
    for await (const l of rows('admission_leads.csv')) {
      if (!inBranch(l.branch_id)) continue
      const yn = yearNameOf(l.created_date)
      if (!HISTORY && !yearIdByName.has(yn)) { old++; continue }
      if (have.has(l.lead_id)) { skipped++; continue }
      const s = Number(l.ai_score) || 0
      const rec = { school_id: SCHOOL_ID, parent_name: l.prospect_name, phone: l.phone, child_grade: gradeName(l.grade_interested), area: branches[l.branch_id]?.city || null,
                    lead_source: l.source, notes: 'Imported ' + l.lead_id, status: leadStatus(l.status), ai_score: s, ai_label: labelFor(s), is_duplicate: 0,
                    created_at: l.created_date + ' 10:00:00', academic_year_id: await ensureYear(yn) }
      out.push(lKeys.map(k => rec[k]))
    }
    summary.leads = { new: out.length, older_years_skipped: old, skipped }
    log(`📣  Leads: ${out.length.toLocaleString()} to add${old ? `, ${old.toLocaleString()} from older years left out (tick "include past years" to add them)` : ''}${skipped ? `, ${skipped.toLocaleString()} already there` : ''}`)
    if (!lCols.has('academic_year_id')) log('⚠   leads has no academic_year_id column — run the leads-year migration, otherwise the Leads page may not show them.')
    if (!DRY && out.length) await insertBatches('leads', lKeys, out, 'leads')
  }

  log(DRY ? '\n👀  Preview finished — nothing was written.' : '\n✅  Import finished.')
  log('Not imported: monthly attendance, exam marks, staff, transport routes, message logs (they do not match the current tables).')
  return summary
}

module.exports = { runPackImport, REQUIRED_FILES }
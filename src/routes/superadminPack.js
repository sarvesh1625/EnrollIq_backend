/**
 * EnrollIQ — Super Admin only: upload a full school pack in pieces and import it in the background.
 * Save as:  backend/src/routes/superadminPack.js
 * Mounted by superadminData.js at  /api/superadmin/data/pack  (already behind the Super Admin check).
 *
 *   POST /session                 { school_id }                       → { id, files:[…names needed] }
 *   POST /:id/chunk?name=&offset= raw bytes (≤ 1 MB)                  → { size }       (resumable: send the same offset again after a failure)
 *   POST /:id/run                 { mode:'preview'|'import', branch, history, skip, sizes:{name:bytes} }
 *   GET  /:id/status                                                  → { state, log, progress, summary, error }
 *   DELETE /:id                   remove the uploaded files
 */
const router = require('express').Router()
const express = require('express')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pool } = require('../db/pool')
const { runPackImport, REQUIRED_FILES } = require('../services/schoolPackImport')

const ROOT = path.join(os.tmpdir(), 'enrolliq-pack')
const MAX_FILE = 400 * 1024 * 1024
const MAX_AGE = 12 * 3600e3
const sessions = new Map()          // id -> { dir, schoolId, created, state, log, progress, summary, error }
let running = null                  // id of the import that is running right now (only one at a time)

const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ } }
function sweep() {
  const now = Date.now()
  for (const [id, s] of sessions) if (now - s.created > MAX_AGE && running !== id) { rm(s.dir); sessions.delete(id) }
  try { for (const d of fs.readdirSync(ROOT)) { const p = path.join(ROOT, d); if (!sessions.has(d) && now - fs.statSync(p).mtimeMs > MAX_AGE) rm(p) } } catch { /* no folder yet */ }
}
const get = (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) { res.status(404).json({ message: 'Upload session not found (it may have expired). Start again.' }); return null }
  return s
}

router.post('/session', async (req, res, next) => {
  try {
    sweep()
    const id = Number(req.body?.school_id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Choose a school first.' })
    const [[sc]] = await pool.query('SELECT id, name FROM schools WHERE id=?', [id])
    if (!sc) return res.status(404).json({ message: 'School not found.' })
    const sid = crypto.randomBytes(8).toString('hex'), dir = path.join(ROOT, sid)
    fs.mkdirSync(dir, { recursive: true })
    sessions.set(sid, { dir, schoolId: sc.id, created: Date.now(), state: 'uploading', log: [], progress: null, summary: null, error: null })
    res.status(201).json({ id: sid, files: REQUIRED_FILES, school: sc.name })
  } catch (e) { next(e) }
})

router.post('/:id/chunk', express.raw({ type: 'application/octet-stream', limit: '3mb' }), (req, res) => {
  const s = get(req, res); if (!s) return
  if (s.state === 'running') return res.status(409).json({ message: 'An import is running for this upload.' })
  const name = String(req.query.name || ''), offset = Number(req.query.offset)
  if (!REQUIRED_FILES.includes(name)) return res.status(400).json({ message: `Unexpected file "${name}".` })
  if (!Number.isInteger(offset) || offset < 0) return res.status(400).json({ message: 'offset is required.' })
  const body = req.body
  if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ message: 'Empty chunk.' })
  const file = path.join(s.dir, name)
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0
  if (offset === 0 && size > 0 && size !== body.length) { fs.writeFileSync(file, body); return res.json({ size: body.length }) }   // a fresh upload of the same file restarts it
  if (offset + body.length === size) return res.json({ size })                  // this chunk was already stored (the reply got lost) — fine
  if (offset !== size) return res.status(409).json({ message: 'Chunk out of order.', size })
  if (size + body.length > MAX_FILE) return res.status(413).json({ message: `${name} is larger than ${MAX_FILE / 1048576} MB.` })
  fs.appendFileSync(file, body)
  s.state = 'uploading'
  res.json({ size: size + body.length })
})

router.post('/:id/run', async (req, res) => {
  const s = get(req, res); if (!s) return
  if (running) return res.status(409).json({ message: 'Another import is already running. Wait for it to finish.' })
  const { mode, branch, history, skip, sizes } = req.body || {}
  if (!['preview', 'import'].includes(mode)) return res.status(400).json({ message: 'mode must be preview or import.' })
  const missing = []
  for (const f of REQUIRED_FILES) {
    const p = path.join(s.dir, f)
    const have = fs.existsSync(p) ? fs.statSync(p).size : -1
    if (have < 0) missing.push(f)
    else if (sizes && sizes[f] !== undefined && Number(sizes[f]) !== have) missing.push(`${f} (upload incomplete)`)
  }
  if (missing.length) return res.status(400).json({ message: `Not ready: ${missing.join(', ')}` })
  if (s.state === 'done' && s.mode === 'import') return res.status(409).json({ message: 'This pack was already imported. Start a new upload to import again.' })
  s.state = 'running'; s.mode = mode; s.log = []; s.progress = null; s.summary = null; s.error = null
  running = req.params.id
  res.status(202).json({ started: true })
  runPackImport({
    dataDir: s.dir, schoolId: s.schoolId, branch, history: !!history, skip: Array.isArray(skip) ? skip : [], dry: mode === 'preview',
    log: (m) => s.log.push(String(m)), onProgress: (p) => { s.progress = p },
  }).then(sum => { s.summary = sum; s.state = 'done'; if (mode === 'import') setTimeout(() => { rm(s.dir) }, 30 * 60e3).unref() })
    .catch(e => { s.error = e.message || String(e); s.state = 'error' })
    .finally(() => { running = null; s.progress = null })
})

router.get('/:id/status', (req, res) => {
  const s = get(req, res); if (!s) return
  const files = {}
  for (const f of REQUIRED_FILES) { const p = path.join(s.dir, f); if (fs.existsSync(p)) files[f] = fs.statSync(p).size }
  res.json({ state: s.state, mode: s.mode || null, files, log: s.log.slice(-60), progress: s.progress, summary: s.summary, error: s.error })
})

router.delete('/:id', (req, res) => {
  const s = sessions.get(req.params.id)
  if (s && running !== req.params.id) { rm(s.dir); sessions.delete(req.params.id) }
  res.json({ ok: true })
})

module.exports = router
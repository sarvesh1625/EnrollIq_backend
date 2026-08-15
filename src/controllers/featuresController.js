/**
 * EnrollIQ — Feature gating controller
 * Save as:  src/controllers/featuresController.js
 *
 * Resolves which features a school has: plan defaults, then per-school
 * overrides (override wins). Admin-side reads its own; super admin manages any.
 */
const { pool } = require('../db/pool')

const FEATURES = ['ai_assistant', 'ai_exam_system', 'daily_diary']
const PLAN_DEFAULTS = {
  basic:      { ai_assistant: false, ai_exam_system: false, daily_diary: false },
  premium:    { ai_assistant: true,  ai_exam_system: false, daily_diary: true  },
  enterprise: { ai_assistant: true,  ai_exam_system: true,  daily_diary: true  },
}

// core resolver — returns { ai_assistant: true/false, ai_exam_system: ... }
async function resolveFeatures(schoolId) {
  const [[school]] = await pool.query('SELECT subscription_plan AS plan FROM schools WHERE id=?', [schoolId])
  const plan = (school?.plan || 'basic').toLowerCase()
  const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.basic

  const result = { ...defaults }
  // apply overrides
  const [overrides] = await pool.query(
    'SELECT feature_key, enabled FROM school_features WHERE school_id=?', [schoolId])
  for (const o of overrides) {
    if (FEATURES.includes(o.feature_key)) result[o.feature_key] = !!o.enabled
  }
  return { plan, features: result }
}

// GET /api/features/mine  — admin: what does MY school have?
async function myFeatures(req, res, next) {
  try {
    const r = await resolveFeatures(req.user.school_id)
    res.json(r)
  } catch (e) { next(e) }
}

// GET /api/features/school/:id  — super admin: any school
async function schoolFeatures(req, res, next) {
  try {
    const r = await resolveFeatures(req.params.id)
    const [[school]] = await pool.query('SELECT id, name, subscription_plan AS plan FROM schools WHERE id=?', [req.params.id])
    res.json({ school, ...r, all_features: FEATURES, plan_defaults: PLAN_DEFAULTS })
  } catch (e) { next(e) }
}

// PUT /api/features/school/:id/plan  — super admin: set a school's plan
async function setPlan(req, res, next) {
  try {
    const { plan } = req.body
    if (!PLAN_DEFAULTS[String(plan).toLowerCase()])
      return res.status(400).json({ message: 'Invalid plan. Use basic, premium, or enterprise.' })
    await pool.execute('UPDATE schools SET subscription_plan=? WHERE id=?', [String(plan).toLowerCase(), req.params.id])
    const r = await resolveFeatures(req.params.id)
    res.json({ success: true, ...r })
  } catch (e) { next(e) }
}

// PUT /api/features/school/:id/override  — super admin: toggle one feature for a school
// body: { feature_key, enabled }   enabled=null clears the override (revert to plan default)
async function setOverride(req, res, next) {
  try {
    const { feature_key, enabled } = req.body
    if (!FEATURES.includes(feature_key))
      return res.status(400).json({ message: 'Unknown feature' })

    if (enabled === null || enabled === undefined) {
      // clear override → revert to plan default
      await pool.execute('DELETE FROM school_features WHERE school_id=? AND feature_key=?',
        [req.params.id, feature_key])
    } else {
      await pool.execute(
        `INSERT INTO school_features (school_id, feature_key, enabled) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)`,
        [req.params.id, feature_key, enabled ? 1 : 0])
    }
    const r = await resolveFeatures(req.params.id)
    res.json({ success: true, ...r })
  } catch (e) { next(e) }
}

module.exports = { resolveFeatures, myFeatures, schoolFeatures, setPlan, setOverride, FEATURES, PLAN_DEFAULTS }
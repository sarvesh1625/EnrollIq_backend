/**
 * EnrollIQ — Demo request controller (public landing-page form → sales lead)
 * Save as:  src/controllers/demoRequestController.js
 */
const { pool } = require('../db/pool')

// POST /api/demo-request  (PUBLIC — no auth)
async function createDemoRequest(req, res, next) {
  try {
    const { name, institution, designation, mobile, work_email, institution_type } = req.body
    if (!name || !institution || !mobile)
      return res.status(400).json({ message: 'Name, institution and mobile are required.' })

    await pool.execute(
      `INSERT INTO demo_requests (name, institution, designation, mobile, work_email, institution_type)
       VALUES (?,?,?,?,?,?)`,
      [name, institution, designation || null, mobile, work_email || null, institution_type || null])

    res.status(201).json({ message: "Thanks! Our team will reach out to schedule your demo shortly." })
  } catch (err) { next(err) }
}

// GET /api/demo-request  (super admin — view demo requests)
async function listDemoRequests(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM demo_requests ORDER BY created_at DESC LIMIT 200')
    res.json({ requests: rows })
  } catch (err) { next(err) }
}

module.exports = { createDemoRequest, listDemoRequests }
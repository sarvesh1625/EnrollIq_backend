const router  = require('express').Router()
const { protect } = require('../middleware/auth')
const { pool }    = require('../db/pool')
const whatsapp    = require('../services/whatsapp')

router.get('/webhook',  whatsapp.verifyWebhook)
router.post('/webhook', whatsapp.handleWebhook)

router.post('/send', protect, async (req, res, next) => {
  try {
    const { phone, message, lead_id, student_id, recipient_name } = req.body
    if (!phone || !message) return res.status(400).json({ message: 'phone and message are required' })
    const result = await whatsapp.sendText(phone, message)
    const status = result.success ? 'Sent' : 'Failed'
    await pool.execute(
      `INSERT INTO messages (school_id, sent_by, lead_id, student_id, recipient_name, recipient_phone, channel, body, status)
       VALUES (?, ?, ?, ?, ?, ?, 'WhatsApp', ?, ?)`,
      [req.user.school_id, req.user.id, lead_id||null, student_id||null, recipient_name||'', phone, message, status]
    )
    res.json({ success: result.success, status })
  } catch (err) { next(err) }
})

router.post('/send-lead-welcome', protect, async (req, res, next) => {
  try {
    const { lead_id } = req.body
    const [leads] = await pool.execute('SELECT * FROM leads WHERE id = ? AND school_id = ?', [lead_id, req.user.school_id])
    if (!leads.length) return res.status(404).json({ message: 'Lead not found' })
    const [schools] = await pool.execute('SELECT name FROM schools WHERE id = ?', [req.user.school_id])
    const result = await whatsapp.sendLeadWelcome(leads[0].phone, leads[0].parent_name, schools[0]?.name || 'Our School')
    await pool.execute('INSERT INTO lead_interactions (lead_id, user_id, type, notes) VALUES (?, ?, ?, ?)',
      [lead_id, req.user.id, 'WhatsApp', `Welcome message ${result.success ? 'sent' : 'failed'}`])
    res.json({ success: result.success })
  } catch (err) { next(err) }
})

router.post('/send-fee-reminder', protect, async (req, res, next) => {
  try {
    const { payment_id } = req.body
    const [payments] = await pool.execute(
      `SELECT p.*, s.name AS student_name, s.parent_name, s.parent_phone
       FROM payments p JOIN students s ON s.id = p.student_id
       WHERE p.id = ? AND p.school_id = ?`,
      [payment_id, req.user.school_id]
    )
    if (!payments.length) return res.status(404).json({ message: 'Payment not found' })
    const pay = payments[0]
    const due = new Date(pay.due_date).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
    const result = await whatsapp.sendFeeReminder(pay.parent_phone, pay.parent_name, pay.student_name, pay.amount - pay.paid_amount, due)
    res.json({ success: result.success })
  } catch (err) { next(err) }
})

module.exports = router
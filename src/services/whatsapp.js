/**
 * whatsapp.js — WhatsApp Business API (Meta Cloud API)
 *
 * Setup:
 *  1. Go to https://developers.facebook.com → My Apps → Create App → Business
 *  2. Add "WhatsApp" product
 *  3. Get Phone Number ID and Temp Access Token from the dashboard
 *  4. Set these in your .env:
 *       WHATSAPP_TOKEN=your_access_token
 *       WHATSAPP_PHONE_ID=your_phone_number_id
 *       WHATSAPP_VERIFY_TOKEN=any_random_string_you_choose
 *
 * Message types supported:
 *   - sendText(to, message)        → plain text message
 *   - sendTemplate(to, template)   → pre-approved template message
 */

require('dotenv').config()
const axios = require('axios')

const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const TOKEN    = process.env.WHATSAPP_TOKEN
const BASE_URL = `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`

// ── Sanitize phone number → must be 91XXXXXXXXXX format ─────────────────────
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.length === 10) return `91${digits}`
  return digits
}

// ── Send plain text message ───────────────────────────────────────────────────
async function sendText(to, message) {
  if (!TOKEN || !PHONE_ID) {
    console.warn('⚠️  WhatsApp not configured — set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env')
    return { success: false, reason: 'not_configured' }
  }

  try {
    const res = await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to:                formatPhone(to),
      type:              'text',
      text:              { body: message },
    }, {
      headers: {
        Authorization:  `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      }
    })

    console.log(`✅  WhatsApp sent to ${to}:`, res.data?.messages?.[0]?.id)
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err) {
    const error = err.response?.data?.error || err.message
    console.error(`❌  WhatsApp failed to ${to}:`, error)
    return { success: false, error }
  }
}

// ── Send template message (for approved templates like fee_reminder) ──────────
async function sendTemplate(to, templateName, langCode = 'en', components = []) {
  if (!TOKEN || !PHONE_ID) {
    return { success: false, reason: 'not_configured' }
  }

  try {
    const res = await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to:                formatPhone(to),
      type:              'template',
      template: {
        name:       templateName,
        language:   { code: langCode },
        components,
      }
    }, {
      headers: {
        Authorization:  `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      }
    })

    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message }
  }
}

// ── Pre-built message helpers ─────────────────────────────────────────────────

// Welcome message to new lead
async function sendLeadWelcome(phone, parentName, schoolName) {
  const msg = `Hello ${parentName}! 👋\n\nThank you for your interest in *${schoolName}*.\n\nOur admissions team will contact you within 24 hours to discuss the next steps.\n\nFor any queries, reply to this message.\n\n— ${schoolName} Admissions Team`
  return sendText(phone, msg)
}

// Fee reminder
async function sendFeeReminder(phone, parentName, studentName, amount, dueDate) {
  const msg = `Dear ${parentName},\n\nThis is a reminder that the fee of *₹${amount.toLocaleString('en-IN')}* for *${studentName}* is due on *${dueDate}*.\n\nPlease make the payment at the earliest to avoid late charges.\n\nFor assistance, contact the school office.`
  return sendText(phone, msg)
}

// Campus visit confirmation
async function sendVisitConfirmation(phone, parentName, studentName, date, time) {
  const msg = `Dear ${parentName},\n\nYour campus visit for *${studentName}* has been confirmed.\n\n📅 Date: *${date}*\n🕐 Time: *${time}*\n\nPlease bring the following documents:\n• Previous school report cards\n• Birth certificate\n• Passport size photos (2)\n\nLooking forward to meeting you!`
  return sendText(phone, msg)
}

// Admission confirmation
async function sendAdmissionConfirmed(phone, parentName, studentName, grade) {
  const msg = `Dear ${parentName},\n\nCongratulations! 🎉\n\nWe are delighted to inform you that *${studentName}* has been admitted to *${grade}*.\n\nPlease visit the school office within 3 days to complete the admission formalities.\n\nWelcome to our school family!`
  return sendText(phone, msg)
}

// ── Webhook verification (GET) ───────────────────────────────────────────────
function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅  WhatsApp webhook verified')
    return res.status(200).send(challenge)
  }
  res.status(403).json({ message: 'Webhook verification failed' })
}

// ── Webhook event handler (POST) ─────────────────────────────────────────────
function handleWebhook(req, res) {
  const body = req.body

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404)
  }

  const entry   = body.entry?.[0]
  const changes = entry?.changes?.[0]
  const value   = changes?.value

  if (value?.messages) {
    const msg    = value.messages[0]
    const from   = msg.from    // phone number
    const text   = msg.text?.body || ''
    const msgId  = msg.id

    console.log(`📱  WhatsApp message from ${from}: "${text}"`)

    // TODO: match to a lead by phone number and log the interaction
    // Example: await updateLeadFromWhatsApp(from, text)
  }

  res.sendStatus(200)
}

module.exports = {
  sendText,
  sendTemplate,
  sendLeadWelcome,
  sendFeeReminder,
  sendVisitConfirmation,
  sendAdmissionConfirmed,
  verifyWebhook,
  handleWebhook,
} 
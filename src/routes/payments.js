/**
 * EnrollIQ — online fee payments (routes)
 * Save as:  backend/src/routes/payments.js
 * Mount in server.js:  app.use('/api/payments', require('./routes/payments'))
 */
const router = require('express').Router()
const { protect } = require('../middleware/auth')
const ctrl = require('../controllers/paymentsController')

/* — public: parents open a pay link (the token is the key) — */
router.get ('/public/:token',                  ctrl.publicLink)
router.post('/public/:token/start',            ctrl.publicStart)
router.post('/public/:token/razorpay/verify',  ctrl.publicRazorpayVerify)
router.get ('/public/:token/status',           ctrl.publicStatus)

/* — public: gateways call these (each one is verified inside) — */
router.post('/webhook/:provider',              ctrl.webhook)

/* — school side: login required — */
router.use(protect)
router.get   ('/gateways',                     ctrl.listGateways)
router.put   ('/gateways/:provider',           ctrl.saveGateway)
router.patch ('/gateways/:provider/enabled',   ctrl.toggleGateway)
router.post  ('/gateways/:provider/test',      ctrl.testGateway)
router.delete('/gateways/:provider',           ctrl.deleteGateway)
router.post  ('/links',                        ctrl.createLinkRoute)
router.get   ('/transactions',                 ctrl.transactions)

module.exports = router
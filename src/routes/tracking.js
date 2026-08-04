/**
 * EnrollIQ — Live Tracking + Cameras routes
 * Save as: src/routes/tracking.js
 *
 * Wire in server.js:
 *   app.use('/api/tracking', require('./routes/tracking'))
 */
const express = require('express')
const router  = express.Router()
const ctrl    = require('../controllers/trackingController')
const { protect } = require('../middleware/auth')

// Driver device posting location + trip toggle.
// NOTE: kept open so the driver page works without a full login on a shared phone.
// To lock down later, add `protect` here and issue drivers a token.
router.post('/buses/:busId/location', ctrl.updateLocation)
router.post('/buses/:busId/trip',     ctrl.setTrip)

// Admin views (protected)
router.get('/buses',        protect, ctrl.listLiveBuses)
router.get('/buses/:busId', protect, ctrl.getBus)

// Cameras (protected)
router.get   ('/cameras',     protect, ctrl.listCameras)
router.post  ('/cameras',     protect, ctrl.createCamera)
router.put   ('/cameras/:id', protect, ctrl.updateCamera)
router.delete('/cameras/:id', protect, ctrl.deleteCamera)

module.exports = router
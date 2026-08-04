const router = require('express').Router()
const { protect } = require('../middleware/auth')
const {
  getDashboard, getBuses, createBus, updateBus,
  getRoutes, createRoute, updateRoute,
  getDrivers, createDriver, updateDriver,
  driverLogin, scanStudent,
  getAttendance, enrollStudent,
  updateBusLocation, getBusLocation,
  getNotifications, getEnrolled,
  startDropSession, getStudentsWithStops,
} = require('../controllers/transportController')

router.use(protect)

router.get('/dashboard',            getDashboard)
router.get('/buses',                getBuses)
router.post('/buses',               createBus)
router.get('/routes',               getRoutes)
router.post('/routes',              createRoute)
router.get('/drivers',              getDrivers)
router.post('/drivers',             createDriver)
router.post('/driver-login',        driverLogin)
router.post('/scan',                scanStudent)
router.get('/attendance',           getAttendance)
router.post('/enroll-student',      enrollStudent)
router.post('/bus-location',        updateBusLocation)
router.get('/bus-location/:bus_id', getBusLocation)
router.get('/notifications',        getNotifications)
router.get('/enrolled',             getEnrolled)
router.post('/start-drop', startDropSession)
router.get('/students-with-stops', getStudentsWithStops) // in driver routes
router.put('/buses/:id',   updateBus)
router.put('/routes/:id',  updateRoute)
router.put('/drivers/:id', updateDriver)
module.exports = router
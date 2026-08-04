/**
 * Global error handler — always returns JSON
 */
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} →`, err.message)

  const status  = err.status  || err.statusCode || 500
  const message = err.message || 'Internal server error'

  res.status(status).json({ message })
}

/**
 * 404 handler for unknown routes
 */
function notFound(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
}

module.exports = { errorHandler, notFound }
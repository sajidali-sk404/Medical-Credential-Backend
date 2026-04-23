// routes/admin.js
import express from 'express'
import {
  getStats,
  getAllRequests,
  getRequestByIdAdmin,
  updateStatus,
  getClients,
  getClientById,
  getTickets,
  resolveTicket,
} from '../controllers/admin.js'
import {
  verifyToken,
  requireAdmin,
} from '../middleware/auth.js'

const router = express.Router()

// ── All routes require a valid JWT + admin role ───────────────────

// Dashboard
router.get('/dashboard/stats',
  verifyToken,
  requireAdmin,
  getStats
)

// Requests
router.get('/requests',
  verifyToken,
  requireAdmin,
  getAllRequests
)

router.get('/requests/:id',
  verifyToken,
  requireAdmin,
  getRequestByIdAdmin
)

router.patch('/requests/:id/status',
  verifyToken,
  requireAdmin,
  updateStatus
)

// Clients
router.get('/clients',
  verifyToken,
  requireAdmin,
  getClients
)

router.get('/clients/:id',
  verifyToken,
  requireAdmin,
  getClientById
)

// Support tickets
router.get('/support',
  verifyToken,
  requireAdmin,
  getTickets
)

router.patch('/support/:id/resolve',
  verifyToken,
  requireAdmin,
  resolveTicket
)

export default router
// routes/requests.js
import express from 'express'
import {
  submitRequest,
  getMyRequests,
  getMyStats,
  getRequestById,
  uploadDocument,
  deleteDocument,
  submitTicket,
  getMyTickets,
  getStats,
} from '../controllers/requests.js'
import {
  verifyToken,
  requireClient,
  ownsRequest,
} from '../middleware/auth.js'
import { uploadFile, uploadImage } from "../middleware/upload.js";


const router = express.Router()

// ── All routes require a valid JWT + client role ──────────────────
// Note: /my/stats must come BEFORE /:id
// otherwise Express matches "my" as the :id param

router.get('/stats',
  getStats
)

router.get('/my/stats',
  verifyToken,
  requireClient,
  getMyStats
)

router.get('/my',
  verifyToken,
  requireClient,
  getMyRequests
)

router.post('/',
  verifyToken,
  requireClient,
  submitRequest
)

router.get('/:id',
  verifyToken,
  requireClient,
  ownsRequest,        // verifies ownership + attaches req.credRequest
  getRequestById
)

router.post('/:id/documents',
  verifyToken,
  requireClient,
  ownsRequest,
  uploadFile.single("document"),   // field name must match frontend FormData
  uploadDocument
)

router.delete('/:id/documents/:docId',
  verifyToken,
  requireClient,
  ownsRequest,
  deleteDocument
)

router.post('/support',
  verifyToken,
  requireClient,
  submitTicket
)
router.get('/support/my',
  verifyToken,
  requireClient,
  getMyTickets
)

export default router
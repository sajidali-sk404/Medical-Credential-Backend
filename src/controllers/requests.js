// controllers/requests.js
import CredentialingRequest from '../models/CredentialingRequest.js'
import Document from '../models/Document.js'
import StatusLog from '../models/StatusLog.js'
import SupportTicket from '../models/SupportTicket.js'
import { uploadToCloudinary, deleteFromCloudinary } from '../lib/cloudinary.js'

// ── Allowed status transitions (state machine) ────────────────────
const ALLOWED_TRANSITIONS = {
  pending: ['in_review'],
  in_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}
export const isValidTransition = (from, to) =>
  ALLOWED_TRANSITIONS[from]?.includes(to) ?? false


// ── POST /api/requests ────────────────────────────────────────────
// Submit a new credentialing request
export const submitRequest = async (req, res) => {
  try {
    const { provider_name, specialty, notes } = req.body

    if (!provider_name || !specialty) {
      return res.status(400).json({ message: 'provider_name and specialty are required' })
    }

    const request = await CredentialingRequest.create({
      client_id: req.clientProfile._id,
      provider_name,
      specialty,
      notes: notes ?? null,
      status: 'pending',           // always server-set, never from body
    })

    // Write the first audit log entry immediately on creation
    await StatusLog.create({
      request_id: request._id,
      changed_by: req.user._id,
      old_status: null,                  // null = this is the creation entry
      new_status: 'pending',
      note: 'Request submitted by client',
    })

    res.status(201).json(request)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── GET /api/requests/my ──────────────────────────────────────────
// All requests belonging to the logged-in client, with optional status filter
export const getMyRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query

    const filter = { client_id: req.clientProfile._id }
    if (status) filter.status = status

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [requests, total] = await Promise.all([
      CredentialingRequest.find(filter)
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      CredentialingRequest.countDocuments(filter),
    ])

    res.json({ 
      requests, 
      total, 
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── GET /api/requests/my/stats ────────────────────────────────────
// Counts for the client dashboard stat cards
// controllers/requests.js — update getMyStats
export const getMyStats = async (req, res) => {
  const now       = new Date()
  const weekAgo   = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)

  const [statusGroups, thisWeek, lastWeek] = await Promise.all([
    CredentialingRequest.aggregate([
      { $match: { client_id: req.clientProfile._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),
    CredentialingRequest.countDocuments({
      client_id: req.clientProfile._id,
      submitted_at: { $gte: weekAgo }
    }),
    CredentialingRequest.countDocuments({
      client_id: req.clientProfile._id,
      submitted_at: { $gte: twoWeeksAgo, $lt: weekAgo }
    }),
  ])

  const map = { pending: 0, in_review: 0, approved: 0, rejected: 0, total: 0 }
  statusGroups.forEach(s => { map[s._id] = s.count; map.total += s.count })

  const weeklyChange = lastWeek === 0 ? 100
    : Math.round(((thisWeek - lastWeek) / lastWeek) * 100)

  res.json({ ...map, weekly_change: weeklyChange })
}


// ── GET /api/requests/:id ─────────────────────────────────────────
// Single request + its documents + full status timeline
// ownsRequest middleware already verified ownership and attached req.credRequest
export const getRequestById = async (req, res) => {
  try {
    const [documents, statusLogs] = await Promise.all([
      Document.find({ request_id: req.credRequest._id })
        .sort({ uploaded_at: 1 }),
      StatusLog.find({ request_id: req.credRequest._id })
        .sort({ changed_at: 1 }),
    ])

    res.json({
      ...req.credRequest.toObject(),
      documents,
      status_logs: statusLogs,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── POST /api/requests/:id/documents ─────────────────────────────
// Upload a file — Multer puts it in req.file as a buffer
export const uploadDocument = async (req, res) => {
  try {
    // ── BASIC CHECKS ───────────────────────────
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" })
    }

    if (!req.credRequest) {
      return res.status(400).json({ message: "Invalid request context" })
    }

    const { mimetype, originalname, buffer } = req.file

    // ── DEBUG (VERY IMPORTANT) ─────────────────
    console.log("MIME:", mimetype)
    console.log("NAME:", originalname)

    // ── VALIDATION (FIXED) ─────────────────────
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]

    const isValidMime = allowedTypes.includes(mimetype)

    const isPdfByName = originalname
      .toLowerCase()
      .endsWith(".pdf")

    if (!isValidMime && !isPdfByName) {
      return res.status(400).json({
        message: "Invalid file type",
      })
    }

    // ── UPLOAD ─────────────────────────────────
    const result = await uploadToCloudinary({
      buffer,
      mimetype,
      originalname,
      folder: `credentialing/${req.credRequest._id}`,
    })

    // ── SAVE TO DB ─────────────────────────────
    const document = await Document.create({
      request_id: req.credRequest._id,
      file_name: originalname,
      file_url: result.url,
      file_type: mimetype || "unknown",
      public_id: result.public_id,
      file_size: result.bytes, // ✅ useful
    })

    // ── RESPONSE ───────────────────────────────
    res.status(201).json(document)

  } catch (err) {
    console.error("UPLOAD ERROR:", err)

    res.status(500).json({
      message: "Upload failed",
      error: err.message,
    })
  }
}


// ── DELETE /api/requests/:id/documents/:docId ─────────────────────
// Delete a document from both Cloudinary and MongoDB
export const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId)
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' })
    }

    // Confirm the doc belongs to this request (extra safety check)
    if (doc.request_id.toString() !== req.credRequest._id.toString()) {
      return res.status(403).json({ message: 'Access denied' })
    }

    const resourceType = doc.file_type === 'application/pdf' ? 'raw' : 'image'

    // Delete from both — if Cloudinary fails, don't delete the DB record
    await deleteFromCloudinary(doc.public_id, resourceType)
    await Document.findByIdAndDelete(doc._id)

    res.json({ message: 'Document deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: "Delete failed",
      error: err.message,
    })
  }
}


// ── POST /api/support ─────────────────────────────────────────────
// Client submits a support ticket
export const submitTicket = async (req, res) => {
  try {
    const { subject, message } = req.body

    if (!subject || !message) {
      return res.status(400).json({ message: 'subject and message are required' })
    }

    const ticket = await SupportTicket.create({
      client_id: req.clientProfile._id,
      subject,
      message,
    })

    res.status(201).json(ticket)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

// controllers/requests.js — add this function
export const getMyTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ client_id: req.clientProfile._id })
      .sort({ createdAt: -1 })
    res.json({ tickets })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error" })
  }
}

export const getStats = async (req, res) => {
  try {
    const [requestStats] = await Promise.all([
      CredentialingRequest.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
    ])
    const result = { total: 0, pending: 0, approved: 0 }
    requestStats.forEach(s => {
      result[s._id] = s.count
      result.total += s.count
    })

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}
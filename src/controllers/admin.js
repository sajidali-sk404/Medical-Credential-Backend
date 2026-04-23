// controllers/admin.js
import mongoose             from 'mongoose'
import CredentialingRequest from '../models/CredentialingRequest.js'
import Document             from '../models/Document.js'
import StatusLog            from '../models/StatusLog.js'
import SupportTicket        from '../models/SupportTicket.js'
import Client               from '../models/Client.js'
import User                 from '../models/User.js'
import { isValidTransition } from './requests.js'


// ── GET /api/admin/dashboard/stats ────────────────────────────────
// Single aggregation — one DB round trip for all stat card numbers
export const getStats = async (req, res) => {
  try {
    const now       = new Date()
    const weekAgo   = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)

    const [
      statusGroups,
      totalRequests,
      thisWeekCount,
      lastWeekCount,
      openTickets,
      criticalTickets,
    ] = await Promise.all([

      // 1. Group all requests by status
      CredentialingRequest.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),

      // 2. Total request count
      CredentialingRequest.countDocuments(),

      // 3. Requests submitted THIS week (last 7 days)
      CredentialingRequest.countDocuments({
        submitted_at: { $gte: weekAgo }
      }),

      // 4. Requests submitted LAST week (7–14 days ago)
      CredentialingRequest.countDocuments({
        submitted_at: { $gte: twoWeeksAgo, $lt: weekAgo }
      }),

      // 5. Open support tickets
      SupportTicket.countDocuments({ is_resolved: false }),

      // 6. Critical = pending for more than 72 hours
      SupportTicket.countDocuments({
        is_resolved: false,
        createdAt: { $lt: new Date(now - 72 * 60 * 60 * 1000) }
      }),

    ])

    // Build status map from aggregation
    const statusMap = { pending: 0, in_review: 0, approved: 0, rejected: 0 }
    statusGroups.forEach(s => { statusMap[s._id] = s.count })

    // ── Calculate derived stats ──────────────────────────────

    // +8% from last week
    const weeklyChange = lastWeekCount === 0
      ? 100                                           // avoid divide by zero
      : Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)

    // 75.0% approval rate = approved / (approved + rejected) * 100
    const decided      = statusMap.approved + statusMap.rejected
    const approvalRate = decided === 0
      ? 0
      : Math.round((statusMap.approved / decided) * 100 * 10) / 10  // 1 decimal

    res.json({
      total:          totalRequests,
      approved:       statusMap.approved,
      pending:        statusMap.pending,
      in_review:      statusMap.in_review,
      rejected:       statusMap.rejected,
      open_tickets:   openTickets,

      // ── Derived ─────────────────────────────────
      weekly_change:  weeklyChange,      // e.g. +8 or -3
      approval_rate:  approvalRate,      // e.g. 75.0
      critical_count: criticalTickets,   // e.g. 2
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error" })
  }
}


// ── GET /api/admin/requests ───────────────────────────────────────
// All requests with optional filters — joins client + user info
export const getAllRequests = async (req, res) => {
  try {
    const { status, client_id, page = 1, limit = 20 } = req.query

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const skip = (pageNum - 1) * limitNum

    const filter = {}
    if (status) filter.status = status
    if (client_id) filter.client_id = new mongoose.Types.ObjectId(client_id)

    const [requests, total] = await Promise.all([
      CredentialingRequest.find(filter)
        .populate({
          path: 'client_id',
          model: 'Client',
          populate: {
            path: 'user_id',
            model: 'User',
            select: 'name email'
          }
        })
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(limitNum),

      CredentialingRequest.countDocuments(filter),
    ])

    res.json({
      requests,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum), // ✅ ADD THIS
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── GET /api/admin/requests/:id ───────────────────────────────────
// Full request detail: client info + documents + status audit trail
export const getRequestByIdAdmin = async (req, res) => {
  try {
    const request = await CredentialingRequest.findById(req.params.id)
      .populate({
        path:  'client_id',
        model: 'Client',
        populate: { path: 'user_id', model: 'User', select: 'name email' }
      })

    if (!request) {
      return res.status(404).json({ message: 'Request not found' })
    }

    const [documents, statusLogs] = await Promise.all([
      Document.find({ request_id: request._id }).sort({ uploaded_at: 1 }),
      StatusLog.find({ request_id: request._id })
        .populate('changed_by', 'name role')
        .sort({ changed_at: 1 }),
    ])

    res.json({
      ...request.toObject(),
      documents,
      status_logs: statusLogs,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── PATCH /api/admin/requests/:id/status ─────────────────────────
// Update status + write audit log — uses MongoDB session for atomicity
export const updateStatus = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { status, note } = req.body
    if (!status) {
      await session.abortTransaction()
      return res.status(400).json({ message: 'status is required' })
    }

    const request = await CredentialingRequest
      .findById(req.params.id)
      .session(session)

    if (!request) {
      await session.abortTransaction()
      return res.status(404).json({ message: 'Request not found' })
    }

    // State machine check — reject illegal transitions
    if (!isValidTransition(request.status, status)) {
      await session.abortTransaction()
      return res.status(400).json({
        message: `Cannot move from "${request.status}" to "${status}"`
      })
    }

    const oldStatus = request.status
    request.status = status
    await request.save({ session })

    const logEntry = await StatusLog.create([{
      request_id: request._id,
      changed_by: req.user._id,
      old_status: oldStatus,
      new_status: status,
      note:       note ?? null,
    }], { session })

    await session.commitTransaction()

    res.json({ request, log: logEntry[0] })
  } catch (err) {
    await session.abortTransaction()
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  } finally {
    session.endSession()
  }
}


// ── GET /api/admin/clients ────────────────────────────────────────
// All clients with search + request count per client
export const getClients = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    // Build user filter for search
    const userFilter = {}
    if (search) {
      userFilter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }

    // Find matching users first, then get their client profiles
    const matchingUsers = search
      ? await User.find(userFilter).select('_id')
      : null

    const clientFilter = matchingUsers
      ? { user_id: { $in: matchingUsers.map(u => u._id) } }
      : {}

    const [clients, total] = await Promise.all([
      Client.find(clientFilter)
        .populate('user_id', 'name email created_at')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      Client.countDocuments(clientFilter),
    ])

    // Attach request counts in one aggregation
    const clientIds = clients.map(c => c._id)
    const requestCounts = await CredentialingRequest.aggregate([
      { $match: { client_id: { $in: clientIds } } },
      { $group: { _id: '$client_id', count: { $sum: 1 } } },
    ])

    const countMap = {}
    requestCounts.forEach(r => { countMap[r._id.toString()] = r.count })

    const result = clients.map(c => ({
      ...c.toObject(),
      request_count: countMap[c._id.toString()] ?? 0,
    }))

    res.json({ clients: result, total, page: parseInt(page) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── GET /api/admin/clients/:id ────────────────────────────────────
// Single client + their full request history
export const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('user_id', 'name email image created_at')

    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    const requests = await CredentialingRequest.find({ client_id: client._id })
      .sort({ submitted_at: -1 })

    res.json({ ...client.toObject(), requests })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── GET /api/admin/support ────────────────────────────────────────
// All support tickets with optional resolved filter
export const getTickets = async (req, res) => {
  try {
    const { resolved, page = 1, limit = 20 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const filter = {}
    if (resolved !== undefined) {
      filter.is_resolved = resolved === 'true'
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate({
          path:  'client_id',
          model: 'Client',
          populate: { path: 'user_id', model: 'User', select: 'name email' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SupportTicket.countDocuments(filter),
    ])

    res.json({ tickets, total, page: parseInt(page) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}


// ── PATCH /api/admin/support/:id/resolve ─────────────────────────
// Mark a support ticket as resolved
export const resolveTicket = async (req, res) => {
  try {
    const { resolution_note } = req.body

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      {
        is_resolved:     true,
        resolution_note: resolution_note ?? null,
        resolved_at:     new Date(),
      },
      { new: true }   // return the updated document
    )

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    res.json(ticket)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}
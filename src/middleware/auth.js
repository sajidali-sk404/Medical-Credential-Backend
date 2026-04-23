// middleware/auth.js
import jwt      from 'jsonwebtoken'
import User     from '../models/User.js'
import Client   from '../models/Client.js'

// ── 1. Verify JWT ─────────────────────────────────────────────────
// Reads token from httpOnly cookie OR Authorization header.
// Populates req.user with the decoded payload.
// Attaches req.clientProfile if the user is a client (needed for client_id scoping).

export const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies?.token
      || req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // decoded = { id, role, iat, exp }

    // Confirm user still exists in DB (handles deleted/banned accounts)
    const user = await User.findById(decoded.id).select('-password_hash')
    if (!user) {
      return res.status(401).json({ message: 'Account no longer exists' })
    }

    req.user = user   // full Mongoose doc — has ._id, .role, .name, .email

    // If client, attach their Client profile so controllers have client._id
    if (user.role === 'client') {
      const clientProfile = await Client.findOne({ user_id: user._id })
      if (!clientProfile) {
        return res.status(403).json({ message: 'Client profile not found' })
      }
      req.clientProfile = clientProfile   // controllers use req.clientProfile._id
    }

    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired — please log in again' })
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

// ── 2. Require admin role ─────────────────────────────────────────
// Always chain AFTER verifyToken — never use standalone.

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }
  next()
}

// ── 3. Require client role ────────────────────────────────────────
// Always chain AFTER verifyToken — never use standalone.

export const requireClient = (req, res, next) => {
  if (!req.user || req.user.role !== 'client') {
    return res.status(403).json({ message: 'Client access required' })
  }
  next()
}

// ── 4. Ownership guard ────────────────────────────────────────────
// Confirms a credentialing request actually belongs to the logged-in client.
// Use on routes like GET /api/requests/:id and POST /api/requests/:id/documents.
// Requires verifyToken + requireClient to run first.

import CredentialingRequest from '../models/CredentialingRequest.js'

export const ownsRequest = async (req, res, next) => {
  try {
    const request = await CredentialingRequest.findById(req.params.id)
    if (!request) {
      return res.status(404).json({ message: 'Request not found' })
    }
    if (request.client_id.toString() !== req.clientProfile._id.toString()) {
      return res.status(403).json({ message: 'Access denied' })
    }
    req.credRequest = request   // attach so controller doesn't need to fetch again
    next()
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
}
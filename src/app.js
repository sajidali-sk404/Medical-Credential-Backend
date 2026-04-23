// app.js
import express      from 'express'
import cookieParser from 'cookie-parser'
import cors         from 'cors'
import 'dotenv/config'

import authRoutes     from './routes/auth.js'
import requestRoutes  from './routes/requests.js'
import adminRoutes    from './routes/admin.js'

const app = express()

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,   // required for cookies to be sent cross-origin
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth',     authRoutes)
app.use('/api/requests', requestRoutes)
app.use('/api/admin',    adminRoutes)

// Global error handler — catches Multer errors and anything else
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large — max 10MB' })
  }
  if (err.message === 'Only PDF and image files are allowed') {
    return res.status(400).json({ message: err.message })
  }
  console.error(err)
  res.status(500).json({ message: 'Server error' })
})

export default app
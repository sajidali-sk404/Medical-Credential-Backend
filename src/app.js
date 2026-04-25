// app.js
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'

import authRoutes from './routes/auth.js'
import requestRoutes from './routes/requests.js'
import adminRoutes from './routes/admin.js'

const app = express()

app.set('trust proxy', 1); // 🔥 REQUIRED on Render

const corsOptions = {
  origin: process.env.FRONTEND_URL || "medical-credential-fron-git-f85636-sajid-alis-projects-0b343f64.vercel.app", // main domain
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}

app.use(cors(corsOptions))
// Handle preflight for all routes
app.options("(.*)", cors(corsOptions))

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' blob:; object-src 'none';"
  );
  next();
});

app.use(express.json())
app.use(cookieParser())



app.use('/api/auth', authRoutes)
app.use('/api/requests', requestRoutes)
app.use('/api/admin', adminRoutes)

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
// src/app.js
import express      from "express"
import cookieParser from "cookie-parser"
import cors         from "cors"

import authRoutes    from "./routes/auth.js"
import requestRoutes from "./routes/requests.js"
import adminRoutes   from "./routes/admin.js"

const app = express()

// ── CORS must be the very first middleware ─────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin",  "https://medical-credential-frontend.vercel.app")
  res.header("Access-Control-Allow-Credentials", "true")
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization")

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200)
  }
  next()
})

app.use(express.json())
app.use(cookieParser())

app.use("/api/auth",     authRoutes)
app.use("/api/requests", requestRoutes)
app.use("/api/admin",    adminRoutes)

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File too large — max 10MB" })
  }
  if (err.message === "Only PDF and image files are allowed") {
    return res.status(400).json({ message: err.message })
  }
  console.error(err)
  res.status(500).json({ message: "Server error" })
})

export default app
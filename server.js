import "dotenv/config"
import mongoose from "mongoose"
import app      from "./src/app.js"

// server.js — add at the very top
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason)
  process.exit(1)
})


const PORT = process.env.PORT || 5000

// Log env check so you can see what's missing
console.log("ENV CHECK →", {
  MONGO:      !!process.env.MONGODB_URI,
  JWT:        !!process.env.JWT_SECRET,
  CLOUDINARY: !!process.env.CLOUDINARY_CLOUD_NAME,
})

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected")
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message)
    process.exit(1)
  })
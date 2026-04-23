// server.js
import mongoose from 'mongoose'
import app      from './src/app.js'
import 'dotenv/config'

const PORT = process.env.PORT || 5000

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected')
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err)
    process.exit(1)
  })
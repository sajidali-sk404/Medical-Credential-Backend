import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['client', 'admin'], default: 'client' },
  image: { type: String, trim: true },
  image_public_id: { type: String },
}, { timestamps: true })

export default mongoose.model('User', userSchema)
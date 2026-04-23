import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  request_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'CredentialingRequest', required: true },
  file_name:   { type: String, required: true },
  file_url:    { type: String, required: true },   // Cloudinary secure_url
  file_type:   { type: String, required: true },   // MIME type
  public_id:   { type: String, required: true },   // Cloudinary public_id (needed for deletion)
  uploaded_at: { type: Date, default: Date.now },
})

export default mongoose.model('Document', documentSchema);
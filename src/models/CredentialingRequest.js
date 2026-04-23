import mongoose from "mongoose";

const requestSchema = new mongoose.Schema({
  client_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  provider_name: { type: String, required: true, trim: true },
  specialty:     { type: String, required: true, trim: true },
  status:        {
    type:    String,
    enum:    ['pending', 'in_review', 'approved', 'rejected'],
    default: 'pending'
  },
  notes:         { type: String },
  submitted_at:  { type: Date, default: Date.now },
}, { timestamps: true })

export default mongoose.model('CredentialingRequest', requestSchema);
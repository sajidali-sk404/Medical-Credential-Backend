import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema({
  client_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  subject:         { type: String, required: true, trim: true },
  message:         { type: String, required: true },
  is_resolved:     { type: Boolean, default: false },
  resolution_note: { type: String, default: null },
  resolved_at:     { type: Date, default: null },
}, { timestamps: true })

export default mongoose.model('SupportTicket', supportTicketSchema);
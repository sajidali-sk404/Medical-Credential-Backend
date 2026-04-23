import mongoose from "mongoose";

const statusLogSchema = new mongoose.Schema({
  request_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'CredentialingRequest', required: true },
  changed_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  old_status:  { type: String, default: null },   // null on first entry
  new_status:  { type: String, required: true },
  note:        { type: String },
  changed_at:  { type: Date, default: Date.now },
})

export default mongoose.model('StatusLog', statusLogSchema)
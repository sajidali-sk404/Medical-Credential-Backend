import mongoose from "mongoose";

const clientSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    company_name: { type: String, required: true, trim: true },
    phone: {type: String, trim: true, default: null},
    address: {type: String, trim: true, default: null},
}, { timestamps: true });

export default mongoose.model('Client', clientSchema);
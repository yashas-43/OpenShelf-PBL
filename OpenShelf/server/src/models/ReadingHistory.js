import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentPDF', required: true },
  lastPage: { type: Number, default: 1, min: 1, max: 5000 },
  lastOpenedAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ user: 1, pdf: 1 }, { unique: true });
export default mongoose.model('ReadingHistory', schema);

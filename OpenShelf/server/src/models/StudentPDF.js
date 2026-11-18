import mongoose from 'mongoose';

/** No external URL or General Book reference: these are Student Category local PDFs only. */
const schema = new mongoose.Schema({
  textbook: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentTextbook', required: true, index: true },
  relativePath: { type: String, required: true, unique: true },
  filename: { type: String, required: true },
  displayTitle: { type: String, trim: true, maxlength: 250, default: '' },
  partNumber: { type: Number, enum: [1, 2, null], default: null },
  sizeBytes: { type: Number, min: 5, required: true },
  rightsConfirmed: { type: Boolean, default: false },
  source: { type: String, enum: ['local', 'admin'], default: 'local' },
  importBatch: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
schema.index({ textbook: 1, isActive: 1 });
export default mongoose.model('StudentPDF', schema);

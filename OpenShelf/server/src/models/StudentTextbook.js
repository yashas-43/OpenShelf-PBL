import mongoose from 'mongoose';

/** Subject-level grouping, preserving the original five-level folder/subject names. */
const schema = new mongoose.Schema({
  level: { type: String, enum: ['Class 8', 'Class 9', 'Class 10', '1st Puc', '2nd Puc'], required: true },
  subject: { type: String, trim: true, required: true, maxlength: 140 },
  title: { type: String, trim: true, required: true },
  isPublished: { type: Boolean, default: true },
  // Physical inventory is separate from PDFs. Only administrators confirm actual stock.
  totalCopies: { type: Number, min: 0, max: 10000, default: 0 },
  availableCopies: { type: Number, min: 0, max: 10000, default: 0 },
  isAvailableForBorrow: { type: Boolean, default: false },
  pricePaise: { type: Number, min: 100, max: 10_000_000, default: 1000 }
}, { timestamps: true });
schema.index({ level: 1, subject: 1 }, { unique: true });
export default mongoose.model('StudentTextbook', schema);

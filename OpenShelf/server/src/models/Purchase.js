import mongoose from 'mongoose';

// A paid purchase is counted only after verified completion (Phase 12).
const purchaseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemType: { type: String, enum: ['general_book', 'student_textbook'], required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['pending', 'completed', 'refunded'], default: 'pending' },
  completedAt: { type: Date, default: null },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null }
}, { timestamps: true });
purchaseSchema.index({ user: 1, status: 1 });
// Enforce one completed entitlement per student and subject, including concurrent webhook retries.
purchaseSchema.index({ user: 1, itemType: 1, itemId: 1 }, { unique: true,
  partialFilterExpression: { status: 'completed' }, name: 'unique_completed_purchase_entitlement' });
export default mongoose.model('Purchase', purchaseSchema);

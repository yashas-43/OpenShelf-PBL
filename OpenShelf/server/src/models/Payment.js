import mongoose from 'mongoose';

/** Real Razorpay order and reconciliation record. Status only becomes captured after
 * signature + provider API verification (or a signed webhook + provider API check). */
const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  textbook: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentTextbook', required: true, index: true },
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String, unique: true, sparse: true },
  amountPaise: { type: Number, required: true, min: 100 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  status: { type: String, enum: ['pending', 'captured', 'failed', 'refunded'], default: 'pending', index: true },
  capturedAt: { type: Date, default: null },
  lastCheckedAt: { type: Date, default: null }
}, { timestamps: true });
paymentSchema.index({ user: 1, textbook: 1, status: 1 });
// Prevent two open checkout orders for the same account and subject.
paymentSchema.index({ user: 1, textbook: 1 }, { unique: true,
  partialFilterExpression: { status: 'pending' }, name: 'unique_pending_subject_order' });
export default mongoose.model('Payment', paymentSchema);

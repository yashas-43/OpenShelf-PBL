import mongoose from 'mongoose';

/** Separate from real Razorpay Payment and Purchase records. Never credit a real purchase. */
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  textbook: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentTextbook', required: true },
  amountPaise: { type: Number, enum: [1000], required: true, default: 1000 },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending', required: true },
  startedAt: { type: Date, required: true, default: Date.now },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ user: 1, textbook: 1 }, { unique: true, name: 'unique_demo_subject_checkout' });
export default mongoose.model('DemoCheckout', schema);

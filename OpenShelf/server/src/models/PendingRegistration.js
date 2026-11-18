import mongoose from 'mongoose';

/** Short-lived, unverified signups. Never counted as users until email OTP verification. */
const schema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false },
  otpHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  emailAcceptedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('PendingRegistration', schema);

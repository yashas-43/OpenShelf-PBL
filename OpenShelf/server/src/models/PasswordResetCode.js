import mongoose from 'mongoose';

/** One reset challenge per student, replaced only after the resend cooldown. */
const passwordResetCodeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  codeHash: { type: String, default: null, select: false },
  challengeId: { type: String, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
  resendAfter: { type: Date, required: true },
  resetTokenHash: { type: String, default: null, select: false },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });

passwordResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('PasswordResetCode', passwordResetCodeSchema);

import mongoose from 'mongoose';

/** Persistent delivery outbox. No passwords, OTP codes, JWTs, or SMTP secrets are stored here. */
const emailLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, required: true, enum: [
    'registration', 'password_reset_code', 'password_changed',
    'borrow_checkout', 'borrow_approved', 'borrow_rejected', 'borrow_issued',
    'borrow_returned', 'extension_approved', 'extension_rejected',
    'due_soon', 'overdue', 'purchase_confirmed'
  ] },
  eventKey: { type: String, required: true, unique: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'not_configured', 'cancelled'], default: 'pending', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  lastAttemptAt: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null },
  providerMessageId: { type: String, default: null }
}, { timestamps: true });

emailLogSchema.index({ status: 1, nextAttemptAt: 1, attempts: 1 });
export default mongoose.model('EmailLog', emailLogSchema);

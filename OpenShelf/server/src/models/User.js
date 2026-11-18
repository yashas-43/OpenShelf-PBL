import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  passwordHash: { type: String, required: true, select: false },
  // Multiple accounts may share a phone. Only email is unique and used for login.
  phone: { type: String, match: /^[6-9][0-9]{9}$/, default: null },
  // Retained for historical accounts that previously completed SMS verification.
  // New registrations verify email, NOT the contact phone number.
  phoneVerifiedAt: { type: Date, default: null },
  emailVerifiedAt: { type: Date, default: null },
  role: { type: String, enum: ['student'], default: 'student', immutable: true },
  isActive: { type: Boolean, default: true },
  // Old demo account identities can be retired without orphaning loan records.
  archivedAt: { type: Date, default: null },
  sessionVersion: { type: Number, default: 0, min: 0 },
  // Internal transactional write lock to serialize checkout across both loan types.
  // Separate from sessionVersion, so borrowing never logs out the student.
  borrowLimitRevision: { type: Number, default: 0, min: 0, select: false },
  emailConfirmationSentAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });

userSchema.methods.toSafeJSON = function () {
  return { id: this._id, fullName: this.fullName, email: this.email, phone: this.phone || null, phoneVerified: Boolean(this.phoneVerifiedAt), emailVerified: Boolean(this.emailVerifiedAt), role: this.role, createdAt: this.createdAt };
};

export default mongoose.model('User', userSchema);

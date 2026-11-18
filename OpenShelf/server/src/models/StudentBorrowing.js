import mongoose from 'mongoose';
import { STUDENT_OPEN_STATUSES } from '../services/studentBorrowingRules.js';

/** Physical student textbooks have their own loans, separate from digital PDF reading. */
const studentBorrowingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    textbook: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentTextbook',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['borrowed', 'overdue', 'returned'],
      default: 'borrowed',
      required: true,
      index: true
    },
    requestedAt: { type: Date, default: Date.now },
    issuedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    returnedAt: { type: Date, default: null },
    // Return requests are separate from administrator-confirmed physical returns.
    returnRequestedAt: { type: Date, default: null },
    fineAssessedPaise: { type: Number, min: 0, default: null },
    finePaidPaise: { type: Number, min: 0, default: 0 },
    extensionStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none'
    },
    extensionRequestedAt: { type: Date, default: null },
    extensionResolvedAt: { type: Date, default: null },
    events: [
      {
        action: { type: String, required: true },
        at: { type: Date, default: Date.now, required: true },
        byRole: { type: String, enum: ['student', 'admin'], required: true }
      }
    ]
  },
  { timestamps: true }
);

studentBorrowingSchema.index({ user: 1, createdAt: -1 });
studentBorrowingSchema.index({ textbook: 1, status: 1, returnedAt: 1, dueAt: 1 });

// One active physical loan per student and textbook, even under simultaneous requests.
studentBorrowingSchema.index(
  { user: 1, textbook: 1 },
  {
    unique: true,
    name: 'unique_active_student_textbook_loan',
    partialFilterExpression: { status: { $in: STUDENT_OPEN_STATUSES } }
  }
);

export default mongoose.model('StudentBorrowing', studentBorrowingSchema);

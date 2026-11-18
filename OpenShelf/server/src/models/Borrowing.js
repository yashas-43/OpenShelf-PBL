import mongoose from 'mongoose';
import { OPEN_BORROWING_STATUSES } from '../services/borrowingRules.js';

const borrowingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  status: {
    type: String,
    enum: ['requested', 'approved', 'borrowed', 'returned', 'rejected', 'overdue'],
    default: 'requested', required: true, index: true
  },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  issuedAt: { type: Date, default: null },
  dueAt: { type: Date, default: null },
  returnedAt: { type: Date, default: null },
  // Student requests a return; staff confirm receipt before copies go back into stock.
  returnRequestedAt: { type: Date, default: null },
  fineAssessedPaise: { type: Number, min: 0, default: null },
  finePaidPaise: { type: Number, min: 0, default: 0 },
  extensionStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  extensionRequestedAt: { type: Date, default: null },
  extensionResolvedAt: { type: Date, default: null },
  events: [{
    action: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
    byRole: { type: String, enum: ['student', 'admin'], required: true }
  }]
}, { timestamps: true });

borrowingSchema.index({ user: 1, createdAt: -1 });
borrowingSchema.index({ book: 1, status: 1, returnedAt: 1, dueAt: 1 });
borrowingSchema.index({ user: 1, status: 1, dueAt: 1 });
// MongoDB enforces one non-final borrowing per student and book, including concurrent requests.
borrowingSchema.index({ user: 1, book: 1 }, {
  name: 'unique_active_borrow_per_user_book', unique: true,
  partialFilterExpression: { status: { $in: OPEN_BORROWING_STATUSES } }
});

export default mongoose.model('Borrowing', borrowingSchema);

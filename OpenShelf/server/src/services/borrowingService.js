import { overdueFinePaise } from './overdueFines.js';
import { enforceThreeBookLimit } from './borrowingLimitService.js';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import { queueEmail } from './emailService.js';
import { notifyStudent } from './notificationService.js';
import { borrowingEventKey } from './emailEventKeys.js';
import { physicalReturnRequestFilter } from './physicalReturnRules.js';
import { BORROWING_ACTIONS, automaticCheckoutRecord, canAskExtension, canTransition, extensionDeadline, loanDays } from './borrowingRules.js';

export class BorrowingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const notFound = () => new BorrowingError(404, 'Borrowing record not found.');
const conflict = (message) => new BorrowingError(409, message);

/** All stock and borrowing mutations commit together; no unsafe standalone DB fallback. */
async function transact(handler) {
  try {
    return await mongoose.connection.transaction(handler);
  } catch (error) {
    // MongoDB standalone deployments cannot safely perform multi-document stock updates.
    if (/Transaction numbers are only allowed on a replica set member or mongos|replica set/i.test(error.message)
      && !error.status) {
      throw new BorrowingError(503, 'Book borrowing requires MongoDB running as a replica set. See Phase 9 setup instructions.');
    }
    throw error;
  }
}

export async function requestBorrowing(userId, bookId) {
  if (!mongoose.isValidObjectId(bookId)) throw new BorrowingError(400, 'Invalid book identifier.');
  try {
    return await transact(async (session) => {
      // Shared three-book cap, checked atomically across General and Student loans.
      await enforceThreeBookLimit(userId, session);
      const [book] = await Book.find({ _id: bookId, format: 'physical', isPublished: { $ne: false } }).session(session);
      if (!book) throw new BorrowingError(404, 'Book not found.');
      if (!book.isAvailableForBorrow || book.availableCopies < 1) {
        throw conflict('No physical copies available right now. Check the book details for the next expected return.');
      }
      const existing = await Borrowing.exists({ user: userId, book: bookId,
        status: { $in: ['requested', 'approved', 'borrowed', 'overdue'] } }).session(session);
      if (existing) throw conflict('You already have an active request or loan for this book.');

      const reserved = await Book.findOneAndUpdate({
        _id: bookId, format: 'physical', isPublished: { $ne: false }, isAvailableForBorrow: true, availableCopies: { $gt: 0 }
      }, { $inc: { availableCopies: -1 } }, { new: true, session });
      if (!reserved) throw conflict('No physical copies available: another reader just borrowed the last copy. Refresh for return estimates.');

      // New loans check out immediately. No admin approval or issue action.
      const [record] = await Borrowing.create([
        automaticCheckoutRecord(userId, bookId, new Date(), process.env.LOAN_DAYS)
      ], { session });
      await queueEmail({ userId, kind: 'borrow_checkout', eventKey: borrowingEventKey('borrow_checkout', record._id),
        details: { bookTitle: book.title, dueAt: record.dueAt.toISOString() } }, session);
      await notifyStudent({
        userId, type: 'borrow', eventKey: `general:checkout:${record._id}`,
        title: 'Book checked out',
        message: `${book.title} is borrowed. Return by ${record.dueAt.toLocaleDateString('en-IN')}.`,
        link: '#dashboard'
      }, session);
      return record;
    });
  } catch (error) {
    if (error.code === 11000) throw conflict('You already have an active request or loan for this book.');
    throw error;
  }
}

export async function applyAdminAction(borrowingId, action, durationDays = process.env.LOAN_DAYS) {
  if (!mongoose.isValidObjectId(borrowingId)) throw new BorrowingError(400, 'Invalid borrowing identifier.');
  if (!Object.hasOwn(BORROWING_ACTIONS, action)) throw new BorrowingError(400, 'Unsupported borrowing action.');
  return transact(async (session) => {
    const record = await Borrowing.findById(borrowingId).session(session);
    if (!record) throw notFound();
    if (!canTransition(record.status, action)) throw conflict(`Cannot ${action} a ${record.status} borrowing.`);
    if (action === 'return' && (!record.issuedAt || record.returnedAt)) {
      throw conflict('Cannot return this record: a valid open, issued loan is required.');
    }
    if (action === 'issue' && record.issuedAt) throw conflict('This book has already been issued.');
    if (action === 'reject' && record.issuedAt) throw conflict('An issued loan cannot be rejected.');
    const now = new Date();
    record.status = BORROWING_ACTIONS[action].to;
    if (action === 'approve') record.approvedAt = now;
    if (action === 'issue') {
      record.issuedAt = now;
      record.dueAt = issueDeadline(now, durationDays);
    }
    if (action === 'return') {
      record.returnedAt = now;
      record.fineAssessedPaise = overdueFinePaise(record, now);
      if (record.extensionStatus === 'pending') {
        record.extensionStatus = 'rejected';
        record.extensionResolvedAt = now;
        record.events.push({ action: 'extension_closed_on_return', at: now, byRole: 'admin' });
      }
    }
    if (['reject', 'return'].includes(action)) {
      const updated = await Book.updateOne({ _id: record.book,
        $expr: { $lt: ['$availableCopies', '$totalCopies'] }
      }, { $inc: { availableCopies: 1 } }, { session });
      if (updated.modifiedCount !== 1) throw conflict('Inventory is inconsistent. Check book stock before completing this action.');
    }
    record.events.push({ action, at: now, byRole: 'admin' });
    await record.save({ session });
    const noticeType = { approve: 'borrow_approved', reject: 'borrow_rejected', issue: 'borrow_issued', return: 'borrow_returned' }[action];
    if (noticeType) {
      const book = await Book.findById(record.book).select('title').session(session);
      await queueEmail({ userId: record.user, kind: noticeType,
        eventKey: borrowingEventKey(noticeType, record._id),
        details: { bookTitle: book?.title || 'your borrowed book', dueAt: record.dueAt?.toISOString(),
          fineAmountPaise: action === 'return' ? record.fineAssessedPaise : 0 } }, session);
    }
    if (action === 'return') {
      await notifyStudent({
        userId: record.user, type: 'return', eventKey: `general:returned:${record._id}`,
        title: 'Book return recorded',
        message: 'Your physical book return has been recorded. Check your dashboard for any overdue fine.',
        link: '#dashboard'
      }, session);
    }
    return record;
  });
}

/**
 * A student can request a return from My Borrowed Books.
 * This does NOT add an unverified copy to stock. The administrator confirms
 * physical receipt using the existing stock-safe return transaction.
 */
export async function requestPhysicalReturn(userId, borrowingId) {
  if (!mongoose.isValidObjectId(borrowingId)) {
    throw new BorrowingError(400, 'Invalid borrowing identifier.');
  }
  const now = new Date();
  const record = await Borrowing.findOneAndUpdate(
    physicalReturnRequestFilter(userId, borrowingId),
    {
      $set: { returnRequestedAt: now },
      $push: { events: { action: 'return_requested', at: now, byRole: 'student' } }
    },
    { new: true, runValidators: true }
  );
  if (!record) throw conflict('This return was already requested or the loan is not active.');
  return record;
}

export async function askForExtension(userId, borrowingId) {
  if (!mongoose.isValidObjectId(borrowingId)) throw new BorrowingError(400, 'Invalid borrowing identifier.');
  // Single-document atomic compare/update. No stock mutation occurs here.
  const now = new Date();
  const record = await Borrowing.findOneAndUpdate({
    _id: borrowingId, user: userId, status: { $in: ['borrowed', 'overdue'] },
    issuedAt: { $ne: null }, dueAt: { $ne: null }, returnedAt: null,
    extensionStatus: { $in: ['none', null] }
  }, { $set: { extensionStatus: 'pending', extensionRequestedAt: now, extensionResolvedAt: null },
    $push: { events: { action: 'extension_requested', at: now, byRole: 'student' } }
  }, { new: true, runValidators: true });
  if (!record) throw conflict('This borrowing is not eligible for an extension request or one is already pending.');
  return record;
}

export async function resolveExtension(borrowingId, decision) {
  if (!mongoose.isValidObjectId(borrowingId)) throw new BorrowingError(400, 'Invalid borrowing identifier.');
  if (!['approve', 'reject'].includes(decision)) throw new BorrowingError(400, 'Choose approve or reject.');
  return transact(async (session) => {
    const record = await Borrowing.findById(borrowingId).session(session);
    if (!record) throw notFound();
    if (record.extensionStatus !== 'pending' || !canAskExtension({ ...record.toObject(), extensionStatus: 'none' })) {
      throw conflict('No eligible extension request is pending.');
    }
    const now = new Date();
    record.extensionStatus = decision === 'approve' ? 'approved' : 'rejected';
    record.extensionResolvedAt = now;
    if (decision === 'approve') {
      record.dueAt = extensionDeadline(record.dueAt, now);
      record.status = 'borrowed';
    }
    record.events.push({ action: `extension_${decision}`, at: now, byRole: 'admin' });
    await record.save({ session });
    const book = await Book.findById(record.book).select('title').session(session);
    const kind = decision === 'approve' ? 'extension_approved' : 'extension_rejected';
    await queueEmail({ userId: record.user, kind, eventKey: borrowingEventKey(kind, record._id),
      details: { bookTitle: book?.title || 'your borrowed book', dueAt: record.dueAt?.toISOString() } }, session);
    await notifyStudent({
      userId: record.user, type: 'borrow',
      eventKey: `general:extension:${decision}:${record._id}`,
      title: `Extension ${decision === 'approve' ? 'approved' : 'declined'}`,
      message: `Your book extension request was ${decision === 'approve' ? 'approved' : 'declined'}.`,
      link: '#dashboard'
    }, session);
    return record;
  });
}

export const configuredLoanDays = () => loanDays(process.env.LOAN_DAYS);

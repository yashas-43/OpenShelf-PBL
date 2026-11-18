import User from '../models/User.js';
import Borrowing from '../models/Borrowing.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import {
  ACTIVE_GENERAL_LOAN_STATUSES,
  ACTIVE_STUDENT_LOAN_STATUSES,
  borrowingSlots,
  canCheckoutPhysicalBook
} from './borrowingLimitRules.js';

export class BorrowingLimitError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * All checkouts acquire a write lock on the same student document BEFORE
 * counting loans. This makes overlapping transactions for different books or
 * different collections conflict and retry, rather than both seeing two loans
 * and allowing a fourth. The increment is an internal revision, NOT a loan count.
 * MongoDB replica-set transactions are required; no unsafe fallback is used.
 */
export async function enforceThreeBookLimit(userId, session) {
  if (!session) {
    throw new BorrowingLimitError(503, 'A MongoDB transaction is required for borrowing.');
  }

  const student = await User.findOneAndUpdate(
    { _id: userId, role: 'student', isActive: true },
    { $inc: { borrowLimitRevision: 1 } },
    { session, projection: { _id: 1 } }
  );
  if (!student) {
    throw new BorrowingLimitError(401, 'Your student account is not available.');
  }

  // Run transaction queries sequentially; Mongoose does not support Promise.all
  // operations sharing the same transaction session.
  const generalCount = await Borrowing.countDocuments({
    user: userId,
    status: { $in: ACTIVE_GENERAL_LOAN_STATUSES },
    returnedAt: null
  }).session(session);

  const studentCount = await StudentBorrowing.countDocuments({
    user: userId,
    status: { $in: ACTIVE_STUDENT_LOAN_STATUSES },
    returnedAt: null
  }).session(session);

  if (!canCheckoutPhysicalBook(generalCount, studentCount)) {
    throw new BorrowingLimitError(
      409,
      'Borrowing limit reached: you can borrow a maximum of 3 physical books at a time. Return a book before borrowing another.'
    );
  }

  return borrowingSlots(generalCount, studentCount);
}

import mongoose from 'mongoose';
import { enforceThreeBookLimit } from './borrowingLimitService.js';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import AdminAudit from '../models/AdminAudit.js';
import { queueEmail } from './emailService.js';
import { notifyStudent } from './notificationService.js';
import { borrowingEventKey } from './emailEventKeys.js';
import { canAskExtension, extensionDeadline, loanDays } from './borrowingRules.js';
import { overdueFinePaise } from './overdueFines.js';
import { physicalReturnRequestFilter } from './physicalReturnRules.js';
import { validateStudentStockBatch } from './studentStockBatchRules.js';
import {
  studentCheckoutDocument,
  studentInventoryUpdate,
  STUDENT_OPEN_STATUSES
} from './studentBorrowingRules.js';

export class StudentBorrowingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const invalidId = () => new StudentBorrowingError(400, 'Invalid textbook or borrowing identifier.');
const conflict = (message) => new StudentBorrowingError(409, message);

/** Separate event namespace prevents clashes with General Book notifications. */
export const studentEmailKey = (kind, loanId, suffix = '') =>
  `student:${borrowingEventKey(kind, loanId, suffix)}`;

/** Changes to stock and loans commit atomically (requires MongoDB replica set). */
async function transaction(callback) {
  try {
    return await mongoose.connection.transaction(callback);
  } catch (error) {
    if (/Transaction numbers are only allowed on a replica set member or mongos|replica set/i.test(error.message)
      && !error.status) {
      throw new StudentBorrowingError(503, 'MongoDB replica set required for safe physical borrowing.');
    }
    throw error;
  }
}

export async function checkoutStudentTextbook(userId, textbookId) {
  if (!mongoose.isValidObjectId(textbookId)) throw invalidId();
  try {
    return await transaction(async (session) => {
      // Shares one three-book limit with General Books (and serializes checkout).
      await enforceThreeBookLimit(userId, session);
      const textbook = await StudentTextbook.findOne({ _id: textbookId, isPublished: true })
        .session(session);
      if (!textbook) throw new StudentBorrowingError(404, 'Student textbook not found.');
      if (!textbook.isAvailableForBorrow || textbook.availableCopies < 1) {
        throw conflict('No physical copies available. See the next expected return date.');
      }

      const duplicate = await StudentBorrowing.exists({
        user: userId,
        textbook: textbookId,
        status: { $in: STUDENT_OPEN_STATUSES }
      }).session(session);
      if (duplicate) throw conflict('You already have this student textbook on loan.');

      const updated = await StudentTextbook.findOneAndUpdate(
        {
          _id: textbookId,
          isPublished: true,
          isAvailableForBorrow: true,
          availableCopies: { $gt: 0 }
        },
        { $inc: { availableCopies: -1 } },
        { new: true, session }
      );
      if (!updated) throw conflict('The last physical copy has just been borrowed.');

      const now = new Date();
      const [loan] = await StudentBorrowing.create(
        [studentCheckoutDocument(userId, textbookId, now, loanDays(process.env.LOAN_DAYS))],
        { session }
      );
      await queueEmail(
        {
          userId,
          kind: 'borrow_checkout',
          eventKey: studentEmailKey('borrow_checkout', loan._id),
          details: { bookTitle: `${textbook.level} · ${textbook.subject}`, dueAt: loan.dueAt.toISOString() }
        },
        session
      );
      await notifyStudent({
        userId, type: 'borrow', eventKey: `student:checkout:${loan._id}`,
        title: 'Student textbook checked out',
        message: `${textbook.level} · ${textbook.subject} is borrowed. Return by ${loan.dueAt.toLocaleDateString('en-IN')}.`,
        link: '#dashboard'
      }, session);
      return loan;
    });
  } catch (error) {
    if (error.code === 11000) throw conflict('You already have this student textbook on loan.');
    throw error;
  }
}

export async function returnStudentTextbook(loanId) {
  if (!mongoose.isValidObjectId(loanId)) throw invalidId();
  return transaction(async (session) => {
    const loan = await StudentBorrowing.findById(loanId).session(session);
    if (!loan) throw new StudentBorrowingError(404, 'Student loan not found.');
    if (!STUDENT_OPEN_STATUSES.includes(loan.status) || loan.returnedAt) {
      throw conflict('This student textbook is not currently on loan.');
    }

    const updated = await StudentTextbook.updateOne(
      {
        _id: loan.textbook,
        $expr: { $lt: ['$availableCopies', '$totalCopies'] }
      },
      { $inc: { availableCopies: 1 } },
      { session }
    );
    if (updated.modifiedCount !== 1) {
      throw conflict('Physical inventory is inconsistent. Check the textbook stock before returning.');
    }

    const now = new Date();
    loan.status = 'returned';
    loan.returnedAt = now;
    loan.fineAssessedPaise = overdueFinePaise(loan, now);
    if (loan.extensionStatus === 'pending') {
      loan.extensionStatus = 'rejected';
      loan.extensionResolvedAt = now;
    }
    loan.events.push({ action: 'return', at: now, byRole: 'admin' });
    await loan.save({ session });
    // Audit is in the same transaction as the physical return and stock release.
    await AdminAudit.create([{
      action: 'student_textbook_returned',
      targetType: 'student_borrowing',
      targetId: String(loan._id),
      notes: `Textbook ${loan.textbook}; fine ${loan.fineAssessedPaise} paise`
    }], { session });

    const textbook = await StudentTextbook.findById(loan.textbook).select('level subject').session(session);
    await queueEmail(
      {
        userId: loan.user,
        kind: 'borrow_returned',
        eventKey: studentEmailKey('borrow_returned', loan._id),
        details: {
          bookTitle: textbook ? `${textbook.level} · ${textbook.subject}` : 'your student textbook',
          fineAmountPaise: loan.fineAssessedPaise
        }
      },
      session
    );
    await notifyStudent({
      userId: loan.user, type: 'return', eventKey: `student:returned:${loan._id}`,
      title: 'Textbook return recorded',
      message: 'Your physical textbook has been returned. Check your dashboard for overdue fines.',
      link: '#dashboard'
    }, session);
    return loan;
  });
}

/**
 * Return request from a student. Do not restore stock until staff receive
 * the physical textbook and record the return on the administrator desk.
 */
export async function requestStudentReturn(userId, loanId) {
  if (!mongoose.isValidObjectId(loanId)) throw invalidId();
  const now = new Date();
  const loan = await StudentBorrowing.findOneAndUpdate(
    physicalReturnRequestFilter(userId, loanId),
    {
      $set: { returnRequestedAt: now },
      $push: { events: { action: 'return_requested', at: now, byRole: 'student' } }
    },
    { new: true, runValidators: true }
  );
  if (!loan) throw conflict('This textbook return was already requested or the loan is not active.');
  return loan;
}

export async function requestStudentExtension(userId, loanId) {
  if (!mongoose.isValidObjectId(loanId)) throw invalidId();
  const now = new Date();
  const loan = await StudentBorrowing.findOneAndUpdate(
    {
      _id: loanId,
      user: userId,
      status: { $in: STUDENT_OPEN_STATUSES },
      returnedAt: null,
      extensionStatus: { $in: ['none', null] }
    },
    {
      $set: { extensionStatus: 'pending', extensionRequestedAt: now },
      $push: { events: { action: 'extension_requested', at: now, byRole: 'student' } }
    },
    { new: true, runValidators: true }
  );
  if (!loan) throw conflict('This loan is not eligible for another extension request.');
  return loan;
}

export async function decideStudentExtension(loanId, decision) {
  if (!mongoose.isValidObjectId(loanId)) throw invalidId();
  if (!['approve', 'reject'].includes(decision)) {
    throw new StudentBorrowingError(400, 'Choose approve or reject.');
  }

  return transaction(async (session) => {
    const loan = await StudentBorrowing.findById(loanId).session(session);
    if (!loan) throw new StudentBorrowingError(404, 'Student loan not found.');
    if (loan.extensionStatus !== 'pending' ||
      !canAskExtension({ ...loan.toObject(), extensionStatus: 'none' })) {
      throw conflict('No eligible extension request is pending.');
    }

    const now = new Date();
    loan.extensionStatus = decision === 'approve' ? 'approved' : 'rejected';
    loan.extensionResolvedAt = now;
    if (decision === 'approve') {
      loan.dueAt = extensionDeadline(loan.dueAt, now);
      loan.status = 'borrowed';
    }
    loan.events.push({ action: `extension_${decision}`, at: now, byRole: 'admin' });
    await loan.save({ session });

    const textbook = await StudentTextbook.findById(loan.textbook).select('level subject').session(session);
    const kind = decision === 'approve' ? 'extension_approved' : 'extension_rejected';
    await queueEmail(
      {
        userId: loan.user,
        kind,
        eventKey: studentEmailKey(kind, loan._id),
        details: {
          bookTitle: textbook ? `${textbook.level} · ${textbook.subject}` : 'your student textbook',
          dueAt: loan.dueAt.toISOString()
        }
      },
      session
    );
    await notifyStudent({
      userId: loan.user, type: 'borrow',
      eventKey: `student:extension:${decision}:${loan._id}`,
      title: `Textbook extension ${decision === 'approve' ? 'approved' : 'declined'}`,
      message: `Your textbook extension was ${decision === 'approve' ? 'approved' : 'declined'}.`,
      link: '#dashboard'
    }, session);
    return loan;
  });
}

export async function setStudentInventory(textbookId, copies) {
  if (!mongoose.isValidObjectId(textbookId)) throw invalidId();
  return transaction(async (session) => {
    const textbook = await StudentTextbook.findById(textbookId).session(session);
    if (!textbook) throw new StudentBorrowingError(404, 'Textbook not found.');
    const openLoans = await StudentBorrowing.countDocuments({
      textbook: textbookId,
      status: { $in: STUDENT_OPEN_STATUSES }
    }).session(session);
    try {
      const inventory = studentInventoryUpdate(copies, openLoans);
      textbook.set({ ...inventory, isAvailableForBorrow: copies > 0 });
    } catch (error) {
      throw new StudentBorrowingError(400, error.message);
    }
    await textbook.save({ session });
    // This audit entry is committed together with the administrator's stock edit.
    await AdminAudit.create([{
      action: 'student_textbook_stock_updated',
      targetType: 'student_textbook',
      targetId: String(textbook._id),
      notes: `Total physical copies: ${copies}; active physical loans: ${openLoans}`
    }], { session });
    return textbook;
  });
}

/**
 * Save all administrator-edited Student Textbook stock levels in one transaction.
 * For each row, recalculate available stock from real open loans. If any row
 * is stale or invalid, the transaction rolls back ALL changes and audit logs.
 */
export async function setStudentInventoryBatch(input) {
  const updates = validateStudentStockBatch(input);
  return transaction(async (session) => {
    const changed = [];
    for (const { id, totalCopies, expectedTotalCopies } of updates) {
      const textbook = await StudentTextbook.findById(id).session(session);
      if (!textbook) {
        throw new StudentBorrowingError(404, 'A selected textbook no longer exists. Refresh and try again.');
      }
      // Prevent an administrator from overwriting a newer inventory edit.
      if (textbook.totalCopies !== expectedTotalCopies) {
        throw new StudentBorrowingError(409,
          `Stock changed for ${textbook.level} · ${textbook.subject}. Refresh before saving again.`);
      }
      const activeLoans = await StudentBorrowing.countDocuments({
        textbook: textbook._id,
        status: { $in: STUDENT_OPEN_STATUSES },
        returnedAt: null
      }).session(session);
      let inventory;
      try {
        inventory = studentInventoryUpdate(totalCopies, activeLoans);
      } catch (error) {
        throw new StudentBorrowingError(409,
          `${textbook.level} · ${textbook.subject}: ${error.message}`);
      }
      textbook.set({ ...inventory, isAvailableForBorrow: totalCopies > 0 });
      await textbook.save({ session });
      await AdminAudit.create([{
        action: 'student_textbook_stock_updated',
        targetType: 'student_textbook',
        targetId: String(textbook._id),
        notes: `Bulk inventory save: ${totalCopies} physical copies; ${activeLoans} active loans`
      }], { session });
      changed.push({ id: textbook._id, totalCopies, availableCopies: inventory.availableCopies });
    }
    return changed;
  });
}

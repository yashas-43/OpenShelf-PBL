import mongoose from 'mongoose';
import StudentBorrowing from '../models/StudentBorrowing.js';
import StudentTextbook from '../models/StudentTextbook.js';
import { fineSummary } from '../services/overdueFines.js';
import { classifyBorrowing } from '../services/dashboardMetrics.js';
import { expectedReturnsByBook } from '../services/publicBookAvailability.js';
import { studentPublicAvailability } from '../services/studentBorrowingRules.js';
import { deliverEmailByEvent } from '../services/emailService.js';
import {
  checkoutStudentTextbook,
  decideStudentExtension,
  requestStudentExtension,
  requestStudentReturn,
  returnStudentTextbook,
  setStudentInventory,
  setStudentInventoryBatch,
  studentEmailKey
} from '../services/studentBorrowingService.js';

// Email failure never makes an already-committed checkout appear to have failed.
async function deliveryStatus(kind, loanId) {
  try {
    return (await deliverEmailByEvent(studentEmailKey(kind, loanId))).status;
  } catch {
    return 'failed';
  }
}

export async function checkout(req, res, next) {
  try {
    const loan = await checkoutStudentTextbook(req.auth.sub, req.body?.textbookId);
    const emailStatus = await deliveryStatus('borrow_checkout', loan._id);
    return res.status(201).json({
      success: true,
      data: { id: loan._id, status: loan.status, issuedAt: loan.issuedAt, dueAt: loan.dueAt },
      message: 'Student textbook checked out automatically. See your dashboard for its return deadline.',
      emailStatus
    });
  } catch (error) {
    next(error);
  }
}

export async function availability(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid textbook ID.' });
    }
    const textbook = await StudentTextbook.findOne({
      _id: req.params.id,
      isPublished: true
    }).select('isPublished isAvailableForBorrow availableCopies').lean();
    if (!textbook) return res.status(404).json({ success: false, message: 'Textbook not found.' });

    const rows = await StudentBorrowing.aggregate([
      {
        $match: {
          textbook: textbook._id,
          status: { $in: ['borrowed', 'overdue'] },
          returnedAt: null,
          dueAt: { $type: 'date' }
        }
      },
      { $group: { _id: '$textbook', dueDates: { $push: '$dueAt' } } }
    ]);
    const byTextbook = expectedReturnsByBook(rows);
    return res.json({
      success: true,
      data: studentPublicAvailability(textbook, byTextbook.get(String(textbook._id)))
    });
  } catch (error) {
    next(error);
  }
}

/** A return request does not restore physical inventory before staff confirmation. */
export async function requestReturn(req, res, next) {
  try {
    const loan = await requestStudentReturn(req.auth.sub, req.params.id);
    return res.json({
      success: true,
      returnRequestedAt: loan.returnRequestedAt,
      message: 'Return requested. Hand the physical textbook to library staff for confirmation. Your loan remains active until then.'
    });
  } catch (error) { return next(error); }
}

export async function askExtension(req, res, next) {
  try {
    const loan = await requestStudentExtension(req.auth.sub, req.params.id);
    return res.json({
      success: true,
      data: { id: loan._id, extensionStatus: loan.extensionStatus },
      message: 'Extension requested. Your due date has not changed until staff approve it.'
    });
  } catch (error) {
    next(error);
  }
}

export async function adminList(req, res, next) {
  try {
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = 15;
    // Staff may filter the list to returns students have requested but are
    // still awaiting physical handover and stock reconciliation.
    const filter = req.query.returns === 'pending'
      ? { returnRequestedAt: { $ne: null }, returnedAt: null, status: { $in: ['borrowed', 'overdue'] } }
      : {};
    const [records, total] = await Promise.all([
      StudentBorrowing.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('user', 'fullName email phone')
        .populate('textbook', 'level subject title')
        .lean(),
      StudentBorrowing.countDocuments(filter)
    ]);
    return res.json({
      success: true,
      data: records.map((loan) => ({
        id: loan._id,
        user: loan.user,
        book: loan.textbook ? {
          title: `${loan.textbook.level} · ${loan.textbook.subject}`,
          author: 'Student textbook',
          id: loan.textbook._id
        } : null,
        status: classifyBorrowing(loan),
        dueAt: loan.dueAt,
        issuedAt: loan.issuedAt,
        returnedAt: loan.returnedAt,
        returnRequestedAt: loan.returnRequestedAt,
        requestedAt: loan.requestedAt,
        extensionStatus: loan.extensionStatus,
        ...fineSummary(loan)
      })),
      pagination: { page, pages: Math.ceil(total / limit), total, limit }
    });
  } catch (error) {
    next(error);
  }
}

export async function adminReturn(req, res, next) {
  try {
    const loan = await returnStudentTextbook(req.params.id);
    const emailStatus = await deliveryStatus('borrow_returned', loan._id);
    return res.json({
      success: true,
      message: 'Student textbook returned; one physical copy is available again.',
      data: { id: loan._id, status: loan.status, ...fineSummary(loan) },
      emailStatus
    });
  } catch (error) {
    next(error);
  }
}

export async function adminExtension(req, res, next) {
  try {
    const loan = await decideStudentExtension(req.params.id, req.body?.decision);
    const kind = req.body?.decision === 'approve' ? 'extension_approved' : 'extension_rejected';
    const emailStatus = await deliveryStatus(kind, loan._id);
    return res.json({
      success: true,
      message: `Extension ${req.body.decision === 'approve' ? 'approved' : 'rejected'}.`,
      data: { id: loan._id, dueAt: loan.dueAt, extensionStatus: loan.extensionStatus },
      emailStatus
    });
  } catch (error) {
    next(error);
  }
}

export async function adminInventory(req, res, next) {
  try {
    const textbook = await setStudentInventory(req.params.id, req.body?.totalCopies);
    return res.json({
      success: true,
      message: 'Physical student textbook inventory updated.',
      data: {
        id: textbook._id,
        totalCopies: textbook.totalCopies,
        availableCopies: textbook.availableCopies,
        isAvailableForBorrow: textbook.isAvailableForBorrow
      }
    });
  } catch (error) {
    next(error);
  }
}

/** Save all edited Student Textbook stock levels with a single API request. */
export async function adminInventoryBatch(req, res, next) {
  try {
    const changed = await setStudentInventoryBatch(req.body?.updates);
    return res.json({
      success: true,
      message: `Saved physical inventory for ${changed.length} textbook(s).`,
      data: changed
    });
  } catch (error) { next(error); }
}

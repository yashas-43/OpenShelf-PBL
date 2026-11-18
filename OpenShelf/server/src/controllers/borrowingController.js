import { fineSummary } from '../services/overdueFines.js';
import Borrowing from '../models/Borrowing.js';
import { classifyBorrowing } from '../services/dashboardMetrics.js';
import { deliverBorrowingNotice } from '../services/borrowEmailNotifications.js';
import { applyAdminAction, askForExtension, configuredLoanDays, requestBorrowing, requestPhysicalReturn, resolveExtension } from '../services/borrowingService.js';

export async function requestBook(req, res, next) {
  try {
    const record = await requestBorrowing(req.auth.sub, req.body?.bookId);
    const { status: emailStatus } = await deliverBorrowingNotice('borrow_checkout', record._id);
    const emailMessage = { sent: ' Email confirmation accepted by SMTP.', not_configured: ' Email not sent: configure SMTP.', failed: ' Email delivery failed; it is logged for retry.', not_queued: ' Email notification could not be queued.' }[emailStatus] || ' Email notification is queued or being processed.';
    return res.status(201).json({ success: true, data: { id: record._id, status: record.status },
      message: `Book borrowed automatically. Due back ${record.dueAt.toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}.${emailMessage}`,
      dueAt: record.dueAt, issuedAt: record.issuedAt,
      emailStatus });
  } catch (error) { next(error); }
}

/** Record the student's intent to return a physical copy; staff verify receipt. */
export async function requestReturn(req, res, next) {
  try {
    const record = await requestPhysicalReturn(req.auth.sub, req.params.id);
    return res.json({
      success: true,
      returnRequestedAt: record.returnRequestedAt,
      message: 'Return requested. Please hand the physical book to the library. Your loan stays active until staff confirm receipt.'
    });
  } catch (error) { return next(error); }
}

export async function requestExtension(req, res, next) {
  try {
    const record = await askForExtension(req.auth.sub, req.params.id);
    res.json({ success: true, data: { id: record._id, extensionStatus: record.extensionStatus },
      message: 'Extension request saved. Your current due date remains unchanged until an administrator approves.' });
  } catch (error) { next(error); }
}

export async function listAdminBorrowings(req, res, next) {
  try {
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const status = String(req.query.status || 'all');
    const filter = {};
    if (status === 'return-requests') {
      filter.status = { $in: ['borrowed', 'overdue'] };
      filter.returnRequestedAt = { $ne: null };
      filter.returnedAt = null;
    }
    else if (status === 'overdue') filter.$or = [
      { status: 'overdue' },
      { status: 'borrowed', dueAt: { $lt: new Date() }, returnedAt: null }
    ];
    else if (['requested', 'approved', 'borrowed', 'returned', 'rejected'].includes(status)) filter.status = status;
    const [records, total] = await Promise.all([
      Borrowing.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 15).limit(15)
        .populate('user', 'fullName email phone phoneVerifiedAt').populate('book', 'title author availableCopies totalCopies').lean(),
      Borrowing.countDocuments(filter)
    ]);
    res.json({ success: true, data: records.map((record) => ({
      id: record._id,
      user: record.user ? { id: record.user._id, fullName: record.user.fullName, email: record.user.email, phone: record.user.phone || null } : null,
      book: record.book ? { id: record.book._id, title: record.book.title, author: record.book.author,
        availableCopies: record.book.availableCopies, totalCopies: record.book.totalCopies } : null,
      status: classifyBorrowing(record), requestedAt: record.requestedAt, approvedAt: record.approvedAt,
      issuedAt: record.issuedAt, dueAt: record.dueAt, returnedAt: record.returnedAt, returnRequestedAt: record.returnRequestedAt,
      ...fineSummary(record),
      extensionStatus: record.extensionStatus || 'none', extensionRequestedAt: record.extensionRequestedAt
    })), pagination: { page, pages: Math.ceil(total / 15), total, limit: 15 }, loanDays: configuredLoanDays() });
  } catch (error) { next(error); }
}

export async function changeBorrowingStatus(req, res, next) {
  try {
    const record = await applyAdminAction(req.params.id, req.params.action);
    const kind = { approve: 'borrow_approved', reject: 'borrow_rejected', issue: 'borrow_issued', return: 'borrow_returned' }[req.params.action];
    const emailStatus = kind ? (await deliverBorrowingNotice(kind, record._id)).status : 'not_applicable';
    res.json({ success: true, data: { id: record._id, status: record.status,
      issuedAt: record.issuedAt, dueAt: record.dueAt, returnedAt: record.returnedAt, returnRequestedAt: record.returnRequestedAt, ...fineSummary(record) },
      message: `Borrowing ${req.params.action} action completed and saved.`, emailStatus });
  } catch (error) { next(error); }
}

export async function decideExtension(req, res, next) {
  try {
    const record = await resolveExtension(req.params.id, req.body?.decision);
    const kind = req.body?.decision === 'approve' ? 'extension_approved' : 'extension_rejected';
    const emailStatus = (await deliverBorrowingNotice(kind, record._id)).status;
    res.json({ success: true, data: { id: record._id, dueAt: record.dueAt, extensionStatus: record.extensionStatus },
      message: `Extension ${req.body.decision === 'approve' ? 'approved' : 'rejected'} and saved.`, emailStatus });
  } catch (error) { next(error); }
}

import { fineSummary } from '../services/overdueFines.js';
import {
  ACTIVE_GENERAL_LOAN_STATUSES,
  ACTIVE_STUDENT_LOAN_STATUSES,
  borrowingSlots
} from '../services/borrowingLimitRules.js';
import bcrypt from 'bcryptjs';
import { queueEmail, deliverEmailByEvent } from '../services/emailService.js';
import User from '../models/User.js';
import Borrowing from '../models/Borrowing.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import Purchase from '../models/Purchase.js';
import PeerBookListing from '../models/PeerBookListing.js';
import ExchangeRequest from '../models/ExchangeRequest.js';
import Notification from '../models/Notification.js';
import { classifyBorrowing, DUE_SOON_WINDOW_MS } from '../services/dashboardMetrics.js';

const MAX_PAGE = 10000;

export async function overview(req, res, next) {
  try {
    const userId = req.auth.sub;
    const now = new Date();
    const dueSoon = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
    const [totalBorrowed, currentlyBorrowed, pendingRequests, overdueBooks, dueSoonBooks,
      purchasedBooks, listedPeerBooks, activeExchangeRequests, unreadNotifications,
      recentBorrowings, notifications, fineLoans, studentLoans, generalOpenCount] = await Promise.all([
      Borrowing.countDocuments({ user: userId, status: { $in: ['borrowed', 'returned', 'overdue'] }, issuedAt: { $ne: null } }),
      Borrowing.countDocuments({ user: userId, status: { $in: ['borrowed', 'overdue'] }, issuedAt: { $ne: null }, returnedAt: null }),
      Borrowing.countDocuments({ user: userId, status: 'requested' }),
      Borrowing.countDocuments({ user: userId, issuedAt: { $ne: null }, returnedAt: null, $or: [
        { status: 'overdue' },
        { status: 'borrowed', issuedAt: { $ne: null }, dueAt: { $lt: now } }
      ] }),
      Borrowing.countDocuments({ user: userId, status: 'borrowed', issuedAt: { $ne: null }, returnedAt: null, dueAt: { $gte: now, $lte: dueSoon } }),
      Purchase.countDocuments({ user: userId, status: 'completed' }),
      PeerBookListing.countDocuments({ owner: userId, status: { $ne: 'removed' } }),
      ExchangeRequest.countDocuments({ $or: [{ requester: userId }, { owner: userId }], status: { $in: ['pending', 'accepted'] } }),
      Notification.countDocuments({ user: userId, readAt: null }),
      Borrowing.find({ user: userId }).sort({ createdAt: -1 }).limit(5)
        .populate('book', 'title author coverUrl').lean(),
      Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(5).select('title message readAt createdAt').lean(),
      Borrowing.find({ user: userId, issuedAt: { $ne: null } }).select('issuedAt dueAt returnedAt fineAssessedPaise finePaidPaise').lean(),
      StudentBorrowing.find({ user: userId }).sort({ createdAt: -1 })
        .populate('textbook', 'level subject title').lean(),
      Borrowing.countDocuments({
        user: userId, status: { $in: ACTIVE_GENERAL_LOAN_STATUSES }, returnedAt: null
      })
    ]);

    const studentOpen = studentLoans.filter((loan) =>
      ['borrowed', 'overdue'].includes(loan.status) && !loan.returnedAt
    );
    const studentOverdue = studentOpen.filter((loan) => loan.dueAt && new Date(loan.dueAt) < now);
    const studentDueSoon = studentOpen.filter((loan) => loan.dueAt &&
      new Date(loan.dueAt) >= now && new Date(loan.dueAt) <= dueSoon
    );
    res.json({ success: true, data: {
      summary: {
        totalBorrowed: totalBorrowed + studentLoans.length,
        currentlyBorrowed: currentlyBorrowed + studentOpen.length,
        pendingRequests,
        // Include older pending General Book requests in the shared physical limit.
        physicalBorrowingSlots: borrowingSlots(
          generalOpenCount,
          studentLoans.filter((loan) =>
            ACTIVE_STUDENT_LOAN_STATUSES.includes(loan.status) && !loan.returnedAt
          ).length
        ),
        overdueBooks: overdueBooks + studentOverdue.length,
        dueSoonBooks: dueSoonBooks + studentDueSoon.length,
        purchasedBooks, listedPeerBooks, activeExchangeRequests, unreadNotifications,
        outstandingFinePaise: [...fineLoans, ...studentLoans]
          .reduce((sum, record) => sum + fineSummary(record, now).fineOutstandingPaise, 0) },
      recentActivity: [
        ...recentBorrowings.map((record) => ({
          id: record._id,
          bookTitle: record.book?.title || 'Book no longer in catalogue',
          status: classifyBorrowing(record, now),
          date: record.createdAt
        })),
        ...studentLoans.slice(0, 5).map((record) => ({
          id: record._id,
          bookTitle: record.textbook
            ? `${record.textbook.level} · ${record.textbook.subject}`
            : 'Student textbook',
          status: classifyBorrowing(record, now),
          date: record.createdAt
        }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
      notifications
    } });
  } catch (error) { next(error); }
}

export async function borrowings(req, res, next) {
  try {
    const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = 10;
    const filter = { user: req.auth.sub };
    const [records, total] = await Promise.all([
      Borrowing.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('book', 'title author coverUrl').lean(),
      Borrowing.countDocuments(filter)
    ]);
    const now = new Date();
    res.json({ success: true, data: records.map((record) => ({
      id: record._id,
      book: record.book ? {
        id: record.book._id, title: record.book.title, author: record.book.author, coverUrl: record.book.coverUrl
      } : null,
      status: classifyBorrowing(record, now),
      requestedAt: record.requestedAt || record.createdAt,
      approvedAt: record.approvedAt,
      issuedAt: record.issuedAt,
      dueAt: record.issuedAt ? record.dueAt : null,
      returnedAt: record.returnedAt,
      returnRequestedAt: record.returnRequestedAt,
      extensionStatus: record.extensionStatus || 'none',
      extensionRequestedAt: record.extensionRequestedAt,
      extensionResolvedAt: record.extensionResolvedAt,
      ...fineSummary(record, now)
    })), pagination: { page, pages: Math.ceil(total / limit), total, limit } });
  } catch (error) { next(error); }
}

/** Separate paginated Student physical loans, shown alongside General Book loans. */
export async function studentBorrowings(req, res, next) {
  try {
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = 10;
    const filter = { user: req.auth.sub };
    const [rows, total] = await Promise.all([
      StudentBorrowing.find(filter).sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit)
        .populate('textbook', 'level subject title').lean(),
      StudentBorrowing.countDocuments(filter)
    ]);
    return res.json({
      success: true,
      data: rows.map((loan) => ({
        id: loan._id,
        type: 'student',
        book: loan.textbook ? {
          id: loan.textbook._id,
          title: `${loan.textbook.level} · ${loan.textbook.subject}`,
          author: 'Student textbook'
        } : null,
        status: classifyBorrowing(loan),
        requestedAt: loan.requestedAt,
        issuedAt: loan.issuedAt,
        dueAt: loan.dueAt,
        returnedAt: loan.returnedAt,
        returnRequestedAt: loan.returnRequestedAt,
        extensionStatus: loan.extensionStatus,
        extensionRequestedAt: loan.extensionRequestedAt,
        extensionResolvedAt: loan.extensionResolvedAt,
        ...fineSummary(loan)
      })),
      pagination: { page, pages: Math.ceil(total / limit), total, limit }
    });
  } catch (error) {
    next(error);
  }
}

export async function profile(req, res, next) {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Account unavailable.' });
    res.json({ success: true, user: user.toSafeJSON() });
  } catch (error) { next(error); }
}

export async function updateProfile(req, res, next) {
  try {
    if (typeof req.body?.fullName !== 'string') return res.status(400).json({ success: false, message: 'A valid full name is required.' });
    const fullName = req.body.fullName.trim();
    if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ success: false, message: 'Full name must contain 2–80 characters.' });
    const user = await User.findOneAndUpdate({ _id: req.auth.sub, isActive: true }, { $set: { fullName } }, { new: true, runValidators: true });
    if (!user) return res.status(401).json({ success: false, message: 'Account unavailable.' });
    return res.json({ success: true, message: 'Profile updated.', user: user.toSafeJSON() });
  } catch (error) { next(error); }
}

export async function changePassword(req, res, next) {
  try {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string'
      || newPassword.length < 8 || newPassword.length > 72 || req.body?.confirmPassword !== newPassword) {
      return res.status(400).json({ success: false, message: 'Check the current password, new password (8–72 characters), and confirmation.' });
    }
    const user = await User.findOne({ _id: req.auth.sub, isActive: true }).select('+passwordHash');
    if (!user) return res.status(401).json({ success: false, message: 'Account unavailable.' });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    if (await bcrypt.compare(newPassword, user.passwordHash)) return res.status(400).json({ success: false, message: 'Choose a different password.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.sessionVersion += 1;
    await user.save();
    let emailStatus = 'failed';
    try {
      const eventKey = `password-changed-profile:${user._id}:${user.sessionVersion}`;
      await queueEmail({ userId: user._id, kind: 'password_changed', eventKey });
      emailStatus = (await deliverEmailByEvent(eventKey)).status;
    } catch { /* Password save succeeded; a notification failure must not undo it. */ }
    return res.json({ success: true, message: 'Password changed. Please sign in again on all devices.', emailStatus });
  } catch (error) { next(error); }
}

import Borrowing from '../models/Borrowing.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import Book from '../models/Book.js';
import StudentTextbook from '../models/StudentTextbook.js';
import PeerBookListing from '../models/PeerBookListing.js';
import ExchangeRequest from '../models/ExchangeRequest.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { fineSummary } from '../services/overdueFines.js';

const ACTIVE = ['borrowed', 'overdue'];

/**
 * Administrator-only aggregate overview. No speculative payment revenue is used:
 * Razorpay is disabled, so no new payment report is shown.
 */
export async function reportSummary(_req, res, next) {
  try {
    const now = new Date();
    const overdue = {
      status: { $in: ACTIVE }, returnedAt: null, dueAt: { $lt: now }
    };
    const [
      students, generalBooks, studentTextbooks, peerListings, pendingExchanges,
      overdueGeneral, overdueStudent, generalByGenre, studentByLevel,
      generalByStatus, studentByStatus, unreadAlerts, recentGeneral, recentStudent
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Book.countDocuments({ isPublished: { $ne: false } }),
      StudentTextbook.countDocuments({ isPublished: true }),
      PeerBookListing.countDocuments({ status: 'available', approvalStatus: 'approved' }),
      ExchangeRequest.countDocuments({ status: 'pending' }),
      Borrowing.countDocuments(overdue),
      StudentBorrowing.countDocuments(overdue),
      Book.aggregate([{ $match: { isPublished: { $ne: false } } },
        { $group: { _id: '$genre', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 32 }]),
      StudentTextbook.aggregate([{ $match: { isPublished: true } },
        { $group: { _id: '$level', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Borrowing.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }]),
      StudentBorrowing.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }]),
      Notification.countDocuments({ readAt: null }),
      Borrowing.find({ issuedAt: { $ne: null } }).sort({ createdAt: -1 }).limit(500)
        .select('issuedAt dueAt returnedAt fineAssessedPaise finePaidPaise').lean(),
      StudentBorrowing.find().sort({ createdAt: -1 }).limit(500)
        .select('issuedAt dueAt returnedAt fineAssessedPaise finePaidPaise').lean()
    ]);

    // Bound the fine sample and label it: this is not a total over all loans.
    const sampledFinePaise = [...recentGeneral, ...recentStudent]
      .reduce((sum, loan) => sum + fineSummary(loan, now).fineOutstandingPaise, 0);

    return res.json({ success: true, data: {
      totals: {
        students, generalBooks, studentTextbooks, peerListings, pendingExchanges,
        overdueGeneral, overdueStudent, unreadAlerts
      },
      breakdowns: {
        generalByGenre, studentByLevel, generalByStatus, studentByStatus
      },
      fineSample: {
        outstandingPaise: sampledFinePaise,
        scannedLoans: recentGeneral.length + recentStudent.length,
        complete: recentGeneral.length < 500 && recentStudent.length < 500
      }
    } });
  } catch (error) {
    return next(error);
  }
}

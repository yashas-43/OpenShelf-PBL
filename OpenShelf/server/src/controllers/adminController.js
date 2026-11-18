import Payment from '../models/Payment.js';
import { fineSummary } from '../services/overdueFines.js';
import { validPricePaise } from '../services/paymentRules.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentPDF from '../models/StudentPDF.js';
import PeerBookListing from '../models/PeerBookListing.js';
import ExchangeRequest from '../models/ExchangeRequest.js';
import PeerListingReport from '../models/PeerListingReport.js';
import Purchase from '../models/Purchase.js';
import Notification from '../models/Notification.js';
import EmailLog from '../models/EmailLog.js';
import AdminAudit from '../models/AdminAudit.js';
import { emailConfigured, deliverEmailLog } from '../services/emailService.js';
import { adminInputError, boundedSearch, escapeRegex, inventoryFromActiveLoans, listOptions, objectIdOrError, validateBookUpdate } from '../validators/adminValidation.js';
import { sameGeneralBook } from '../services/generalBookDuplicates.js';

const ACTIVE = ['requested','approved','borrowed','overdue'];
const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
async function audit(action, targetType, targetId, notes = '') {
  return AdminAudit.create({ action, targetType, targetId: String(targetId), notes });
}

/** All KPI counts are derived from persisted records, never placeholders. */
export async function overview(_req, res, next) {
  try {
    const now = new Date();
    const [users, activeUsers, books, availableBooks, textbooks, publishedTextbooks, pdfs, activeLoans,
      overdueLoans, allBorrowings, peerListings, purchases, completedPurchases, exchangeRequests, failedEmails,
      recentLoans] = await Promise.all([
      User.countDocuments({ archivedAt: null }), User.countDocuments({ isActive: true, archivedAt: null }),
      Book.countDocuments({ isPublished: { $ne: false } }),
      Book.countDocuments({ isPublished: { $ne: false }, availableCopies: { $gt: 0 }, isAvailableForBorrow: true }),
      StudentTextbook.countDocuments({}), StudentTextbook.countDocuments({ isPublished: true }),
      StudentPDF.countDocuments({ isActive: true }),
      Borrowing.countDocuments({ status: { $in: ACTIVE } }),
      Borrowing.countDocuments({ status: { $in: ['borrowed','overdue'] }, returnedAt: null, dueAt: { $lt: now } }),
      Borrowing.countDocuments({}),
      PeerBookListing.countDocuments({ status: { $ne: 'removed' } }),
      Purchase.countDocuments({}), Purchase.countDocuments({ status: 'completed' }),
      ExchangeRequest.countDocuments({ status: 'pending' }),
      EmailLog.countDocuments({ status: { $in: ['failed','not_configured'] } }),
      Borrowing.find({}).sort({ createdAt: -1 }).limit(6)
        .populate('user','fullName').populate('book','title').select('status dueAt createdAt user book').lean()
    ]);
    // Count Student Category physical loans alongside General Books.
    const [studentActiveLoans, studentOverdueLoans, studentAllBorrowings, studentRecentLoans] =
      await Promise.all([
        StudentBorrowing.countDocuments({
          status: { $in: ['borrowed', 'overdue'] }, returnedAt: null
        }),
        StudentBorrowing.countDocuments({
          status: { $in: ['borrowed', 'overdue'] }, returnedAt: null,
          dueAt: { $lt: now }
        }),
        StudentBorrowing.countDocuments(),
        StudentBorrowing.find().sort({ createdAt: -1 }).limit(6)
          .populate('user', 'fullName').populate('textbook', 'level subject')
          .select('status dueAt createdAt user textbook').lean()
      ]);
    res.json({ success: true, data: {
      users, activeUsers, books, availableBooks, textbooks, publishedTextbooks, pdfs,
      activeLoans: activeLoans + studentActiveLoans,
      overdueLoans: overdueLoans + studentOverdueLoans,
      allBorrowings: allBorrowings + studentAllBorrowings,
      peerListings, purchases, completedPurchases,
      exchangeRequests, failedEmails, smtpConfigured: emailConfigured(),
      revenue: { available: true, verifiedPaise: await Payment.aggregate([
        { $match: { status: 'captured' } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }
      ]).then((rows) => rows[0]?.total || 0) },
      recentLoans: [
        ...recentLoans.map((item) => ({
          id: item._id, status: item.status, dueAt: item.dueAt,
          createdAt: item.createdAt,
          bookTitle: item.book?.title || 'Book unavailable',
          borrowerName: item.user?.fullName || 'User unavailable'
        })),
        ...studentRecentLoans.map((item) => ({
          id: item._id, status: item.status, dueAt: item.dueAt,
          createdAt: item.createdAt,
          bookTitle: item.textbook
            ? `${item.textbook.level} · ${item.textbook.subject}`
            : 'Student textbook',
          borrowerName: item.user?.fullName || 'User unavailable'
        }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
    } });
  } catch (error) { next(error); }
}

export async function users(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    // Archived identities are hidden by default; historical loans keep their references.
    const filter = req.query.status === 'archived' ? { archivedAt: { $ne: null } }
      : { archivedAt: null };
    const search = boundedSearch(req.query.search);
    if (search) filter.$or = [
      { fullName: { $regex: escapeRegex(search), $options: 'i' } },
      { email: { $regex: escapeRegex(search), $options: 'i' } }
    ];
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'disabled') filter.isActive = false;
    const [data, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('fullName email phone phoneVerifiedAt role isActive createdAt').lean(), User.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total) });
  } catch (error) { next(error); }
}

export async function setUserStatus(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    if (typeof req.body?.isActive !== 'boolean') throw adminInputError('isActive must be true or false.');
    const update = req.body.isActive ? { $set: { isActive: true } }
      : { $set: { isActive: false }, $inc: { sessionVersion: 1 } };
    const user = await User.findOneAndUpdate({ _id: req.params.id, isActive: !req.body.isActive, role: 'student', archivedAt: null },
      update, { new: true, runValidators: true }).select('fullName email isActive');
    if (!user) throw adminInputError('Account not found or already has the requested status.', 404);
    await audit(req.body.isActive ? 'user_enabled' : 'user_disabled', 'user', user._id);
    res.json({ success: true, message: user.isActive ? 'Account enabled.' : 'Account disabled; existing sessions invalidated.', data: user });
  } catch (error) { next(error); }
}

/** Administrator student-account history includes both physical book collections. */
export async function userBorrowings(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const { page, limit } = listOptions(req.query);
    const filter = { user: req.params.id };
    const needed = page * limit;
    const [general, student, generalTotal, studentTotal] = await Promise.all([
      Borrowing.find(filter).sort({ createdAt: -1 }).limit(needed)
        .populate('book', 'title author').lean(),
      StudentBorrowing.find(filter).sort({ createdAt: -1 }).limit(needed)
        .populate('textbook', 'level subject title').lean(),
      Borrowing.countDocuments(filter),
      StudentBorrowing.countDocuments(filter)
    ]);

    const rows = [
      ...general.map((loan) => ({ ...loan, collection: 'general' })),
      ...student.map((loan) => ({
        ...loan,
        collection: 'student',
        book: loan.textbook ? {
          title: `${loan.textbook.level} · ${loan.textbook.subject}`,
          author: 'Student textbook'
        } : null
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = generalTotal + studentTotal;
    return res.json({
      success: true,
      data: rows.slice((page - 1) * limit, page * limit)
        .map((loan) => ({ ...loan, ...fineSummary(loan) })),
      pagination: paginate(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
}

export async function books(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    const filter = { format: 'physical' };
    const search = boundedSearch(req.query.search);
    if (search) filter.$or = [{ title: { $regex: escapeRegex(search), $options: 'i' } },
      { author: { $regex: escapeRegex(search), $options: 'i' } }];
    if (req.query.visibility === 'published') filter.isPublished = { $ne: false };
    if (req.query.visibility === 'archived') filter.isPublished = false;
    const [data, total] = await Promise.all([
      Book.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Book.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total) });
  } catch (error) { next(error); }
}

/** Prevent re-adding a published physical title under the same author. */
async function rejectDuplicateGeneralBook(details, excludeId = null, session = null) {
  const existing = await Book.find({ format: 'physical', isPublished: { $ne: false } })
    .select('_id title author').session(session).lean();
  if (existing.some((book) => String(book._id) !== String(excludeId || '') && sameGeneralBook(book, details))) {
    throw adminInputError('This title and author already exist in General Books. Update the existing entry instead.', 409);
  }
}

export async function createBook(req, res, next) {
  try {
    const fields = validateBookUpdate(req.body, { creating: true });
    await rejectDuplicateGeneralBook(fields);
    const totalCopies = fields.totalCopies ?? 3;
    const book = await Book.create({ ...fields, totalCopies, availableCopies: totalCopies,
      format: 'physical' });
    await audit('book_created', 'book', book._id);
    res.status(201).json({ success: true, data: book, message: 'Physical General Book added.' });
  } catch (error) { next(error); }
}

export async function editBook(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const fields = validateBookUpdate(req.body);
    const book = await mongoose.connection.transaction(async (session) => {
      const item = await Book.findOne({ _id: req.params.id, format: 'physical' }).session(session);
      if (!item) throw adminInputError('Book not found.', 404);
      if (Object.hasOwn(fields, 'title') || Object.hasOwn(fields, 'author')) {
        await rejectDuplicateGeneralBook({ title: fields.title || item.title, author: fields.author || item.author }, item._id, session);
      }
      if (Object.hasOwn(fields, 'totalCopies')) {
        const activeLoans = await Borrowing.countDocuments({ book: item._id, status: { $in: ACTIVE } }).session(session);
        Object.assign(fields, inventoryFromActiveLoans(fields.totalCopies, activeLoans));
      }
      Object.assign(item, fields);
      await item.save({ session });
      return item;
    });
    await audit('book_updated', 'book', book._id, Object.keys(fields).join(',').slice(0,300));
    res.json({ success: true, data: book, message: 'Book changes saved.' });
  } catch (error) { next(error); }
}

/** Soft-delete avoids orphaned borrowings, saved history and email references. */
export async function archiveBook(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const item = await Book.findOneAndUpdate({ _id: req.params.id, format: 'physical', isPublished: { $ne: false } },
      { $set: { isPublished: false, isAvailableForBorrow: false } }, { new: true });
    if (!item) throw adminInputError('Published book not found.', 404);
    await audit('book_archived', 'book', item._id);
    res.json({ success: true, message: 'Book removed from the public catalogue. Borrowing history remains intact.' });
  } catch (error) { next(error); }
}

export async function textbooks(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query, 80);
    const filter = {};
    if (req.query.level) {
      if (!['Class 8','Class 9','Class 10','1st Puc','2nd Puc'].includes(req.query.level)) throw adminInputError('Unknown study level.');
      filter.level = req.query.level;
    }
    const [data, total] = await Promise.all([
      StudentTextbook.find(filter).sort({ level: 1, subject: 1 }).skip(skip).limit(limit).lean(),
      StudentTextbook.countDocuments(filter)
    ]);
    const counts = await StudentPDF.aggregate([
      { $match: { textbook: { $in: data.map((item) => item._id) }, isActive: true } },
      { $group: { _id: '$textbook', count: { $sum: 1 }, confirmed: { $sum: { $cond: ['$rightsConfirmed', 1, 0] } } } }
    ]);
    const map = new Map(counts.map((item) => [String(item._id), item]));
    res.json({ success: true, data: data.map((item) => ({ ...item,
      pdfCount: map.get(String(item._id))?.count || 0,
      rightsConfirmedCount: map.get(String(item._id))?.confirmed || 0 })),
    pagination: paginate(page, limit, total) });
  } catch (error) { next(error); }
}


export async function editSubjectPrice(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const rupees = req.body?.priceRupees;
    const paise = Number.isFinite(rupees) ? Math.round(rupees * 100) : NaN;
    if (!validPricePaise(paise) || Math.abs(rupees * 100 - paise) > 0.00001) {
      throw adminInputError('Subject price must be at least ₹1 and have at most two decimals.');
    }
    const group = await StudentTextbook.findByIdAndUpdate(req.params.id,
      { $set: { pricePaise: paise } }, { new: true, runValidators: true });
    if (!group) throw adminInputError('Subject not found.', 404);
    await audit('subject_price_updated', 'textbook', group._id, `INR paise: ${paise}`);
    return res.json({ success: true, message: 'New subject price applies only to future purchases.', data: group });
  } catch (error) { next(error); }
}

export async function publishTextbook(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    if (typeof req.body?.isPublished !== 'boolean') throw adminInputError('isPublished must be boolean.');
    const doc = await StudentTextbook.findByIdAndUpdate(req.params.id, { $set: { isPublished: req.body.isPublished } },
      { new: true, runValidators: true });
    if (!doc) throw adminInputError('Textbook not found.', 404);
    await audit(doc.isPublished ? 'textbook_published' : 'textbook_unpublished', 'textbook', doc._id);
    res.json({ success: true, data: doc });
  } catch (error) { next(error); }
}

export async function textbookPdfs(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const data = await StudentPDF.find({ textbook: req.params.id }).sort({ partNumber: 1, filename: 1 })
      .select('filename displayTitle relativePath partNumber sizeBytes rightsConfirmed isActive source createdAt').lean();
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function editPdf(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const allowed = ['rightsConfirmed','isActive','displayTitle'];
    const keys = Object.keys(req.body || {});
    if (!keys.length || keys.some((key) => !allowed.includes(key))) throw adminInputError('Only rightsConfirmed, isActive or displayTitle may be changed.');
    const update = {};
    for (const key of keys) {
      if (key === 'displayTitle') {
        if (typeof req.body[key] !== 'string' || req.body[key].trim().length > 250) throw adminInputError('Display title must have at most 250 characters.');
        update[key] = req.body[key].trim();
      } else {
        if (typeof req.body[key] !== 'boolean') throw adminInputError(`${key} must be boolean.`);
        update[key] = req.body[key];
      }
    }
    const doc = await StudentPDF.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true })
      .select('filename displayTitle partNumber rightsConfirmed isActive');
    if (!doc) throw adminInputError('Student PDF not found.', 404);
    await audit('student_pdf_updated', 'pdf', doc._id, keys.join(','));
    res.json({ success: true, data: doc });
  } catch (error) { next(error); }
}

export async function emailLogs(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    const filter = {};
    if (['pending','sending','sent','failed','not_configured'].includes(req.query.status)) filter.status = req.query.status;
    const [data, total] = await Promise.all([
      EmailLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('kind status attempts lastAttemptAt sentAt lastErrorCode createdAt nextAttemptAt user')
        .populate('user', 'email fullName').lean(), EmailLog.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total), smtpConfigured: emailConfigured() });
  } catch (error) { next(error); }
}

export async function purchases(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    const [data, total] = await Promise.all([
      Purchase.find().sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('user', 'fullName email phone').populate('payment', 'amountPaise currency orderId status')
        .select('user itemType itemId status completedAt createdAt payment').lean(),
      Purchase.countDocuments({})
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total),
      warning: 'Payments displayed here are historical or Razorpay TEST transactions; they are not real revenue.' });
  } catch (error) { next(error); }
}

export async function peerListings(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    const [data, total] = await Promise.all([
      PeerBookListing.find().sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('owner', 'fullName email').lean(), PeerBookListing.countDocuments({})
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total),
      warning: 'All new and edited peer listings require administrator approval before public discovery.' });
  } catch (error) { next(error); }
}

/** Moderation gate: no peer book is discoverable until the admin approves it. */
export async function reviewPeerListing(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const action = req.body?.action;
    if (!['approve', 'reject'].includes(action)) throw adminInputError('Choose approve or reject.');
    const note = String(req.body?.note || '').trim();
    if (note.length > 300) throw adminInputError('Review note is too long.');
    const item = await PeerBookListing.findOneAndUpdate({
      _id: req.params.id, status: { $in: ['available', 'unavailable'] },
      approvalStatus: { $in: ['pending', null] }
    }, { $set: { approvalStatus: action === 'approve' ? 'approved' : 'rejected',
      reviewedAt: new Date(), reviewNote: note } }, { new: true, runValidators: true });
    if (!item) throw adminInputError('Listing is no longer pending or cannot be reviewed.', 409);
    await audit(action === 'approve' ? 'peer_listing_approved' : 'peer_listing_rejected',
      'peer_listing', item._id, note);
    await Notification.create([{ user: item.owner, title: action === 'approve' ? 'Book listing approved' : 'Book listing needs changes',
      message: action === 'approve' ? `Your listing "${item.title}" is now eligible for public discovery.`
        : `Your listing "${item.title}" was rejected. Edit and resubmit it for review.${note ? ` Reason: ${note}` : ''}` }]).catch(() => {});
    res.json({ success: true, message: `Listing ${action === 'approve' ? 'approved' : 'rejected'}.`,
      data: { id: item._id, approvalStatus: item.approvalStatus } });
  } catch (error) { next(error); }
}

export async function hidePeerListing(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const item = await PeerBookListing.findOneAndUpdate({ _id: req.params.id, status: { $ne: 'removed' } },
      { $set: { status: 'removed' } }, { new: true });
    if (!item) throw adminInputError('Visible listing not found.', 404);
    await ExchangeRequest.updateMany({ listing: item._id, status: { $in: ['pending', 'accepted'] } }, { $set: { status: 'cancelled' } });
    await audit('peer_listing_removed', 'peer_listing', item._id);
    res.json({ success: true, message: 'Listing removed from future public discovery.' });
  } catch (error) { next(error); }
}

export async function activity(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    const [data, total] = await Promise.all([
      AdminAudit.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAudit.countDocuments({})
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total) });
  } catch (error) { next(error); }
}


/** Requeue only safe delivery types; never replay a password-reset OTP. */
export async function retryEmail(req,res,next) {
  try {
    objectIdOrError(req.params.id);
    if(!emailConfigured()) throw adminInputError('Configure SMTP in server/.env before retrying email.',503);
    const log=await EmailLog.findOneAndUpdate({
      _id:req.params.id, kind:{$ne:'password_reset_code'},
      status:{$in:['failed','not_configured']}
    },{$set:{status:'pending',attempts:0,nextAttemptAt:new Date(),lastErrorCode:null}},
    {new:true}).select('_id');
    if(!log)throw adminInputError('Email is already sent/processing, or cannot safely be retried.',409);
    const result=await deliverEmailLog(log._id);
    await audit('email_manual_retry','email_log',log._id,result.status);
    res.json({success:true,data:{id:log._id,status:result.status},
      message:result.status==='sent'?'SMTP accepted the message.':`Retry attempted: ${result.status}. Review the delivery log.`});
  }catch(error){next(error);}
}

/** Operational report from persisted loans; no payment revenue or synthetic metrics. */
export async function borrowingReport(_req, res, next) {
  try {
    const now = new Date();
    const open = { status: { $in: ['borrowed', 'overdue'] }, returnedAt: null };
    const overdueFilter = { ...open, dueAt: { $lt: now } };
    const [generalByStatus, studentByStatus, generalOverdue, studentOverdue,
      generalOpen, studentOpen, generalReturned, studentReturned,
      generalOverdueTotal, studentOverdueTotal] = await Promise.all([
      Borrowing.aggregate([{ $group: { _id: '$status', total: { $sum: 1 } } }]),
      StudentBorrowing.aggregate([{ $group: { _id: '$status', total: { $sum: 1 } } }]),
      Borrowing.find(overdueFilter).sort({ dueAt: 1 }).limit(100)
        .populate('user', 'fullName email phone').populate('book', 'title').lean(),
      StudentBorrowing.find(overdueFilter).sort({ dueAt: 1 }).limit(100)
        .populate('user', 'fullName email phone').populate('textbook', 'level subject').lean(),
      Borrowing.countDocuments(open),
      StudentBorrowing.countDocuments(open),
      Borrowing.countDocuments({ status: 'returned' }),
      StudentBorrowing.countDocuments({ status: 'returned' }),
      Borrowing.countDocuments(overdueFilter),
      StudentBorrowing.countDocuments(overdueFilter)
    ]);

    const statusMap = new Map();
    for (const item of [...generalByStatus, ...studentByStatus]) {
      statusMap.set(item._id, (statusMap.get(item._id) || 0) + item.total);
    }
    const byStatus = [...statusMap].map(([_id, total]) => ({ _id, total }));
    const overdue = [
      ...generalOverdue.map((loan) => ({ ...loan, bookTitle: loan.book?.title || 'Book' })),
      ...studentOverdue.map((loan) => ({
        ...loan,
        bookTitle: loan.textbook
          ? `${loan.textbook.level} · ${loan.textbook.subject}` : 'Student textbook'
      }))
    ].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 100);

    return res.json({
      success: true,
      data: {
        byStatus,
        checkedOut: generalOpen + studentOpen,
        returned: generalReturned + studentReturned,
        overdueTotal: generalOverdueTotal + studentOverdueTotal,
        overdue: overdue.map((loan) => ({
          id: loan._id,
          student: loan.user?.fullName || 'Unknown',
          email: loan.user?.email || '',
          phone: loan.user?.phone || null,
          ...fineSummary(loan, now),
          title: loan.bookTitle,
          dueAt: loan.dueAt
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

/** Phase 13: reports contain real user submissions, never simulated moderation items. */
export async function peerReports(req, res, next) {
  try {
    const { page, limit, skip } = listOptions(req.query);
    const filter = req.query.status === 'resolved' ? { status: 'resolved' } : { status: 'open' };
    const [data, total] = await Promise.all([
      PeerListingReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('listing', 'title status').populate('reporter', 'fullName').lean(),
      PeerListingReport.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: paginate(page, limit, total) });
  } catch (error) { next(error); }
}
export async function resolvePeerReport(req, res, next) {
  try {
    objectIdOrError(req.params.id);
    const item = await PeerListingReport.findOneAndUpdate({ _id: req.params.id, status: 'open' },
      { $set: { status: 'resolved', resolvedAt: new Date() } }, { new: true });
    if (!item) throw adminInputError('Open report not found.', 404);
    await audit('peer_report_resolved', 'peer_report', item._id);
    res.json({ success: true, message: 'Report resolved.' });
  } catch (error) { next(error); }
}

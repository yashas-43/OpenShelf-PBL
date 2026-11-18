import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Purchase from '../models/Purchase.js';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentPDF from '../models/StudentPDF.js';
import { inspectStoredPdfFile, textbookRoot } from './studentPdfFiles.js';
import { classifySubjectPdfBundle } from './subjectPdfBundle.js';
import { confirmedCapturedPayment } from './paymentRules.js';
import { razorpayRequest } from './razorpayClient.js';
import DemoCheckout from '../models/DemoCheckout.js';
import { demoModeEnabled } from './demoCheckoutRules.js';
import { queueEmail } from './emailService.js';

export async function hasSubjectAccess(userId, textbookId) {
  if (await Purchase.exists({ user: userId, itemType: 'student_textbook',
    itemId: textbookId, status: 'completed' })) return true;
  // Demo access is separate from actual purchases and never honoured in production.
  return demoModeEnabled() && Boolean(await DemoCheckout.exists({ user: userId, textbook: textbookId, status: 'completed' }));
}

export async function createSubjectOrder(userId, textbookId) {
  if (!mongoose.isValidObjectId(textbookId)) return { status: 400, message: 'Invalid subject.' };
  const subject = await StudentTextbook.findOne({ _id: textbookId, isPublished: true }).lean();
  if (!subject) return { status: 404, message: 'Subject not found.' };
  if (await hasSubjectAccess(userId, textbookId)) return { alreadyOwned: true, subjectId: textbookId };
  const records = await StudentPDF.find({ textbook: textbookId, isActive: true }).lean();
  const bundle = classifySubjectPdfBundle(records);
  if (!bundle.ready) return { status: 409, message: 'An authorised, complete PDF textbook (including all parts) must be uploaded before checkout is available.' };
  try { await Promise.all(bundle.parts.map((pdf) => inspectStoredPdfFile(textbookRoot(), pdf))); }
  catch { return { status: 503, message: 'At least one textbook PDF part is unavailable on this server. Payment has not started.' }; }
  const amount = 1000; // INR 10.00, fixed on the server regardless of DB/client values.
  // Earlier versions used ₹1 orders. They must NEVER be silently reused for ₹10 access.
  const existing = await Payment.findOne({ user: userId, textbook: textbookId, status: 'pending' }).sort({ createdAt: -1 }).lean();
  if (existing?.amountPaise === amount) return { orderId: existing.orderId, amount, subjectId: textbookId };
  if (existing) await Payment.updateOne({ _id: existing._id, status: 'pending' }, { $set: { status: 'failed' } });
  const external = await razorpayRequest('POST', '/orders', {
    amount, currency: 'INR', receipt: `os_${new mongoose.Types.ObjectId().toString()}`,
    notes: { purpose: 'openshelf_subject', subjectId: String(subject._id) }
  });
  if (!external?.id || external.amount !== amount || external.currency !== 'INR') {
    const error = new Error('Unexpected Razorpay order response.'); error.status = 502; throw error;
  }
  try {
    await Payment.create({ user: userId, textbook: textbookId, orderId: external.id, amountPaise: amount });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const concurrent = await Payment.findOne({ user: userId, textbook: textbookId, status: 'pending' }).lean();
    if (!concurrent) throw error;
    return { orderId: concurrent.orderId, amount: concurrent.amountPaise, subjectId: textbookId };
  }
  return { orderId: external.id, amount, subjectId: textbookId };
}

/** Even a signed browser callback is not enough: check captured payment and paid order at Razorpay. */
export async function reconcileCapturedPayment(stored, reportedPaymentId) {
  if (!/^pay_[A-Za-z0-9]+$/.test(String(reportedPaymentId))) return { status: 400, message: 'Invalid payment identifier.' };
  if (stored.amountPaise !== 1000) return { status: 409, message: 'This order has an outdated amount. Create a new ₹10 test order.' };
  if (stored.status === 'captured') {
    if (stored.paymentId !== reportedPaymentId) return { status: 409, message: 'Order already settled with another payment.' };
    return { completed: true, alreadyProcessed: true };
  }
  const [payment, order] = await Promise.all([
    razorpayRequest('GET', `/payments/${encodeURIComponent(reportedPaymentId)}`),
    razorpayRequest('GET', `/orders/${encodeURIComponent(stored.orderId)}`)
  ]);
  if (!confirmedCapturedPayment(payment, order, stored)) {
    await Payment.updateOne({ _id: stored._id }, { $set: { lastCheckedAt: new Date() } });
    return { status: 409, message: 'Payment has not been verified as captured. Refresh the status later.' };
  }
  await mongoose.connection.transaction(async (session) => {
    const current = await Payment.findById(stored._id).session(session);
    if (!current) throw new Error('Payment record missing.');
    if (current.status === 'captured') {
      if (current.paymentId !== reportedPaymentId) throw new Error('Payment/order mismatch.');
      return;
    }
    const alreadyPaid = await Purchase.findOne({ user: current.user, itemType: 'student_textbook',
      itemId: current.textbook, status: 'completed' }).session(session);
    current.paymentId = reportedPaymentId;
    current.status = 'captured';
    current.capturedAt = new Date();
    current.lastCheckedAt = new Date();
    await current.save({ session });
    if (!alreadyPaid) {
      await Purchase.create([{ user: current.user, itemType: 'student_textbook', itemId: current.textbook,
        status: 'completed', completedAt: current.capturedAt, payment: current._id }], { session });

    }
  });
  // Email delivery/logging must never roll back a verified, captured purchase.
  // The unique outbox event key makes retries safe.
  try {
    const subject = await StudentTextbook.findById(stored.textbook).select('level subject').lean();
    await queueEmail({ userId: stored.user, kind: 'purchase_confirmed',
      eventKey: `purchase-confirmed:${stored._id}`,
      details: { bookTitle: subject ? `${subject.level} · ${subject.subject}` : 'your textbook subject',
        amountPaise: stored.amountPaise } });
  } catch {
    // Access is already committed; administrators can inspect/retry delivery separately.
  }
  return { completed: true };
}

/** Recover captured payments if the browser closed or a webhook was delayed.
 * This is a bounded, server-to-server check; no frontend claims are trusted. */
export async function refreshPendingSubjectPayments(userId, maxOrders = 5) {
  const pending = await Payment.find({ user: userId, status: 'pending' })
    .sort({ createdAt: -1 }).limit(maxOrders);
  for (const record of pending) {
    try {
      const result = await razorpayRequest('GET', `/orders/${encodeURIComponent(record.orderId)}/payments`);
      const captured = result.items?.find((item) => item.status === 'captured' &&
        item.order_id === record.orderId && item.amount === record.amountPaise);
      if (captured) await reconcileCapturedPayment(record, captured.id);
    } catch {
      // Do not claim failure or refund when the provider is temporarily unreachable.
      // The signed webhook/next API request can reconcile this order later.
    }
  }
}

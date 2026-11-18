import Payment from '../models/Payment.js';
import Purchase from '../models/Purchase.js';
import StudentTextbook from '../models/StudentTextbook.js';
import { createSubjectOrder, hasSubjectAccess, reconcileCapturedPayment, refreshPendingSubjectPayments } from '../services/paymentService.js';
import { paymentsConfigured, razorpayRequest } from '../services/razorpayClient.js';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../services/paymentRules.js';
import { deliverEmailByEvent } from '../services/emailService.js';
import { demoModeEnabled } from '../services/demoCheckoutRules.js';

const failure = (res, status, message) => res.status(status).json({ success: false, message });
export function config(_req, res) {
  res.json({ success: true, enabled: !demoModeEnabled() && paymentsConfigured(), keyId: !demoModeEnabled() && paymentsConfigured() ? process.env.RAZORPAY_KEY_ID : null,
    mode: demoModeEnabled() ? 'demo' : 'test' });
}
export async function createOrder(req, res, next) {
  try {
    if (demoModeEnabled()) return failure(res, 503, 'Razorpay checkout is paused while demo QR mode is enabled.');
    if (!paymentsConfigured()) return failure(res, 503, 'Razorpay test keys are required to enable subject payments.');
    if (req.body?.itemType !== 'student_subject') return failure(res, 400, 'Only Student Category subject purchases are supported here.');
    const result = await createSubjectOrder(req.auth.sub, req.body?.subjectId);
    if (result.status) return failure(res, result.status, result.message);
    return res.json({ success: true, ...result, keyId: process.env.RAZORPAY_KEY_ID, currency: 'INR' });
  } catch (error) { next(error); }
}
export async function verifyPayment(req, res, next) {
  try {
    const orderId = String(req.body?.razorpay_order_id || '');
    const paymentId = String(req.body?.razorpay_payment_id || '');
    const signature = String(req.body?.razorpay_signature || '');
    const stored = await Payment.findOne({ orderId, user: req.auth.sub });
    if (!stored || !verifyCheckoutSignature(stored.orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) {
      return failure(res, 400, 'Invalid payment verification data.');
    }
    const result = await reconcileCapturedPayment(stored, paymentId);
    if (result.status) return failure(res, result.status, result.message);
    if (!result.alreadyProcessed) deliverEmailByEvent(`purchase-confirmed:${stored._id}`).catch(() => {});
    return res.json({ success: true, message: 'Razorpay confirmed payment and your subject has been unlocked.', ...result });
  } catch (error) { next(error); }
}
export async function orderStatus(req, res, next) {
  try {
    let order = await Payment.findOne({ orderId: req.params.orderId, user: req.auth.sub }).lean();
    if (!order) return failure(res, 404, 'Order not found.');
    if (order.status === 'pending' && paymentsConfigured()) {
      await refreshPendingSubjectPayments(req.auth.sub);
      order = await Payment.findById(order._id).lean();
    }
    return res.json({ success: true, status: order.status, owned: await hasSubjectAccess(req.auth.sub, order.textbook) });
  } catch (error) { next(error); }
}
export async function myPayments(req, res, next) {
  try {
    if (paymentsConfigured()) await refreshPendingSubjectPayments(req.auth.sub);
    const records = await Payment.find({ user: req.auth.sub }).sort({ createdAt: -1 }).limit(100)
      .populate('textbook', 'level subject title').lean();
    res.json({ success: true, data: records.map((record) => ({ id: record._id, textbook: record.textbook,
      orderId: record.orderId, amountPaise: record.amountPaise, status: record.status,
      createdAt: record.createdAt, capturedAt: record.capturedAt })) });
  } catch (error) { next(error); }
}
export async function myPurchases(req, res, next) {
  try {
    // Purchased entitlements remain readable even if Razorpay is offline.
    // Reconciliation is done through checkout verification or the order-status endpoint.
    const records = await Purchase.find({ user: req.auth.sub, itemType: 'student_textbook', status: 'completed' })
      .sort({ completedAt: -1 }).limit(100).lean();
    const subjects = await StudentTextbook.find({ _id: { $in: records.map((record) => record.itemId) } }).select('level subject title').lean();
    const byId = new Map(subjects.map((item) => [String(item._id), item]));
    res.json({ success: true, data: records.map((record) => ({ subjectId: record.itemId,
      subject: byId.get(String(record.itemId)) || null, completedAt: record.completedAt })) });
  } catch (error) { next(error); }
}
export async function webhook(req, res, next) {
  try {
    if (!verifyWebhookSignature(req.body, req.headers['x-razorpay-signature'], process.env.RAZORPAY_WEBHOOK_SECRET)) {
      return failure(res, 401, 'Invalid webhook signature.');
    }
    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event !== 'payment.captured' && event.event !== 'order.paid') return res.json({ success: true, ignored: true });
    const entity = event.payload?.payment?.entity;
    const orderId = entity?.order_id || event.payload?.order?.entity?.id;
    if (typeof orderId !== 'string') return res.json({ success: true, ignored: true });
    const stored = await Payment.findOne({ orderId });
    if (!stored) return res.json({ success: true, ignored: true });
    // For order.paid events, use the payment identifier only if present; payment.captured carries it.
    let paymentId = entity?.id;
    if (!paymentId && event.event === 'order.paid') {
      const payments = await razorpayRequest('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
      paymentId = payments.items?.find((item) => item.status === 'captured' && item.order_id === orderId)?.id;
    }
    if (!paymentId) return res.json({ success: true, ignored: true });
    const result = await reconcileCapturedPayment(stored, paymentId);
    if (result.status) return failure(res, 503, 'Payment reconciliation remains pending.');
    if (!result.alreadyProcessed) deliverEmailByEvent(`purchase-confirmed:${stored._id}`).catch(() => {});
    return res.json({ success: true, processed: true });
  } catch (error) { next(error); }
}

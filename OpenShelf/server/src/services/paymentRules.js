import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_SUBJECT_PRICE_PAISE = 1000; // Fixed ₹10 for all student subjects.
export function validPricePaise(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= 10_000_000;
}
export function constantTimeHexEqual(expected, actual) {
  if (!/^[a-f\d]{64}$/i.test(String(actual))) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}
export function verifyCheckoutSignature(orderId, paymentId, signature, keySecret) {
  if (!orderId || !paymentId || !keySecret) return false;
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return constantTimeHexEqual(expected, signature);
}
export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!webhookSecret || !Buffer.isBuffer(rawBody)) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return constantTimeHexEqual(expected, signature);
}
export function confirmedCapturedPayment(payment, order, stored) {
  return payment?.status === 'captured' && payment.captured === true &&
    payment.order_id === stored.orderId && payment.amount === stored.amountPaise &&
    payment.currency === 'INR' && order?.id === stored.orderId && order.status === 'paid' &&
    order.amount === stored.amountPaise && order.currency === 'INR';
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { normalizeIndianPhone, createRegistrationOtp, otpDigest, matchesOtp } from '../services/registrationOtpRules.js';
import { DEFAULT_SUBJECT_PRICE_PAISE, validPricePaise, verifyCheckoutSignature,
  verifyWebhookSignature, confirmedCapturedPayment } from '../services/paymentRules.js';
import { FLAT_LATE_FINE_PAISE, overdueFinePaise, fineSummary } from '../services/overdueFines.js';

const secret = 'super-secret-very-long-random-otp-key-1234567890';

test('registration contact phone requires exactly ten Indian mobile digits', () => {
  for (const valid of ['9876543210', '6000000000', '7000000000']) assert.equal(normalizeIndianPhone(valid), valid);
  for (const invalid of ['987654321', '0987654321', '+919876543210', '1234567890', '98765 43210', 'abcdefghij']) assert.equal(normalizeIndianPhone(invalid), null);
});

test('registration email OTP generation is always exactly six digits', () => {
  for (let i=0;i<100;i++) assert.match(createRegistrationOtp(), /^[0-9]{6}$/);
});

test('OTP hashes bind the code to a unique challenge and reject wrong codes safely', () => {
  const digest = otpDigest('challenge-1', '000042', secret);
  assert.equal(matchesOtp(digest, 'challenge-1', '000042', secret), true);
  assert.equal(matchesOtp(digest, 'challenge-2', '000042', secret), false);
  assert.equal(matchesOtp(digest, 'challenge-1', '000043', secret), false);
  assert.equal(matchesOtp('bad', 'challenge-1', '000042', secret), false);
});

test('Razorpay ₹10 defaults to 1000 integer paise and rejects fractional prices', () => {
  assert.equal(DEFAULT_SUBJECT_PRICE_PAISE, 1000);
  assert.equal(validPricePaise(100), true);
  assert.equal(validPricePaise(500), true);
  for (const value of [0, 1, -100, 99, 100.5, '100', Infinity]) assert.equal(validPricePaise(value), false);
});

test('Razorpay checkout signature must match the stored order ID and payment ID', () => {
  const key='test-secret-key';
  const sig=createHmac('sha256',key).update('order_123|pay_456').digest('hex');
  assert.equal(verifyCheckoutSignature('order_123','pay_456',sig,key),true);
  assert.equal(verifyCheckoutSignature('order_other','pay_456',sig,key),false);
  assert.equal(verifyCheckoutSignature('order_123','pay_456','a'.repeat(64),key),false);
});

test('webhook requires HMAC over raw JSON bytes, not parsed text', () => {
  const body=Buffer.from('{"event":"payment.captured"}');
  const sig=createHmac('sha256','webhook-key').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body,sig,'webhook-key'),true);
  assert.equal(verifyWebhookSignature(Buffer.from('{}'),sig,'webhook-key'),false);
  assert.equal(verifyWebhookSignature(body,sig,''),false);
});

test('payment grants access only after actual captured payment and paid matching order', () => {
  const stored={ orderId:'order_123', amountPaise:100 };
  const payment={order_id:'order_123',amount:100,currency:'INR',status:'captured',captured:true};
  const order={id:'order_123',status:'paid',amount:100,currency:'INR'};
  assert.equal(confirmedCapturedPayment(payment,order,stored),true);
  assert.equal(confirmedCapturedPayment({...payment,status:'authorized'},order,stored),false);
  assert.equal(confirmedCapturedPayment({...payment,amount:200},order,stored),false);
  assert.equal(confirmedCapturedPayment(payment,{...order,status:'created'},stored),false);
});

test('overdue fine is a fixed ₹10 for any late physical return', () => {
  const issuedAt=new Date('2026-11-01T00:00:00Z');
  const dueAt=new Date('2026-11-15T00:00:00Z');
  assert.equal(FLAT_LATE_FINE_PAISE,1000);
  const loan={issuedAt,dueAt,returnedAt:null};
  assert.equal(overdueFinePaise(loan,new Date('2026-11-14T23:59:00Z')),0);
  assert.equal(overdueFinePaise(loan,dueAt),0);
  assert.equal(overdueFinePaise(loan,new Date('2026-11-15T00:00:01Z')),1000);
  assert.equal(overdueFinePaise(loan,new Date('2026-11-16T00:00:01Z')),1000);
  assert.equal(overdueFinePaise({dueAt},new Date('2026-12-01T00:00:00Z')),0);
});

test('returned loan fine is fixed and payment reduces outstanding, never below zero', () => {
  const loan={issuedAt:new Date('2026-11-01T00:00:00Z'),dueAt:new Date('2026-11-10T00:00:00Z'),
    returnedAt:new Date('2026-11-12T00:00:00Z'),fineAssessedPaise:1000,finePaidPaise:500};
  assert.deepEqual(fineSummary(loan,new Date('2026-12-01T00:00:00Z')),{fineAmountPaise:1000,fineOutstandingPaise:500,fineFlatPaise:1000});
  assert.equal(fineSummary({...loan,finePaidPaise:5000}).fineOutstandingPaise,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paymentsConfigured } from '../services/razorpayClient.js';
import { DEFAULT_SUBJECT_PRICE_PAISE } from '../services/paymentRules.js';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const source = (path) => readFileSync(resolve(root, path), 'utf8');
test('classroom payment settings always reject live keys and require test credentials', () => {
  const oldId = process.env.RAZORPAY_KEY_ID, oldSecret = process.env.RAZORPAY_KEY_SECRET;
  try {
    process.env.RAZORPAY_KEY_SECRET = 'test-secret';
    process.env.RAZORPAY_KEY_ID = 'rzp_live_testplaceholder';
    assert.equal(paymentsConfigured(), false);
    process.env.RAZORPAY_KEY_ID = 'rzp_test_testplaceholder';
    assert.equal(paymentsConfigured(), true);
    assert.equal(DEFAULT_SUBJECT_PRICE_PAISE, 1000);
  } finally {
    if (oldId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = oldId;
    if (oldSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = oldSecret;
  }
});
test('Express activates only student payment routes; verifies captured amount on server', () => {
  const app = source('server/src/app.js');
  const service = source('server/src/services/paymentService.js');
  assert.match(app, /app\.use\('\/api\/payments', paymentRoutes\)/);
  assert.match(service, /const amount = 1000/);
  assert.match(service, /stored\.amountPaise !== 1000/);
  assert.match(service, /reconcileCapturedPayment/);
  assert.doesNotMatch(app, /PAYMENTS_DISABLED/);
});
test('PDF endpoints require verified subject access for both ticket and byte streams', () => {
  const c = source('server/src/controllers/studentPdfController.js');
  const ui = source('client/src/pages/StudentLibrary.jsx');
  assert.match(c, /hasSubjectAccess\(req\.auth\.sub, result\.group\._id\)/);
  assert.match(c, /hasSubjectAccess\(access\.sub, result\.group\._id\)/);
  assert.match(c, /rightsConfirmed/);
  assert.match(ui, /Buy Access — ₹10 Demo QR/);
  assert.match(ui, /\/api\/demo-checkout\/complete/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { demoModeEnabled, demoReadyForCompletion, DEMO_DELAY_MS, DEMO_PRICE_PAISE } from '../services/demoCheckoutRules.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const source = path => readFileSync(resolve(root, path), 'utf8');

test('demo checkout is opt-in and never enabled in production', () => {
  assert.equal(demoModeEnabled({ NODE_ENV: 'development', DEMO_QR_ENABLED: 'true' }), true);
  assert.equal(demoModeEnabled({ NODE_ENV: 'test', DEMO_QR_ENABLED: 'true' }), true);
  assert.equal(demoModeEnabled({ NODE_ENV: 'production', DEMO_QR_ENABLED: 'true' }), false);
  assert.equal(demoModeEnabled({ NODE_ENV: 'development', DEMO_QR_ENABLED: 'false' }), false);
  assert.equal(demoModeEnabled({ DEMO_QR_ENABLED: 'true' }), false);
});
test('server-enforced time and amount are fixed for classroom checkout', () => {
  assert.equal(DEMO_PRICE_PAISE, 1000);
  assert.equal(DEMO_DELAY_MS, 2000);
  assert.equal(demoReadyForCompletion(new Date(3000), 4999), false);
  assert.equal(demoReadyForCompletion(new Date(3000), 5000), true);
  assert.equal(demoReadyForCompletion('invalid', 5000), false);
});
test('separate demo model prevents showing fake Razorpay captured transactions', () => {
  const service = source('server/src/services/demoCheckoutService.js');
  const paymentService = source('server/src/services/paymentService.js');
  assert.match(service, /DemoCheckout\.findOneAndUpdate/);
  assert.match(service, /classifySubjectPdfBundle/);
  assert.match(service, /inspectStoredPdfFile/);
  assert.doesNotMatch(service, /razorpayRequest|Payment\.create|Purchase\.create/);
  assert.match(paymentService, /demoModeEnabled\(\)/);
  assert.match(paymentService, /DemoCheckout\.exists/);
});
test('PDF access is checked server-side on reader tickets and streams', () => {
  const c = source('server/src/controllers/studentPdfController.js');
  assert.match(c, /hasSubjectAccess\(req\.auth\.sub, result\.group\._id\)/);
  assert.match(c, /hasSubjectAccess\(access\.sub, result\.group\._id\)/);
  assert.match(c, /rightsConfirmed/);
});
test('frontend displays non-payable QR and never opens Razorpay', () => {
  const ui = source('client/src/pages/StudentLibrary.jsx');
  const html = source('client/index.html');
  assert.match(ui, /demo-checkout-qr\.svg/);
  assert.match(ui, /Buy Access — ₹10 Demo QR/);
  assert.match(ui, /\/api\/demo-checkout\/start/);
  assert.match(ui, /\/api\/demo-checkout\/complete/);
  assert.doesNotMatch(ui, /window\.Razorpay|\/api\/payments\/orders/);
  assert.doesNotMatch(html, /checkout\.razorpay\.com/);
  assert.match(ui, /\[demoCheckout\?\.id\]/); // Stage transitions must not cancel completion.
  assert.match(ui, /Promise\.allSettled/); // Persist subject access across refresh.
});

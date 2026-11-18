import test from 'node:test';
import assert from 'node:assert/strict';
import { upiPreferredCheckoutConfig, razorpayFailureMessage } from './razorpayCheckout.js';

test('UPI is preferred but other Razorpay payment methods remain visible', () => {
  const { display } = upiPreferredCheckoutConfig();
  assert.equal(display.blocks.preferred_upi.instruments[0].method, 'upi');
  assert.deepEqual(display.sequence, ['block.preferred_upi', 'card', 'netbanking', 'wallet']);
  assert.equal(display.preferences.show_default_blocks, true);
  assert.equal('hide' in display, false); // Don't pass unsupported flow filters.
});

test('Razorpay provider failure details are visible', () => {
  const result = razorpayFailureMessage({error:{code:'BAD_REQUEST_ERROR', description:'Bank is temporarily unavailable', source:'bank', step:'payment_authorization', reason:'gateway_failure'}});
  assert.match(result,/Bank is temporarily unavailable/);
  assert.match(result,/Reason: gateway_failure/);
  assert.match(result,/Source: bank/);
  assert.match(result,/check payment status/i);
});

test('Unknown failure is handled without crashing or exposing metadata', () => {
  const result = razorpayFailureMessage({ error: {metadata: {payment_id:'pay_secret'} } });
  assert.match(result,/Test payment failed/);
  assert.doesNotMatch(result,/pay_secret/);
  assert.match(razorpayFailureMessage(null),/not complete this attempt/);
});

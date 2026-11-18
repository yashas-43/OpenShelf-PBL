import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMail, buildOtpMail, escapeHtml } from '../services/emailTemplates.js';
import {
  OTP_COOLDOWN_SECONDS, OTP_MAX_ATTEMPTS, OTP_VALID_MINUTES,
  generateOtp, hashSecret, newChallengeId, newResetToken, securelyEquals, validPassword
} from '../services/passwordResetRules.js';
import { borrowingEventKey } from '../services/emailEventKeys.js';

const user = { fullName: '<Reader & Friend>', email: 'student@example.com' };

test('HTML mail templates escape untrusted account names and book titles', () => {
  const mail = buildMail('borrow_checkout', user, { bookTitle: '<img src=x onerror=alert(1)>', dueAt: '2026-11-29T10:00:00.000Z' });
  assert.match(mail.subject, /checked out/i);
  assert.match(mail.html, /&lt;Reader &amp; Friend&gt;/);
  assert.ok(!mail.html.includes('<img src=x'));
  assert.match(mail.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(mail.text, /2026/);
});

test('all email kinds supported by the outbox render a title and text', () => {
  for (const kind of ['registration','password_changed','borrow_checkout','borrow_approved','borrow_rejected',
    'borrow_issued','borrow_returned','extension_approved','extension_rejected','due_soon','overdue']) {
    const mail = buildMail(kind, user, { bookTitle: 'Example', dueAt: '2026-11-29T10:00:00.000Z' });
    assert.ok(mail.subject && mail.text && mail.html, kind);
    assert.match(mail.html, /OpenShelf/);
  }
  assert.throws(() => buildMail('purchase', user), /Unrecognized/);
});

test('OTP template includes transient code only in the outgoing body', () => {
  const mail = buildOtpMail(user, '000217');
  assert.match(mail.text, /000217/);
  assert.match(mail.html, /000217/);
  assert.match(mail.html, /&lt;Reader &amp; Friend&gt;/);
});

test('OTP generation is six decimal digits including leading zeros', () => {
  for (let i = 0; i < 150; i += 1) assert.match(generateOtp(), /^\d{6}$/);
  assert.equal(OTP_VALID_MINUTES, 10);
  assert.equal(OTP_MAX_ATTEMPTS, 5);
  assert.equal(OTP_COOLDOWN_SECONDS, 60);
});

test('reset codes and tokens use keyed hashes scoped to user, kind and challenge', () => {
  const before = process.env.RESET_TOKEN_SECRET;
  process.env.RESET_TOKEN_SECRET = 'some-random-separate-secret-with-more-than-32-characters';
  try {
    const challenge = newChallengeId();
    const code = generateOtp();
    const token = newResetToken();
    assert.match(challenge, /^[a-f\d]{32}$/);
    assert.match(token, /^[a-f\d]{64}$/);
    const a = hashSecret('otp', 'alice', challenge, code);
    assert.match(a, /^[a-f\d]{64}$/);
    assert.ok(securelyEquals(a, hashSecret('otp', 'alice', challenge, code)));
    assert.ok(!securelyEquals(a, hashSecret('otp', 'bob', challenge, code)));
    assert.ok(!securelyEquals(a, hashSecret('reset-token', 'alice', challenge, code)));
    assert.ok(!securelyEquals(a, hashSecret('otp', 'alice', challenge + 'x', code)));
  } finally {
    if (before === undefined) delete process.env.RESET_TOKEN_SECRET;
    else process.env.RESET_TOKEN_SECRET = before;
  }
});

test('password format and event key rules reject invalid values', () => {
  assert.equal(validPassword('1234567'), false);
  assert.equal(validPassword('12345678'), true);
  assert.equal(validPassword('x'.repeat(73)), false);
  assert.equal(validPassword(123), false);
  assert.equal(borrowingEventKey('due_soon', 'abc', '2026-11-29'), 'due_soon:abc:2026-11-29');
  assert.equal(escapeHtml('A&B'), 'A&amp;B');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeIndianPhone, createRegistrationOtp, otpDigest, matchesOtp,
  REGISTRATION_OTP_COOLDOWN_MS, REGISTRATION_OTP_MAX_ATTEMPTS, REGISTRATION_OTP_TTL_MS } from '../services/registrationOtpRules.js';
import { buildRegistrationOtpMail } from '../services/emailTemplates.js';

const secret = 'separate-long-registration-key-for-email-otp-12345';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('registration retains shared 10-digit phone numbers but validates email OTP', () => {
  assert.equal(normalizeIndianPhone('9876543210'), '9876543210');
  assert.equal(normalizeIndianPhone('123456789'), null);
  assert.equal(REGISTRATION_OTP_COOLDOWN_MS, 60_000);
  assert.equal(REGISTRATION_OTP_TTL_MS, 5 * 60_000);
  assert.equal(REGISTRATION_OTP_MAX_ATTEMPTS, 4);
  for (let i = 0; i < 150; i += 1) assert.match(createRegistrationOtp(), /^\d{6}$/);
});

test('registration OTP is keyed to the unique challenge and rejects incorrect codes', () => {
  const expected = otpDigest('signup-1', '000123', secret);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(matchesOtp(expected, 'signup-1', '000123', secret), true);
  assert.equal(matchesOtp(expected, 'signup-1', '000124', secret), false);
  assert.equal(matchesOtp(expected, 'signup-2', '000123', secret), false);
  assert.equal(matchesOtp(expected, 'signup-1', '123', secret), false);
});

test('registration email is escaped, includes six-digit code, and is distinct from password reset', () => {
  const email = buildRegistrationOtpMail({ fullName: '<Reader & Co>' }, '000123');
  assert.match(email.subject, /registration verification code/i);
  assert.match(email.text, /000123/);
  assert.match(email.html, /&lt;Reader &amp; Co&gt;/);
  assert.ok(!email.html.includes('<Reader & Co>'));
  assert.match(email.html, /5 minutes/);
});

test('routing requires email verification, not an SMS endpoint, before creating accounts', () => {
  const routes = read('../routes/authRoutes.js');
  const registration = read('../controllers/registrationController.js');
  const user = read('../models/User.js');
  const ui = read('../../../client/src/components/auth/AuthModal.jsx');
  assert.match(routes, /register\/verify-email/);
  assert.doesNotMatch(routes, /register\/verify-phone/);
  assert.match(registration, /sendRegistrationEmailCode/);
  assert.match(registration, /emailAcceptedAt/);
  assert.match(registration, /emailVerifiedAt: new Date\(\)/);
  assert.doesNotMatch(registration, /sendRegistrationCode|smsConfigured|phoneVerifiedAt: new Date\(\)/);
  assert.match(user, /emailVerifiedAt/);
  assert.match(ui, /Six-digit email OTP/);
  assert.doesNotMatch(ui, /SMS requested|register-phone/);
});

test('peer exchange opens an editable Gmail draft only for consented contact links', () => {
  const backend = read('../controllers/peerExchangeController.js');
  const frontend = read('../../../client/src/pages/PeerExchange.jsx');
  assert.match(backend, /listing\.contactConsent \? gmailComposeUrl/);
  assert.match(frontend, /reserveGmailTab/);
  assert.match(frontend, /openGmailOrClose\(gmailTab, url\)/);
  assert.match(frontend, /if \(url\) tab\.location\.replace\(url\)/);
  assert.match(frontend, /else tab\.close\(\)/);
});

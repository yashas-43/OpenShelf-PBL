import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eligiblePasswordResetLookup } from '../services/passwordResetEligibility.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('password recovery queries only active non-archived student records', () => {
  assert.deepEqual(eligiblePasswordResetLookup('  Student@Example.COM  ', 'owner@example.com'), {
    email: 'student@example.com',
    role: 'student',
    isActive: true,
    archivedAt: null
  });
});

test('password recovery excludes configured and OpenShelf administrator addresses', () => {
  assert.equal(eligiblePasswordResetLookup('openshelfofficial01@gmail.com'), null);
  assert.equal(eligiblePasswordResetLookup('  OWNER@EXAMPLE.COM ', 'owner@example.com'), null);
  assert.equal(eligiblePasswordResetLookup('owner@example.com', ' Owner@Example.Com '), null);
});

test('password recovery rejects empty, malformed and excessively long addresses', () => {
  for (const email of ['', 'x', 'no-at-sign.test', 'user@@example.com', 'a@b', 'a'.repeat(251) + '@x.com']) {
    assert.equal(eligiblePasswordResetLookup(email), null, email);
  }
});

test('all three reset steps use the same eligible account lookup', () => {
  const service = read('../services/passwordResetService.js');
  assert.equal((service.match(/eligiblePasswordResetLookup\(email, process\.env\.ADMIN_EMAIL\)/g) || []).length, 3);
  assert.match(service, /if \(!user\) return;/);
  assert.match(service, /if \(!user\) throw invalid\(\);/);
  assert.match(service, /sendPasswordResetCode\(user, otp, challengeId\)/);
  assert.ok(service.indexOf('if (!user) return;') < service.indexOf('sendPasswordResetCode(user, otp, challengeId)'));
});

test('forgot-password API keeps email existence private while preventing reset without OTP', () => {
  const controller = read('../controllers/passwordResetController.js');
  assert.match(controller, /res\.status\(202\)\.json\(\{ success: true, message: RESET_REQUEST_MESSAGE \}\)/);
  const frontend = read('../../../client/src/components/auth/AuthModal.jsx');
  assert.match(frontend, /setResetRequestedFor\(form\.email\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(frontend, /I received a code/);
  assert.match(frontend, /create an account/);
  assert.match(frontend, /setMode\('verify'\)/);
  assert.doesNotMatch(frontend, /setMode\('verify'\); setNotice\(\{ type: 'success', text: data.message \}\)/);
});

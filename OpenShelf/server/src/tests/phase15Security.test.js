import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateStartupSecurity,
  adminSessionBinding,
  matchesAdminSessionBinding
} from '../services/startupSecurity.js';

const VALID_HASH = '$2b$12$' + 'a'.repeat(53);
const OTHER_HASH = '$2b$12$' + 'b'.repeat(53);
const env = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/openshelf',
  ADMIN_EMAIL: 'openshelfofficial01@gmail.com',
  ADMIN_PASSWORD_HASH: VALID_HASH,
  JWT_SECRET: 'x'.repeat(48),
  RESET_TOKEN_SECRET: 'y'.repeat(48),
  REGISTRATION_OTP_SECRET: 'z'.repeat(48),
  CLIENT_URL: 'http://localhost:5173'
};

test('startup preflight accepts safe local configuration without requiring optional SMTP or payments', () => {
  assert.equal(validateStartupSecurity(env).secure, true);
});

test('startup preflight blocks missing/weak JWT secret, wrong admin identity and plain password', () => {
  for (const changes of [
    { JWT_SECRET: '' },
    { JWT_SECRET: 'short' },
    { JWT_SECRET: 'replace_with_some_random_secret' },
    { ADMIN_EMAIL: 'someoneelse@gmail.com' },
    { ADMIN_PASSWORD_HASH: 'plaintext-password' },
    { MONGODB_URI: '' }
  ]) {
    assert.throws(() => validateStartupSecurity({ ...env, ...changes }), /configuration needs attention/);
  }
});

test('production requires distinct secrets and an HTTPS-only frontend origin', () => {
  assert.doesNotThrow(() => validateStartupSecurity({ ...env, NODE_ENV: 'production', CLIENT_URL: 'https://openshelf.example' }));
  for (const changes of [
    { CLIENT_URL: 'http://openshelf.example' },
    { CLIENT_URL: 'https://openshelf.example/other' },
    { CLIENT_URL: 'https://openshelf.example?bad=1' },
    { REGISTRATION_OTP_SECRET: env.JWT_SECRET },
    { RESET_TOKEN_SECRET: env.JWT_SECRET },
    { REGISTRATION_OTP_SECRET: 'short' }
  ]) assert.throws(() => validateStartupSecurity({ ...env, NODE_ENV: 'production', CLIENT_URL: 'https://openshelf.example', ...changes }), /configuration needs attention/);
});

test('admin token bindings expire when bcrypt hash is rotated', () => {
  const bound = adminSessionBinding(env.JWT_SECRET, VALID_HASH);
  assert.match(bound, /^[a-f0-9]{64}$/);
  assert.equal(matchesAdminSessionBinding(bound, env.JWT_SECRET, VALID_HASH), true);
  assert.equal(matchesAdminSessionBinding(bound, env.JWT_SECRET, OTHER_HASH), false);
  assert.equal(matchesAdminSessionBinding(bound, 'y'.repeat(48), VALID_HASH), false);
  assert.equal(matchesAdminSessionBinding('not a binding', env.JWT_SECRET, VALID_HASH), false);
  assert.equal(matchesAdminSessionBinding(undefined, env.JWT_SECRET, VALID_HASH), false);
});

test('critical uniqueness indexes are installed before server starts accepting requests', () => {
  const startup = readFileSync(new URL('../config/database.js', import.meta.url), 'utf8');
  assert.match(startup, /User, Borrowing, StudentBorrowing/);
  assert.match(startup, /PendingRegistration, PasswordResetCode, ExchangeRequest/);
  assert.match(startup, /await model\.createIndexes\(\)/);
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(server.indexOf('validateStartupSecurity()') < server.indexOf('await connectDatabase()'));
});

test('only test-mode payment router is active and general book PDFs remain disabled', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /app\.use\('\/api\/payments',/);
  assert.match(app, /paymentRoutes/);
  assert.doesNotMatch(app, /PAYMENTS_DISABLED/);
  const pdf = readFileSync(new URL('../routes/studentPdfRoutes.js', import.meta.url), 'utf8');
  assert.match(pdf, /requireAuth, requireRole\('student', 'admin'\)/);
  const general = readFileSync(new URL('../routes/bookRoutes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(general, /pdf|read-file|download/i);
});

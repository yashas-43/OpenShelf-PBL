import test from 'node:test';
import assert from 'node:assert/strict';
import { postAuthHash, returnToOriginAfterAuth } from './postAuthNavigation.js';

test('login keeps the General Library page (book details stay open)', () => {
  const location = { hash: '#general-books' };
  assert.equal(returnToOriginAfterAuth('#general-books', 'student', location), '#general-books');
  assert.equal(location.hash, '#general-books');
});

test('student textbook selection and peer exchange remain open after login', () => {
  for (const hash of ['#student-library', '#peer-exchange-app', '#peer-listings', '#peer-requests']) {
    const location = { hash };
    returnToOriginAfterAuth(hash, 'student', location);
    assert.equal(location.hash, hash);
  }
});

test('explicit dashboard login opens the correct role-based dashboard', () => {
  assert.equal(postAuthHash('#dashboard','admin'), '#admin-dashboard');
  assert.equal(postAuthHash('#admin-dashboard','student'), '#dashboard');
});

test('homepage login does not redirect to dashboard or change current location', () => {
  const location = { hash: '' };
  assert.equal(returnToOriginAfterAuth('', 'student', location), '');
  assert.equal(location.hash, '');
  assert.equal(postAuthHash('#discover','student'), '#discover');
  assert.equal(postAuthHash('https://malicious.example','student'), '');
});

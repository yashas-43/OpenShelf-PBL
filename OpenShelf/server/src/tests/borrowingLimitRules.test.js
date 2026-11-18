import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_GENERAL_LOAN_STATUSES,
  ACTIVE_STUDENT_LOAN_STATUSES,
  MAX_ACTIVE_PHYSICAL_BORROWINGS,
  borrowingSlots,
  canCheckoutPhysicalBook,
  countActivePhysicalLoans
} from '../services/borrowingLimitRules.js';

test('three is the shared maximum, not three per library category', () => {
  assert.equal(MAX_ACTIVE_PHYSICAL_BORROWINGS, 3);
  assert.equal(canCheckoutPhysicalBook(0, 0), true);
  assert.equal(canCheckoutPhysicalBook(2, 0), true);
  assert.equal(canCheckoutPhysicalBook(1, 1), true);
  assert.equal(canCheckoutPhysicalBook(2, 1), false);
  assert.equal(canCheckoutPhysicalBook(0, 3), false);
  assert.equal(canCheckoutPhysicalBook(3, 0), false);
  assert.equal(canCheckoutPhysicalBook(2, 2), false);
});

test('returning one physical loan frees a slot for either category', () => {
  assert.deepEqual(borrowingSlots(2, 1), { used: 3, maximum: 3, remaining: 0 });
  assert.deepEqual(borrowingSlots(1, 1), { used: 2, maximum: 3, remaining: 1 });
  assert.deepEqual(borrowingSlots(3, 0), { used: 3, maximum: 3, remaining: 0 });
});

test('open General Book requests and overdue records consume slots', () => {
  assert.ok(ACTIVE_GENERAL_LOAN_STATUSES.includes('requested'));
  assert.ok(ACTIVE_GENERAL_LOAN_STATUSES.includes('approved'));
  assert.ok(ACTIVE_GENERAL_LOAN_STATUSES.includes('borrowed'));
  assert.ok(ACTIVE_GENERAL_LOAN_STATUSES.includes('overdue'));
  assert.ok(!ACTIVE_GENERAL_LOAN_STATUSES.includes('returned'));
  assert.ok(!ACTIVE_GENERAL_LOAN_STATUSES.includes('rejected'));
  assert.deepEqual(ACTIVE_STUDENT_LOAN_STATUSES, ['borrowed', 'overdue']);
});

test('malformed counts cannot bypass the policy', () => {
  for (const value of [-1, NaN, 1.5, Infinity, '2', null]) {
    assert.throws(() => countActivePhysicalLoans(value, 0), TypeError);
    assert.throws(() => countActivePhysicalLoans(0, value), TypeError);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  studentCheckoutDocument,
  studentInventoryUpdate,
  studentPublicAvailability
} from '../services/studentBorrowingRules.js';
import { fineSummary } from '../services/overdueFines.js';

const ISSUED = new Date('2026-11-15T10:00:00.000Z');

test('student stock starts unavailable until staff confirm physical copies', () => {
  const result = studentPublicAvailability({
    isPublished: true,
    isAvailableForBorrow: false,
    availableCopies: 0,
    totalCopies: 0
  });
  assert.equal(result.isBorrowable, false);
  assert.equal('totalCopies' in result, false);
  assert.equal('availableCopies' in result, false);
});

test('public availability reports genuine due date without revealing counts', () => {
  const nextExpectedReturnAt = new Date('2026-11-29T10:00:00.000Z');
  const result = studentPublicAvailability(
    { isPublished: true, isAvailableForBorrow: true, totalCopies: 3, availableCopies: 0 },
    { nextExpectedReturnAt, hasOverdueLoans: false }
  );
  assert.equal(result.isBorrowable, false);
  assert.equal(result.nextExpectedReturnAt, nextExpectedReturnAt);
  assert.equal('availableCopies' in result, false);
});

test('a textbook with stock is borrowable regardless of PDF part count', () => {
  const result = studentPublicAvailability({
    isPublished: true,
    isAvailableForBorrow: true,
    totalCopies: 3,
    availableCopies: 2
  });
  assert.equal(result.isBorrowable, true);
  assert.equal(result.nextExpectedReturnAt, null);
});

test('physical inventory edit preserves active loans and rejects invalid reductions', () => {
  assert.deepEqual(studentInventoryUpdate(3, 2), { totalCopies: 3, availableCopies: 1 });
  assert.throws(() => studentInventoryUpdate(1, 2), /active loans/);
  assert.throws(() => studentInventoryUpdate(-1, 0), /whole number/);
  assert.throws(() => studentInventoryUpdate(2.5, 0), /whole number/);
});

test('student physical loan is automatic, has one subject ID and begins a due countdown', () => {
  const loan = studentCheckoutDocument('user-id', 'textbook-id', ISSUED, 14);
  assert.equal(loan.status, 'borrowed');
  assert.equal(loan.textbook, 'textbook-id');
  assert.equal(loan.book, undefined);
  assert.equal(loan.issuedAt.getTime(), ISSUED.getTime());
  assert.equal(loan.dueAt.toISOString(), '2026-11-29T10:00:00.000Z');
  assert.equal(loan.events[0].action, 'auto_checkout');
});

test('student overdue fine charges a flat ₹10 per late return, matching General Books', () => {
  const loan = studentCheckoutDocument('user-id', 'textbook-id', ISSUED, 14);
  const overdue = new Date('2026-11-30T10:01:00.000Z');
  assert.equal(fineSummary(loan, overdue).fineAmountPaise, 1000);
});

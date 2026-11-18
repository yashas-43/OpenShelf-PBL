import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticCheckoutRecord } from '../services/borrowingRules.js';
import { planThreeCopies } from '../services/inventoryPlan.js';
import { expectedReturnsByBook, publicBookView } from '../services/publicBookAvailability.js';

const NOW = new Date('2026-11-14T12:00:00Z');

test('automatic checkout begins a 14-day loan immediately and needs no admin approval', () => {
  const record = automaticCheckoutRecord('student', 'book', NOW, 14);
  assert.equal(record.status, 'borrowed');
  assert.equal(record.issuedAt.toISOString(), NOW.toISOString());
  assert.equal(record.approvedAt, null); // No administrator approval occurred.
  assert.equal(record.dueAt.toISOString(), '2026-11-28T12:00:00.000Z');
  assert.equal(record.events[0].action, 'auto_checkout');
});

test('exactly three total copies, with existing loans still reserved', () => {
  const books = [
    { _id: 'a', title: 'A', totalCopies: 0, availableCopies: 0 },
    { _id: 'b', title: 'B', totalCopies: 9, availableCopies: 9 },
    { _id: 'c', title: 'C', totalCopies: 3, availableCopies: 0 }
  ];
  const plan = planThreeCopies(books, new Map([['b', 1], ['c', 3]]));
  assert.deepEqual(plan.map((book) => [book.totalCopies, book.availableCopies]), [[3, 3], [3, 2], [3, 0]]);
  assert.equal(plan[0].changed, true);
  assert.equal(plan[2].changed, false);
});

test('migration refuses books with more than three active loans, never silently deleting any', () => {
  assert.throws(() => planThreeCopies([{ _id: 'a', title: 'A' }], new Map([['a', 4]])), /4 active borrowing/);
  assert.throws(() => planThreeCopies([], new Map()), /No physical General Books/);
});

test('public catalogue returns availability without revealing total/available stock counts', () => {
  const book = { _id: 'a', title: 'Book', availableCopies: 2, totalCopies: 3, isAvailableForBorrow: true };
  const result = publicBookView(book);
  assert.equal(result.isBorrowable, true);
  assert.equal('availableCopies' in result, false);
  assert.equal('totalCopies' in result, false);
});

test('no copies means earliest future due is displayed, but an overdue loan is flagged', () => {
  const deadlines = expectedReturnsByBook([{
    _id: 'a', dueDates: [new Date('2026-11-12T12:00:00Z'), new Date('2026-11-17T12:00:00Z'), new Date('2026-11-19T12:00:00Z')]
  }], NOW).get('a');
  assert.equal(deadlines.hasOverdueLoans, true);
  assert.equal(deadlines.nextExpectedReturnAt.toISOString(), '2026-11-17T12:00:00.000Z');
  const result = publicBookView({ _id: 'a', totalCopies: 3, availableCopies: 0, isAvailableForBorrow: true }, deadlines);
  assert.equal(result.isBorrowable, false);
  assert.equal(result.hasOverdueLoans, true);
  assert.equal('totalCopies' in result, false);
});

test('all overdue loans give no false future promise', () => {
  const deadlines = expectedReturnsByBook([{
    _id: 'a', dueDates: [new Date('2026-11-11T12:00:00Z')]
  }], NOW).get('a');
  assert.equal(deadlines.nextExpectedReturnAt, null);
  assert.equal(deadlines.hasOverdueLoans, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBorrowing, remainingMilliseconds, DUE_SOON_WINDOW_MS } from '../services/dashboardMetrics.js';

const NOW = new Date('2026-11-14T10:00:00Z');

test('a requested book is not considered issued or overdue', () => {
  const book = { status: 'requested', issuedAt: null, dueAt: new Date('2026-11-13T10:00:00Z') };
  assert.equal(classifyBorrowing(book, NOW), 'requested');
  assert.equal(remainingMilliseconds(book, NOW), null);
});

test('an approved book with a due date but no handover has no countdown', () => {
  const book = { status: 'approved', issuedAt: null, dueAt: new Date('2026-11-18T10:00:00Z') };
  assert.equal(classifyBorrowing(book, NOW), 'approved');
  assert.equal(remainingMilliseconds(book, NOW), null);
});

test('an issued book with a future due date has a real countdown', () => {
  const book = { status: 'borrowed', issuedAt: new Date('2026-11-12T10:00:00Z'), dueAt: new Date('2026-11-15T10:00:00Z') };
  assert.equal(classifyBorrowing(book, NOW), 'borrowed');
  assert.equal(remainingMilliseconds(book, NOW), 24 * 60 * 60 * 1000);
});

test('an issued book past its due date is overdue even if persisted as borrowed', () => {
  const book = { status: 'borrowed', issuedAt: new Date('2026-11-09T10:00:00Z'), dueAt: new Date('2026-11-13T10:00:00Z') };
  assert.equal(classifyBorrowing(book, NOW), 'overdue');
  assert.equal(remainingMilliseconds(book, NOW), null);
});

test('returned books never restart a countdown', () => {
  const book = { status: 'returned', issuedAt: new Date('2026-11-09T10:00:00Z'), dueAt: new Date('2026-11-13T10:00:00Z') };
  assert.equal(classifyBorrowing(book, NOW), 'returned');
  assert.equal(remainingMilliseconds(book, NOW), null);
});

test('due-soon window is exactly 72 hours', () => {
  assert.equal(DUE_SOON_WINDOW_MS, 72 * 60 * 60 * 1000);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTimeRemaining } from './timeRemaining.js';

const NOW = Date.parse('2026-11-14T10:00:00Z');

test('returns no clock for missing due dates', () => {
  assert.equal(formatTimeRemaining(null, NOW), null);
  assert.equal(formatTimeRemaining('not-a-date', NOW), null);
});

test('formats a future due date in days and hours', () => {
  assert.equal(formatTimeRemaining('2026-11-16T12:00:00Z', NOW), '2d 2h remaining');
});

test('formats an imminent due date', () => {
  assert.equal(formatTimeRemaining('2026-11-14T10:20:00Z', NOW), '20m remaining');
});

test('uses a clear overdue label when the deadline has passed', () => {
  assert.equal(formatTimeRemaining('2026-11-13T10:00:00Z', NOW), 'Overdue');
  assert.equal(formatTimeRemaining('2026-11-14T10:00:00Z', NOW), 'Due now');
});

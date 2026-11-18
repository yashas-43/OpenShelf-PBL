import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BORROWING_ACTIONS, OPEN_BORROWING_STATUSES, canAskExtension, canTransition,
  extensionDeadline, issueDeadline, loanDays
} from '../services/borrowingRules.js';

const NOW = new Date('2026-11-14T10:00:00.000Z');

test('only expected statuses reserve stock', () => {
  assert.deepEqual(OPEN_BORROWING_STATUSES, ['requested', 'approved', 'borrowed', 'overdue']);
  assert.equal(OPEN_BORROWING_STATUSES.includes('returned'), false);
  assert.equal(OPEN_BORROWING_STATUSES.includes('rejected'), false);
});

test('requested loans may be approved or rejected but never issued directly', () => {
  assert.equal(canTransition('requested', 'approve'), true);
  assert.equal(canTransition('requested', 'reject'), true);
  assert.equal(canTransition('requested', 'issue'), false);
  assert.equal(canTransition('requested', 'return'), false);
});

test('approval permits handover, but no double approval or premature return', () => {
  assert.equal(canTransition('approved', 'issue'), true);
  assert.equal(canTransition('approved', 'reject'), true);
  assert.equal(canTransition('approved', 'approve'), false);
  assert.equal(canTransition('approved', 'return'), false);
});

test('borrowed or overdue loans can only be marked returned', () => {
  for (const status of ['borrowed', 'overdue']) {
    assert.equal(canTransition(status, 'return'), true);
    assert.equal(canTransition(status, 'reject'), false);
    assert.equal(canTransition(status, 'issue'), false);
  }
});

test('completed loans can never be updated by a second lifecycle command', () => {
  for (const status of ['returned', 'rejected']) {
    for (const action of Object.keys(BORROWING_ACTIONS)) assert.equal(canTransition(status, action), false);
  }
});

test('unsupported actions are never available', () => {
  assert.equal(canTransition('approved', 'delete'), false);
  assert.equal(canTransition('approved', '__proto__'), false);
});

test('loan duration stays between one and sixty calendar days', () => {
  assert.equal(loanDays('21'), 21);
  assert.equal(loanDays(60), 60);
  assert.equal(loanDays(0), 14);
  assert.equal(loanDays(61), 14);
  assert.equal(loanDays('not-number'), 14);
  assert.equal(loanDays(1.5), 14);
});

test('issue date creates exact 14-day deadline only when issue runs', () => {
  assert.equal(issueDeadline(NOW, 14).toISOString(), '2026-11-28T10:00:00.000Z');
});

test('extension adds seven days from due date for a not-yet-overdue book', () => {
  assert.equal(extensionDeadline('2026-11-18T10:00:00Z', NOW).toISOString(), '2026-11-25T10:00:00.000Z');
});

test('extension of overdue book begins after the approval time', () => {
  assert.equal(extensionDeadline('2026-11-10T10:00:00Z', NOW).toISOString(), '2026-11-21T10:00:00.000Z');
});

test('only issued, active, not-previously-extended loans can ask for extension', () => {
  const active = { status: 'borrowed', issuedAt: NOW, dueAt: issueDeadline(NOW, 14),
    returnedAt: null, extensionStatus: 'none' };
  assert.equal(canAskExtension(active), true);
  assert.equal(canAskExtension({ ...active, status: 'overdue' }), true);
  assert.equal(canAskExtension({ ...active, status: 'approved' }), false);
  assert.equal(canAskExtension({ ...active, issuedAt: null }), false);
  assert.equal(canAskExtension({ ...active, returnedAt: NOW }), false);
  assert.equal(canAskExtension({ ...active, extensionStatus: 'pending' }), false);
  assert.equal(canAskExtension({ ...active, extensionStatus: 'approved' }), false);
  assert.equal(canAskExtension({ ...active, extensionStatus: 'rejected' }), false);
});

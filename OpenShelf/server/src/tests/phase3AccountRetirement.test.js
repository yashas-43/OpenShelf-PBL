import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCOUNT_RETIREMENT_BLOCKERS,
  archivedAccountEmail,
  archivedStudentUpdate,
  parseAccountResetArguments,
  requirePhase3Administrator,
  retirementBlockers
} from '../services/accountRetirementRules.js';

const MOCK_BCRYPT = '$2b$12$' + 'a'.repeat(53);
const ID = '64a1b2c3d4e5f67890123456';
const clean = Object.fromEntries(ACCOUNT_RETIREMENT_BLOCKERS.map((key) => [key, 0]));

test('old logins get a unique invalid domain rather than another real Gmail address', () => {
  assert.equal(archivedAccountEmail(ID), `archived-${ID}@accounts.openshelf.invalid`);
  assert.notEqual(archivedAccountEmail(ID), archivedAccountEmail('64a1b2c3d4e5f67890123457'));
  assert.throws(() => archivedAccountEmail('not-an-objectid'), /Invalid/);
});

test('only configured OpenShelf administrator email can authorize cleanup', () => {
  requirePhase3Administrator('OpenShelfOfficial01@gmail.com', MOCK_BCRYPT);
  assert.throws(() => requirePhase3Administrator('other@gmail.com', MOCK_BCRYPT), /openshelfofficial01@gmail.com/);
  assert.throws(() => requirePhase3Administrator('openshelfofficial01@gmail.com', 'password'), /bcrypt/);
});

test('cleanup is a safe preview unless all destructive apply confirmations are supplied', () => {
  assert.deepEqual(parseAccountResetArguments([]), { applying: false, expectedUsers: null });
  assert.deepEqual(parseAccountResetArguments(['--preview']), { applying: false, expectedUsers: null });
  assert.deepEqual(parseAccountResetArguments([
    '--apply', '--backup-confirmed', '--confirm-account-retirement', '--expect-users=3'
  ]), { applying: true, expectedUsers: 3 });
  assert.throws(() => parseAccountResetArguments(['--apply']), /requires/);
  assert.throws(() => parseAccountResetArguments(['--apply', '--backup-confirmed', '--confirm-account-retirement']), /requires/);
  assert.throws(() => parseAccountResetArguments(['--preview', '--apply']), /preview or apply/);
  assert.throws(() => parseAccountResetArguments(['--expect-users=3']), /apply only/);
  assert.throws(() => parseAccountResetArguments(['--apply', '--backup-confirmed', '--confirm-account-retirement', '--expect-users=9001']), /0 to 5000/);
});

test('every open loan, pending exchange, purchase or fine blocks a reset', () => {
  assert.deepEqual(retirementBlockers(clean), []);
  for (const key of ACCOUNT_RETIREMENT_BLOCKERS) {
    const blockers = retirementBlockers({ ...clean, [key]: 1 });
    assert.equal(blockers.length, 1, key);
    assert.match(blockers[0], new RegExp(key));
  }
  assert.ok(retirementBlockers({}).length > 0); // Unknown state must fail closed.
});

test('student archive changes credentials and personal fields without changing _id or role', () => {
  const at = new Date('2026-11-15T00:00:00.000Z');
  const change = archivedStudentUpdate(ID, MOCK_BCRYPT, at);
  assert.deepEqual(change.$inc, { sessionVersion: 1 });
  assert.equal(change.$set.email, archivedAccountEmail(ID));
  assert.equal(change.$set.fullName, 'Archived student');
  assert.equal(change.$set.phone, null);
  assert.equal(change.$set.isActive, false);
  assert.deepEqual(change.$set.archivedAt, at);
  assert.ok(!Object.hasOwn(change.$set, '_id'));
  assert.ok(!Object.hasOwn(change.$set, 'role'));
  assert.throws(() => archivedStudentUpdate(ID, 'bad', at), /bcrypt/);
});

test('Phase 3 script preserves historical loan IDs, never deletes users, and cancels unsent email', () => {
  const script = readFileSync(new URL('../scripts/retireStudentAccounts.js', import.meta.url), 'utf8');
  assert.match(script, /User\.bulkWrite\(/);
  assert.doesNotMatch(script, /User\.deleteMany|User\.collection\.drop|dropDatabase\(/);
  assert.match(script, /PeerBookListing\.updateMany/);
  assert.match(script, /PasswordResetCode\.deleteMany/);
  assert.match(script, /PendingRegistration\.deleteMany/);
  assert.match(script, /status: 'cancelled'/);
  assert.match(script, /mongoose\.connection\.transaction/);
});

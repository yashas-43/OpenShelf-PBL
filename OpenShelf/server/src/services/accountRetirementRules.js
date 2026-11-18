/**
 * Phase 3 — policy for retiring previous demo/student login identities.
 *
 * An archived user keeps their MongoDB _id so historical loans, fine records,
 * reports and other references are not orphaned. Their old email is released
 * for registration, while the archived account can never authenticate.
 */
export const OPENSHELF_ADMIN_EMAIL = 'openshelfofficial01@gmail.com';
export const ACCOUNT_RETIREMENT_BLOCKERS = Object.freeze([
  'openGeneralLoans',
  'openStudentLoans',
  'unresolvedExchanges',
  'pendingPayments',
  'completedPurchases',
  'capturedPayments',
  'unpaidGeneralFines',
  'unpaidStudentFines'
]);

/** A non-routable address unique to one historical record, not a real mailbox. */
export function archivedAccountEmail(id) {
  const value = String(id).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(value)) throw new Error('Invalid MongoDB student ID.');
  return `archived-${value}@accounts.openshelf.invalid`;
}

/** Never allow a CLI cleanup to run with an old or unconfigured admin identity. */
export function requirePhase3Administrator(email, hash) {
  if (String(email || '').trim().toLowerCase() !== OPENSHELF_ADMIN_EMAIL) {
    throw new Error(`Set ADMIN_EMAIL=${OPENSHELF_ADMIN_EMAIL} in server/.env before Phase 3 apply.`);
  }
  if (!/^\$2[aby]\$\d\d\$/.test(String(hash || ''))) {
    throw new Error('ADMIN_PASSWORD_HASH must be a valid-looking bcrypt hash, not a placeholder.');
  }
}

/** A historical record with an active obligation cannot safely be retired. */
export function retirementBlockers(counts) {
  return ACCOUNT_RETIREMENT_BLOCKERS
    .filter((key) => !Number.isSafeInteger(counts[key]) || counts[key] > 0)
    .map((key) => `${key}: ${counts[key] ?? 'unknown'}`);
}

/** Build a standard update, avoiding any modification to the historical _id. */
export function archivedStudentUpdate(id, lockedPasswordHash, at) {
  if (!/^\$2[aby]\$\d\d\$/.test(lockedPasswordHash || '')) {
    throw new Error('A valid bcrypt lock hash is required.');
  }
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid retirement timestamp.');
  return {
    $set: {
      fullName: 'Archived student',
      email: archivedAccountEmail(id),
      phone: null,
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
      emailConfirmationSentAt: null,
      passwordHash: lockedPasswordHash,
      isActive: false,
      archivedAt: date
    },
    $inc: { sessionVersion: 1 }
  };
}

/** Explicit confirmations and a record count make accidental resets harder. */
export function parseAccountResetArguments(argumentsList) {
  const validFlags = new Set(['--preview', '--apply', '--backup-confirmed', '--confirm-account-retirement']);
  const flags = new Set();
  let expectedUsers = null;
  for (const argument of argumentsList) {
    if (argument.startsWith('--expect-users=')) {
      if (expectedUsers !== null) throw new Error('--expect-users may only be provided once.');
      const count = argument.slice('--expect-users='.length);
      if (!/^(0|[1-9][0-9]*)$/.test(count) || Number(count) > 5000) {
        throw new Error('Expected student count must be an integer from 0 to 5000.');
      }
      expectedUsers = Number(count);
    } else if (validFlags.has(argument)) {
      if (flags.has(argument)) throw new Error(`Duplicate flag: ${argument}`);
      flags.add(argument);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (flags.has('--preview') && flags.has('--apply')) throw new Error('Choose preview or apply, not both.');
  const applying = flags.has('--apply');
  if (applying && (!flags.has('--backup-confirmed')
    || !flags.has('--confirm-account-retirement') || expectedUsers === null)) {
    throw new Error('Apply requires --backup-confirmed --confirm-account-retirement --expect-users=N.');
  }
  if (!applying && (flags.has('--backup-confirmed') || flags.has('--confirm-account-retirement') || expectedUsers !== null)) {
    throw new Error('Confirmation flags and --expect-users apply only with --apply.');
  }
  return { applying, expectedUsers };
}

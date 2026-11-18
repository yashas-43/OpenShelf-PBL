/**
 * OpenShelf Phase 3 — old student account/login reset. READ THIS BEFORE APPLYING.
 *
 * Default: read-only database preview.
 * Applying requires a separate verified MongoDB BACKUP, stopped API process,
 * three explicit flags, and matching account count. It archives identities,
 * not loan/payment history: references still point to the same User _id.
 *
 * Preview: npm run accounts:preview
 * Apply:   npm run accounts:reset -- --apply --backup-confirmed \
 *            --confirm-account-retirement --expect-users=N
 *
 * DO NOT use this on production accounts. Do not remove user records directly
 * from Compass; that breaks loan, payment and exchange references.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Borrowing from '../models/Borrowing.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import ExchangeRequest from '../models/ExchangeRequest.js';
import PeerBookListing from '../models/PeerBookListing.js';
import PendingRegistration from '../models/PendingRegistration.js';
import PasswordResetCode from '../models/PasswordResetCode.js';
import EmailLog from '../models/EmailLog.js';
import Notification from '../models/Notification.js';
import ReadingHistory from '../models/ReadingHistory.js';
import Purchase from '../models/Purchase.js';
import Payment from '../models/Payment.js';
import AdminAudit from '../models/AdminAudit.js';
import { OPEN_BORROWING_STATUSES } from '../services/borrowingRules.js';
import { STUDENT_OPEN_STATUSES } from '../services/studentBorrowingRules.js';
import {
  archivedStudentUpdate,
  parseAccountResetArguments,
  requirePhase3Administrator,
  retirementBlockers
} from '../services/accountRetirementRules.js';

const options = parseAccountResetArguments(process.argv.slice(2));
const unreconciledFine = {
  $expr: {
    $gt: [
      { $ifNull: ['$fineAssessedPaise', 0] },
      { $ifNull: ['$finePaidPaise', 0] }
    ]
  }
};

async function inspect(session = null) {
  // Retired users are kept for referential integrity but excluded from resets.
  const filter = { role: 'student', archivedAt: null };
  const accounts = await User.find(filter).select('_id').session(session).lean();
  const ids = accounts.map(({ _id }) => _id);
  const countFor = (model, query) => model.countDocuments(query).session(session);
  const users = ids.length ? { $in: ids } : { $in: [] };
  const [openGeneralLoans, openStudentLoans, unresolvedExchanges, pendingPayments,
    completedPurchases, capturedPayments, unpaidGeneralFines, unpaidStudentFines,
    incompleteRegistrations, pendingResets, activePeerListings, unsentEmails] = await Promise.all([
    countFor(Borrowing, { user: users, status: { $in: OPEN_BORROWING_STATUSES } }),
    countFor(StudentBorrowing, { user: users, status: { $in: STUDENT_OPEN_STATUSES } }),
    countFor(ExchangeRequest, { $or: [{ requester: users }, { owner: users }], status: { $in: ['pending', 'accepted'] } }),
    countFor(Payment, { user: users, status: 'pending' }),
    countFor(Purchase, { user: users, status: 'completed' }),
    countFor(Payment, { user: users, status: 'captured' }),
    countFor(Borrowing, { user: users, ...unreconciledFine }),
    countFor(StudentBorrowing, { user: users, ...unreconciledFine }),
    countFor(PendingRegistration, {}),
    countFor(PasswordResetCode, { user: users }),
    countFor(PeerBookListing, { owner: users, status: { $ne: 'removed' } }),
    countFor(EmailLog, { user: users, status: { $in: ['pending','sending','failed','not_configured'] } })
  ]);
  const blockers = {
    openGeneralLoans, openStudentLoans, unresolvedExchanges, pendingPayments,
    completedPurchases, capturedPayments, unpaidGeneralFines, unpaidStudentFines
  };
  return {
    ids, blockers,
    counts: { eligibleAccounts: ids.length, incompleteRegistrations, pendingResets, activePeerListings, unsentEmails }
  };
}

function printPreview(result) {
  console.log('\nOpenShelf Phase 3 — account/login reset preview (no private emails printed)');
  console.log(`Student accounts eligible for retirement: ${result.counts.eligibleAccounts}`);
  console.log(`Pending registrations: ${result.counts.incompleteRegistrations}`);
  console.log(`Password reset challenges (eligible students): ${result.counts.pendingResets}`);
  console.log(`Peer book listings to hide: ${result.counts.activePeerListings}`);
  console.log(`Unsent emails to cancel: ${result.counts.unsentEmails}`);
  const blocked = retirementBlockers(result.blockers);
  if (blocked.length) {
    console.log('BLOCKED — settle these obligations before an account reset:');
    for (const item of blocked) console.log(`  ${item}`);
  } else {
    console.log('No open obligations detected for these accounts.');
  }
  console.log('History is retained by MongoDB user ID. No user accounts are hard-deleted.');
  console.log('Retirement disables old logins, anonymizes name/email/phone, and frees those emails for registration.');
  return blocked;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env.');
  if (options.applying && process.env.NODE_ENV === 'production') {
    throw new Error('Account retirement is blocked in production mode. Use a separate reviewed migration.');
  }
  if (options.applying) requirePhase3Administrator(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD_HASH);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    if (!options.applying) {
      printPreview(await inspect());
      console.log('READ ONLY: no MongoDB records were changed.');
      return;
    }
    // Do expensive bcrypt work outside the transaction. Nobody knows this password.
    const lockedHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const report = await mongoose.connection.transaction(async (session) => {
      const result = await inspect(session);
      const blocked = printPreview(result);
      if (blocked.length) throw new Error('Account reset cancelled because live obligations remain.');
      if (result.ids.length !== options.expectedUsers) {
        throw new Error(`Account count changed: expected ${options.expectedUsers}, found ${result.ids.length}. Run a new preview.`);
      }
      const archivedAt = new Date();
      const ids = result.ids;
      if (ids.length) {
        // Each account gets a unique non-deliverable email and its historical ID survives.
        const writes = ids.map((_id) => ({
          updateOne: {
            filter: { _id, role: 'student', archivedAt: null },
            update: archivedStudentUpdate(_id, lockedHash, archivedAt)
          }
        }));
        const updated = await User.bulkWrite(writes, { session, ordered: true });
        if (updated.modifiedCount !== ids.length) {
          throw new Error('Some student accounts changed during reset; transaction rolled back.');
        }
        await PeerBookListing.updateMany({ owner: { $in: ids }, status: { $ne: 'removed' } },
          { $set: { status: 'removed' } }, { session });
        // Existing sent-email history stays for accountability; queued delivery is stopped.
        await EmailLog.updateMany({ user: { $in: ids }, status: { $in: ['pending','sending','failed','not_configured'] } },
          { $set: { status: 'cancelled', lastErrorCode: 'ACCOUNT_RETIRED' } }, { session });
        // Personal in-app information and PDF progress are no longer needed.
        await Notification.deleteMany({ user: { $in: ids } }, { session });
        await ReadingHistory.deleteMany({ user: { $in: ids } }, { session });
      }
      await PasswordResetCode.deleteMany({}, { session });
      await PendingRegistration.deleteMany({}, { session });
      await AdminAudit.create([{
        action: 'student_accounts_retired', targetType: 'student_accounts',
        targetId: 'batch', notes: `Phase 3 retired ${ids.length} student login identities; historical records retained.`
      }], { session });
      return { retired: ids.length, pendingCleared: result.counts.incompleteRegistrations };
    });
    console.log(`\nAPPLIED: ${report.retired} old student accounts retired; ${report.pendingCleared} incomplete signups cleared.`);
    console.log('Admin remains configured in server/.env as openshelfofficial01@gmail.com.');
    console.log('Old student tokens are invalid. New student registration can reuse the previous email addresses.');
    console.log('KEEP YOUR MONGODB BACKUP: the identity changes cannot be undone without one.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Phase 3 account reset failed: ${error.message}`);
  process.exitCode = 1;
});

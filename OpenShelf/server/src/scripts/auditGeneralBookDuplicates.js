/**
 * Preview: npm run catalogue:duplicates:preview
 * Apply (after verified backup and with server stopped):
 *   npm run catalogue:duplicates:apply -- --backup-confirmed --expect=N
 *
 * Only extra published records with the exact normalized title AND author
 * are archived. No documents are deleted; IDs, loan history and stock fields
 * are preserved. No active loan or ambiguous source ID is changed.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import { OPEN_BORROWING_STATUSES } from '../services/borrowingRules.js';
import { planGeneralBookDuplicateArchive } from '../services/generalBookDuplicates.js';

const args = process.argv.slice(2);
const applying = args.includes('--apply');
const expectedArg = args.find((arg) => arg.startsWith('--expect='));
const expected = expectedArg ? Number(expectedArg.slice('--expect='.length)) : NaN;
const allowed = args.every((arg) =>
  ['--preview', '--apply', '--backup-confirmed'].includes(arg) || /^--expect=\d+$/.test(arg)
);
if (!allowed || (applying && (!args.includes('--backup-confirmed') || !Number.isInteger(expected)))) {
  console.error('Use --preview, or --apply --backup-confirmed --expect=N after a verified backup.');
  process.exit(1);
}

async function makePlan(session) {
  const [books, active] = await Promise.all([
    Book.find({ format: 'physical', isPublished: { $ne: false } }).session(session).lean(),
    Borrowing.aggregate([
      { $match: { status: { $in: OPEN_BORROWING_STATUSES }, returnedAt: null } },
      { $group: { _id: '$book', count: { $sum: 1 } } }
    ]).session(session)
  ]);
  const counts = new Map(active.map((row) => [String(row._id), row.count]));
  return planGeneralBookDuplicateArchive(books, counts);
}

function report(result) {
  console.log(`Published General Book records: ${result.publishedCount}`);
  console.log(`Exact duplicate groups: ${result.groups.length}; safe records to archive: ${result.archive.length}.`);
  console.log(`Groups needing manual review: ${result.blocked.length}; title-only collisions: ${result.titleOnly.length}.`);
  for (const row of result.groups) {
    console.log(`${row.reason ? 'BLOCKED' : 'DUPLICATE'}: ${row.title} — ${row.author}`);
    console.log(`  Keep ${row.keepId}; copies per record: ${row.records.map((x) => `${x.id} (${x.availableCopies}/${x.totalCopies}; ${x.activeLoans} active)`).join(', ')}`);
    if (row.reason) console.log(`  Reason: ${row.reason}`);
  }
  for (const item of result.titleOnly) {
    console.log(`REVIEW TITLE: ${item.title} — ${item.books.map((b) => b.author).join(' / ')}`);
  }
  console.log('No stock quantities or loan references will be merged. Review physical stock separately.');
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing from server/.env.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    if (!applying) {
      report(await makePlan(null));
      console.log('READ ONLY. This preview has not changed any MongoDB records.');
      return;
    }
    await mongoose.connection.transaction(async (session) => {
      const plan = await makePlan(session);
      report(plan);
      if (plan.blocked.length) throw new Error('Some groups require manual review. NO changes applied.');
      if (plan.archive.length !== expected) {
        throw new Error(`Expected ${expected} archive candidates, but found ${plan.archive.length}. NO changes applied.`);
      }
      if (!plan.archive.length) return;
      const ids = plan.archive.map((item) => item._id);
      const result = await Book.updateMany(
        { _id: { $in: ids }, format: 'physical', isPublished: { $ne: false } },
        { $set: { isPublished: false, isAvailableForBorrow: false } },
        { session }
      );
      if (result.modifiedCount !== ids.length) throw new Error('Catalogue changed concurrently; transaction aborted.');
      console.log(`Archived ${result.modifiedCount} duplicate catalogue records; nothing deleted.`);
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Duplicate audit failed: ${error.message}`);
  process.exitCode = 1;
});

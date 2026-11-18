/**
 * OpenShelf Phase 2 — safely reconcile 326 original General Books.
 *
 * npm run catalogue:check                  validates supplied book source without DB
 * npm run catalogue:preview                reads MongoDB and prints the proposed changes
 * npm run catalogue:apply -- --confirm-archive
 *                                           applies in a transaction after DB backup
 *
 * Stop the website before applying. Existing user accounts, borrowing records,
 * physical copy counts, prices, and peer listings are never deleted or rewritten.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import { OPEN_BORROWING_STATUSES } from '../services/borrowingRules.js';
import { planCatalogueMerge, validateCatalogue } from '../services/generalCatalogueRules.js';
import { assessGeneralBookTextIndex } from '../services/generalBookTextIndex.js';

const SOURCE_FILE = new URL('../data/generalBooks326.json', import.meta.url);
const source = validateCatalogue(JSON.parse(readFileSync(SOURCE_FILE, 'utf8')));
const args = process.argv.slice(2);
const valid = new Set(['--check', '--preview', '--apply', '--confirm-archive']);
if (args.some((argument) => !valid.has(argument))) {
  throw new Error(`Unknown argument. Supported: ${[...valid].join(', ')}`);
}

const checking = args.includes('--check');
const applying = args.includes('--apply');
if (applying && !args.includes('--confirm-archive')) {
  throw new Error('First back up MongoDB and stop the server; then use --apply --confirm-archive.');
}
if (!checking && !applying && args.includes('--confirm-archive')) {
  throw new Error('--confirm-archive is only valid with --apply.');
}

async function plan(session) {
  const [records, active] = await Promise.all([
    Book.find({ format: 'physical' }).session(session || null).lean(),
    Borrowing.aggregate([
      { $match: { status: { $in: OPEN_BORROWING_STATUSES } } },
      { $group: { _id: '$book', count: { $sum: 1 } } }
    ]).session(session || null)
  ]);
  const counts = new Map(active.map((item) => [String(item._id), item.count]));
  return planCatalogueMerge(source, records, counts);
}

function printPlan(result) {
  console.log(`Source: ${source.length} distinct General Books; mapped to approved genres.`);
  console.log(`Would insert ${result.insert.length}, update/reuse ${result.update.length}, archive ${result.archive.length}.`);
  console.log(`Blocked groups: ${result.blockers.length}. Existing active loans are never reassigned.`);
  for (const blocker of result.blockers.slice(0, 30)) console.error(`BLOCKED: ${blocker}`);
  if (result.blockers.length > 30) console.error(`... ${result.blockers.length - 30} additional blockers.`);
  const duplicates = result.archive.filter((item) => item.reason === 'duplicate');
  const outside = result.archive.filter((item) => item.reason === 'not-in-approved-326');
  console.log(`Archive details: ${duplicates.length} duplicate records; ${outside.length} records absent from the approved source.`);
}

async function run() {
  if (checking) {
    console.log(`Original source verified: ${source.length} unique books; IDs, titles and genres passed.`);
    console.log('The shared General Book cover is already stored under client/public/openshelf-general-cover.jpg.');
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required in server/.env.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    if (!applying) {
      printPlan(await plan(null));
      console.log('READ ONLY. Back up the database and resolve all blockers before applying.');
      return;
    }
    // Do not import against the legacy text index: it mistakes Book.language for
    // a MongoDB stemmer language and rejects authentic values like Sanskrit.
    const indexes = await mongoose.connection.db.collection('books').indexes();
    const textIndex = assessGeneralBookTextIndex(indexes);
    if (textIndex.status === 'legacy') {
      throw new Error('Legacy General Books text index detected. Run catalogue:text-index:preview, back up MongoDB, then run catalogue:text-index:apply -- --backup-confirmed before importing.');
    }
    // Ensure source identifiers cannot be duplicated by concurrent imports.
    await Book.createIndexes();
    const result = await mongoose.connection.transaction(async (session) => {
      const current = await plan(session);
      printPlan(current);
      if (current.blockers.length) throw new Error('Import was NOT applied: resolve blocked borrowing records first.');
      const writes = [];
      for (const { record, source: fields } of current.update) {
        // Never reset totalCopies, availableCopies, borrowing flags, or price.
        writes.push({ updateOne: { filter: { _id: record._id }, update: { $set: fields } } });
      }
      for (const fields of current.insert) {
        // A catalogued title is not proof that a physical copy is in the library.
        writes.push({ insertOne: { document: {
          ...fields,
          totalCopies: 0,
          availableCopies: 0,
          isAvailableForBorrow: false,
          isAvailableForPurchase: false,
          price: 0
        } } });
      }
      for (const { record } of current.archive) {
        // Hide only: preserve the MongoDB ID, borrowing history and audit trail.
        writes.push({ updateOne: { filter: { _id: record._id }, update: { $set: { isPublished: false } } } });
      }
      if (writes.length) await Book.bulkWrite(writes, { session, ordered: true });
      return current;
    });
    console.log(`APPLIED: ${result.insert.length} added, ${result.update.length} matched, ${result.archive.length} archived (nothing deleted).`);
    console.log('If new titles have zero stock, set verified physical inventory in Admin Dashboard before allowing borrowing.');
  } finally {
    await mongoose.disconnect();
  }
}
run().catch((error) => {
  console.error(`General Books catalogue failed: ${error.message}`);
  process.exitCode = 1;
});

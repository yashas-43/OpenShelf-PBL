/**
 * Safe one-time inventory setup for real physical General Books.
 * Dry-run (default): npm run stock:set-three
 * Apply to MongoDB:  npm run stock:set-three -- --apply
 *
 * STOP THE WEB SERVER before applying; back up your MongoDB database first.
 * All updates occur inside a single MongoDB transaction, preserving active loans.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import { OPEN_BORROWING_STATUSES } from '../services/borrowingRules.js';
import { planThreeCopies } from '../services/inventoryPlan.js';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply')) {
  throw new Error('Unknown option. Run without options for a dry run, or --apply to make changes.');
}

async function plan(session) {
  const rows = await Borrowing.aggregate([
    { $match: { status: { $in: OPEN_BORROWING_STATUSES } } },
    { $group: { _id: '$book', active: { $sum: 1 } } }
  ]).session(session || null);
  const activeCounts = new Map(rows.map((row) => [String(row._id), row.active]));
  const books = await Book.find({ format: 'physical' })
    .select('_id title totalCopies availableCopies').session(session || null).lean();
  const result = planThreeCopies(books, activeCounts);
  const knownIds = new Set(books.map((book) => String(book._id)));
  const orphans = rows.filter((row) => !knownIds.has(String(row._id)));
  if (orphans.length) throw new Error(`${orphans.length} active borrowing group(s) reference missing/nonphysical books. Audit stock before migrating.`);
  return result;
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env first.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    if (args.includes('--apply')) {
      const result = await mongoose.connection.transaction(async (session) => {
        const planned = await plan(session);
        const changed = planned.filter((book) => book.changed);
        if (changed.length) {
          await Book.bulkWrite(changed.map((book) => ({
            updateOne: { filter: { _id: book._id, format: 'physical' },
              update: { $set: { totalCopies: book.totalCopies, availableCopies: book.availableCopies } } }
          })), { session, ordered: true });
        }
        return { checked: planned.length, changed: changed.length };
      });
      console.log(`Applied safely: ${result.changed}/${result.checked} physical General Books updated; all retained exactly 3 total copies minus active loans.`);
    } else {
      const planned = await plan(null);
      console.log(`DRY RUN: ${planned.length} actual General Books; ${planned.filter((b) => b.changed).length} records would change.`);
      console.log('No MongoDB records were changed. Run npm run stock:set-three -- --apply only after backing up the database and stopping OpenShelf.');
    }
  } finally { await mongoose.disconnect(); }
}
run().catch((error) => { console.error(`Inventory setup failed: ${error.message}`); process.exitCode = 1; });

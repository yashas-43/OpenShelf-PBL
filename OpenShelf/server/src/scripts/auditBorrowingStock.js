import 'dotenv/config';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import { OPEN_BORROWING_STATUSES } from '../services/borrowingRules.js';

/** Read-only reconciliation report: never invent or silently modify real stock. */
async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const activeCounts = await Borrowing.aggregate([
      { $match: { status: { $in: OPEN_BORROWING_STATUSES } } },
      { $group: { _id: '$book', count: { $sum: 1 } } }
    ]);
    const byBook = new Map(activeCounts.map((row) => [String(row._id), row.count]));
    const books = await Book.find({ format: 'physical' }).select('title totalCopies availableCopies').lean();
    let warnings = 0;
    for (const book of books) {
      const active = byBook.get(String(book._id)) || 0;
      const expected = book.totalCopies - active;
      if (expected !== book.availableCopies || expected < 0) {
        warnings += 1;
        console.warn(`STOCK MISMATCH: ${book._id} (${book.title}) total=${book.totalCopies} open=${active} available=${book.availableCopies} expected=${expected}`);
      }
      byBook.delete(String(book._id));
    }
    for (const [id, active] of byBook) {
      warnings += 1;
      console.warn(`MISSING BOOK: ${id} has ${active} active borrowings.`);
    }
    console.log(`Audit complete: ${books.length} actual books checked, ${warnings} warning(s). No records changed.`);
    if (warnings) process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });

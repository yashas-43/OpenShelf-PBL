/**
 * Read-only inventory audit for physical Student Category textbooks.
 * Run from project root: npm run audit:student-stock
 * Never changes MongoDB and never assumes any physical books exist.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import { STUDENT_OPEN_STATUSES } from '../services/studentBorrowingRules.js';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    const textbooks = await StudentTextbook.find().select('level subject totalCopies availableCopies').lean();
    const rows = await StudentBorrowing.aggregate([
      { $match: { status: { $in: STUDENT_OPEN_STATUSES } } },
      { $group: { _id: '$textbook', active: { $sum: 1 } } }
    ]);
    const counts = new Map(rows.map((row) => [String(row._id), row.active]));
    let issues = 0;
    for (const textbook of textbooks) {
      const active = counts.get(String(textbook._id)) || 0;
      const expected = (textbook.totalCopies ?? 0) - active;
      if (expected !== (textbook.availableCopies ?? 0) || expected < 0) {
        issues += 1;
        console.error(`MISMATCH: ${textbook.level} / ${textbook.subject}: ` +
          `physical=${textbook.totalCopies ?? 0}, active=${active}, ` +
          `available=${textbook.availableCopies ?? 0}, expected=${expected}`);
      }
    }
    console.log(`Checked ${textbooks.length} student textbook subjects; ${issues} stock issue(s).`);
    if (issues) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Student stock audit failed: ${error.message}`);
  process.exitCode = 1;
});

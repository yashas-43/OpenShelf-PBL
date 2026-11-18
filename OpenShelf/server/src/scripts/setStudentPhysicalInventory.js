/**
 * Explicit, reviewable one-time inventory setup for Student Category textbooks.
 * Digital PDF ownership does not prove that a physical copy is present.
 *
 * Preview: npm run stock:student-three
 * Apply ONLY if three physical copies of each subject are really held:
 *   npm run stock:student-three -- --apply --confirm-physical-stock
 *
 * Existing active loans are counted before changing available stock.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import { STUDENT_OPEN_STATUSES } from '../services/studentBorrowingRules.js';
import { setStudentInventory } from '../services/studentBorrowingService.js';

const argumentsList = process.argv.slice(2);
const apply = argumentsList.includes('--apply');
const confirmed = argumentsList.includes('--confirm-physical-stock');

async function main() {
  if (argumentsList.some((arg) => !['--apply', '--confirm-physical-stock'].includes(arg))) {
    throw new Error('Supported options: --apply --confirm-physical-stock');
  }
  if (apply && !confirmed) {
    throw new Error('Applying changes requires --confirm-physical-stock. Do not claim copies you do not own.');
  }
  if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI in server/.env.');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    const textbooks = await StudentTextbook.find({ isPublished: true })
      .sort({ level: 1, subject: 1 })
      .select('level subject totalCopies availableCopies');
    const planned = [];
    for (const textbook of textbooks) {
      const loanCount = await StudentBorrowing.countDocuments({
        textbook: textbook._id,
        status: { $in: STUDENT_OPEN_STATUSES },
        returnedAt: null
      });
      if (loanCount > 3) {
        throw new Error(`${textbook.level} / ${textbook.subject} has ${loanCount} active loans. Cannot set its total stock to three.`);
      }
      planned.push({ textbook, loanCount });
    }
    console.log(`Student textbooks: ${planned.length}. Target: 3 total physical copies per confirmed subject.`);
    for (const { textbook, loanCount } of planned) {
      console.log(`  ${textbook.level} / ${textbook.subject}: ${textbook.totalCopies} total → 3 total, ${3 - loanCount} available after ${loanCount} active loan(s)`);
    }
    if (!apply) {
      console.log('PREVIEW ONLY: no database changes. Count your actual physical copies before applying.');
      return;
    }
    for (const { textbook } of planned) {
      await setStudentInventory(String(textbook._id), 3);
    }
    console.log(`Updated ${planned.length} confirmed textbook inventories.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Student inventory setup failed: ${error.message}`);
  process.exitCode = 1;
});

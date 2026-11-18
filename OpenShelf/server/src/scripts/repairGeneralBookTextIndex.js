/**
 * One-time repair for MongoDB's legacy General Books text index.
 *
 * Preview: npm run catalogue:text-index:preview
 * Apply:   npm run catalogue:text-index:apply -- --backup-confirmed
 *
 * No book, loan, account, stock, or PDF records are changed by this script.
 * Rebuilding an index is an administrative operation: back up first, stop the
 * OpenShelf servers, and run this once before catalogue:apply.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  assessGeneralBookTextIndex,
  GENERAL_BOOK_TEXT_FIELDS,
  GENERAL_BOOK_TEXT_OPTIONS
} from '../services/generalBookTextIndex.js';

const args = process.argv.slice(2);
const allowed = new Set(['--preview', '--apply', '--backup-confirmed']);
if (args.some((arg) => !allowed.has(arg))) {
  throw new Error(`Unsupported option. Use ${[...allowed].join(', ')}.`);
}
const applying = args.includes('--apply');
if (applying && !args.includes('--backup-confirmed')) {
  throw new Error('A verified MongoDB backup is required. Pass --backup-confirmed only after backing up.');
}
if (args.includes('--preview') && applying) {
  throw new Error('Choose either --preview or --apply, not both.');
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing in server/.env.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db;
    const exists = await db.listCollections({ name: 'books' }).hasNext();
    const collection = db.collection('books');
    const indexes = exists ? await collection.indexes() : [];
    const assessment = assessGeneralBookTextIndex(indexes);

    console.log(`General Books search index: ${assessment.status.toUpperCase()}`);
    console.log(`Existing index: ${assessment.current?.name || '(none)'}`);
    console.log(`Existing language override: ${assessment.current?.language_override || '(MongoDB default: language)'}`);
    console.log(`Desired search index: ${GENERAL_BOOK_TEXT_OPTIONS.name} (language-independent)`);

    if (assessment.status === 'healthy') {
      console.log('Already repaired. No changes required.');
      return;
    }
    if (!applying) {
      console.log('READ ONLY. Back up MongoDB and stop the website before applying the index repair.');
      return;
    }

    // MongoDB permits only one text index on a collection. Index DDL cannot be
    // wrapped in the application's borrowing transaction, so create only after
    // explicitly dropping the inspected legacy text index.
    if (assessment.current) {
      console.log(`Replacing only the legacy text index: ${assessment.current.name}`);
      await collection.dropIndex(assessment.current.name);
    }

    try {
      await collection.createIndex({ ...GENERAL_BOOK_TEXT_FIELDS }, { ...GENERAL_BOOK_TEXT_OPTIONS });
    } catch (error) {
      console.error('Index creation failed. Book data was NOT deleted. Re-run this repair after fixing the cause.');
      throw error;
    }

    const after = assessGeneralBookTextIndex(await collection.indexes());
    if (after.status !== 'healthy') {
      throw new Error('Text-index verification failed after repair. Review the MongoDB index list.');
    }
    console.log('REPAIRED: Multilingual General Books can retain their original languages, including Sanskrit.');
    console.log('Next: run npm run catalogue:preview, then catalogue:apply after reviewing it.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(`General Books index repair failed: ${error.message}`);
  process.exitCode = 1;
});

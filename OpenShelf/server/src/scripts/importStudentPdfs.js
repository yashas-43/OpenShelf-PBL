/**
 * Metadata-only importer: verifies every local PDF, never uploads/copies large files.
 * Dry run: npm run pdf:check -- --root "D:\\Library\\Textbooks"
 * Import:  npm run pdf:import -- --root "D:\\Library\\Textbooks"
 * The source CSV is bundled at ../../data/Textbooks-Manifest.csv (from project root).
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { validateManifest, summarizeManifest, groupTextbooks } from '../services/studentPdfManifest.js';
import { inspectPdfFile, textbookRoot } from '../services/studentPdfFiles.js';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentPDF from '../models/StudentPDF.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const defaultManifest = path.join(projectRoot, 'data', 'Textbooks-Manifest.csv');

function argumentsFrom(argv) {
  const options = { mode: null, root: process.env.TEXTBOOKS_ROOT, manifest: defaultManifest, confirmed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check' || arg === '--import') options.mode = arg;
    else if (arg === '--root' || arg === '--manifest') {
      if (!argv[i + 1]) throw new Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = argv[++i];
    } else if (arg === '--rights-confirmed') options.confirmed = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.mode) throw new Error('Specify --check or --import.');
  return options;
}

async function run() {
  const options = argumentsFrom(process.argv.slice(2));
  const root = textbookRoot(options.root);
  const manifest = await fs.readFile(path.resolve(options.manifest), 'utf8');
  const rows = validateManifest(manifest);
  const groups = groupTextbooks(rows);
  const problems = [];
  const verified = [];
  for (const row of rows) {
    try {
      const file = await inspectPdfFile(root, row.relativePath);
      verified.push({ ...row, sizeBytes: file.sizeBytes });
    } catch (error) { problems.push(`${row.relativePath}: ${error.message}`); }
  }
  console.log('OpenShelf Student PDFs — local verification');
  for (const item of summarizeManifest(rows)) console.log(`  ${item.level}: ${item.subjects} subjects, ${item.pdfs} PDF files`);
  console.log(`  Textbooks: ${groups.length} (${groups.filter((item) => item.parts.length === 1).length} complete PDFs, ${groups.filter((item) => item.parts.length === 2).length} two-part textbooks)`);
  console.log(`  Verified: ${verified.length}/${rows.length}; errors: ${problems.length}`);
  if (problems.length) {
    for (const problem of problems) console.error(`  ERROR: ${problem}`);
    throw new Error('Import aborted. Fix missing/invalid files before retrying. No database updates were made.');
  }
  if (options.mode === '--check') {
    console.log('Dry run successful. No MongoDB data changed.');
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env before importing.');
  const batch = crypto.randomUUID();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    await Promise.all([StudentTextbook.createIndexes(), StudentPDF.createIndexes()]);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const ids = new Map();
        for (const group of groups) {
          const key = `${group.level}\0${group.subject}`;
          const textbook = await StudentTextbook.findOneAndUpdate(
            { level: group.level, subject: group.subject },
            { $set: { title: group.title, isPublished: true } },
            { upsert: true, new: true, runValidators: true, session }
          );
          ids.set(key, textbook._id);
        }

        // Preserve previous PDF document identities (and reading positions)
        // when a renamed file has exactly one safe match by subject and part.
        // If matching is ambiguous, create a new record rather than guessing.
        const pathsInManifest = new Set(verified.map((row) => row.relativePath.toLowerCase()));
        const renamedIds = new Set();
        let safelyRelinked = 0;
        for (const row of verified) {
          const textbookId = ids.get(`${row.level}\0${row.subject}`);
          let existing = await StudentPDF.findOne({ relativePath: row.relativePath }).session(session);
          if (existing && existing.source !== 'local') {
            throw new Error(`A managed PDF already uses the local path ${row.relativePath}.`);
          }
          if (!existing) {
            const candidates = await StudentPDF.find({
              textbook: textbookId, partNumber: row.partNumber, source: 'local', isActive: true
            }).session(session);
            const safeCandidates = candidates.filter((candidate) =>
              !renamedIds.has(String(candidate._id))
              && !pathsInManifest.has(candidate.relativePath.toLowerCase()));
            if (safeCandidates.length === 1) {
              existing = safeCandidates[0];
              renamedIds.add(String(existing._id));
              safelyRelinked += 1;
            }
          }
          // A renamed file does not automatically inherit publishing rights from an
          // old filename; require explicit confirmation again for that new path.
          const renamed = existing && existing.relativePath !== row.relativePath;
          const update = {
            $set: {
              textbook: textbookId, relativePath: row.relativePath,
              filename: row.filename, displayTitle: row.displayTitle,
              partNumber: row.partNumber, sizeBytes: row.sizeBytes,
              importBatch: batch, isActive: true,
              ...(options.confirmed ? { rightsConfirmed: true } : renamed ? { rightsConfirmed: false } : {})
            },
            // A new local PDF inherits rightsConfirmed: false from the schema.
            // Never set rightsConfirmed in both $set and $setOnInsert.
            $setOnInsert: {
              source: 'local'
            }
          };
          await StudentPDF.updateOne(
            existing ? { _id: existing._id } : { relativePath: row.relativePath },
            update, { upsert: !existing, runValidators: true, session }
          );
        }
        console.log(`Safely relinked ${safelyRelinked} renamed PDF record(s); ambiguous mappings were not guessed.`);
        // The imported manifest is the complete local collection. Retire older local paths,
        // but never erase borrowings, reading history, or document identities.
        await StudentPDF.updateMany({ source: 'local', importBatch: { $ne: batch } }, { $set: { isActive: false } }, { session });
      });
    } finally { await session.endSession(); }
    console.log(`Imported ${verified.length} verified PDFs as ${groups.length} distinct textbook entries.`);
    console.log('No PDF bytes were copied. Keep TEXTBOOKS_ROOT available whenever the server runs.');
    if (!options.confirmed) console.log('Distribution rights are not marked confirmed. Production streaming will remain blocked.');
  } finally { await mongoose.disconnect(); }
}

run().catch((error) => { console.error(`Student PDF import failed: ${error.message}`); process.exitCode = 1; });

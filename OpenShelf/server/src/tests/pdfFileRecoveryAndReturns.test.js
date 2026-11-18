import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectStoredPdfFile } from '../services/studentPdfFiles.js';
import { physicalReturnRequestFilter, PHYSICAL_RETURN_STATUSES } from '../services/physicalReturnRules.js';

/** Build a small valid PDF header, not a real textbook or user-provided PDF. */
async function withTempPdfFolder(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openshelf-pdf-'));
  const subject = path.join(root, 'Class 8', 'English');
  await fs.mkdir(subject, { recursive: true });
  try {
    await run(root, subject);
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
}

const oldRecord = {
  relativePath: 'Class 8/English/8th English SL Part - 1.pdf',
  filename: '8th English SL Part - 1.pdf',
  partNumber: 1
};

test('PDF streaming finds only a unique renamed file in the same subject and part', async () => {
  await withTempPdfFolder(async (root, subject) => {
    await fs.writeFile(path.join(subject, 'Textbook part1.pdf'), '%PDF-1.7\nA file');
    await fs.writeFile(path.join(subject, 'Textbook part2.pdf'), '%PDF-1.7\nAnother file');
    const found = await inspectStoredPdfFile(root, oldRecord);
    assert.equal(found.filename, 'Textbook part1.pdf');
    assert.equal(found.relinked, true);
    assert.match(found.absolutePath, /Textbook part1\.pdf$/);
  });
});

test('PDF streaming never guesses when two possible Part 1 files exist', async () => {
  await withTempPdfFolder(async (root, subject) => {
    await fs.writeFile(path.join(subject, 'Textbook part1.pdf'), '%PDF-1.7\nA');
    await fs.writeFile(path.join(subject, 'Other Part 1.pdf'), '%PDF-1.7\nB');
    await assert.rejects(inspectStoredPdfFile(root, oldRecord), {
      status: 503,
      message: /Multiple possible PDF/
    });
  });
});

test('PDF reader prioritizes the database path when it exists', async () => {
  await withTempPdfFolder(async (root, subject) => {
    await fs.writeFile(path.join(subject, oldRecord.filename), '%PDF-1.7\nCorrect');
    await fs.writeFile(path.join(subject, 'Textbook part1.pdf'), '%PDF-1.7\nUnrelated');
    const found = await inspectStoredPdfFile(root, oldRecord);
    assert.equal(found.filename, oldRecord.filename);
    assert.equal(found.relinked, false);
  });
});

test('physical return requests filter only active, issued, unreturned loans', () => {
  assert.deepEqual([...PHYSICAL_RETURN_STATUSES], ['borrowed', 'overdue']);
  assert.deepEqual(physicalReturnRequestFilter('studentA', 'loan1'), {
    _id: 'loan1',
    user: 'studentA',
    status: { $in: ['borrowed', 'overdue'] },
    issuedAt: { $ne: null },
    returnedAt: null,
    returnRequestedAt: null
  });
});

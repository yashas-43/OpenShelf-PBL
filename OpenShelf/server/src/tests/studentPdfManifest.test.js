import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, validateManifest, summarizeManifest, explicitPartNumber, groupTextbooks } from '../services/studentPdfManifest.js';
import { inspectPdfFile, pdfByteRange, resolveCandidate } from '../services/studentPdfFiles.js';

const manifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/Textbooks-Manifest.csv');
const header = 'Level,Subject,FileName,RelativePath,FullPath,SizeMB';
const row = (file, dir = 'Class 8\\Maths') => `Class 8,Maths,${file},${dir}\\${file},D:\\Library\\Textbooks\\${dir}\\${file},12.5`;

test('new renamed manifest contains 58 PDFs grouped into exactly 37 textbooks', async () => {
  const contents = await fs.readFile(manifestPath, 'utf8');
  const rows = validateManifest(contents);
  const textbooks = groupTextbooks(rows);
  assert.equal(rows.length, 58);
  assert.equal(textbooks.length, 37);
  assert.deepEqual(summarizeManifest(rows).map((x) => x.pdfs), [11, 12, 12, 11, 12]);
  assert.equal(textbooks.filter((entry) => entry.parts.length === 1).length, 16);
  assert.equal(textbooks.filter((entry) => entry.parts.length === 2).length, 21);
  for (const group of textbooks) {
    assert.equal(group.title, 'Textbook');
    if (group.parts.length === 1) {
      assert.equal(group.parts[0].filename, 'Textbook.pdf');
      assert.equal(group.parts[0].displayTitle, 'Textbook');
      assert.equal(group.parts[0].partNumber, null);
    } else {
      assert.deepEqual(group.parts.map((x) => x.filename), ['Textbook part1.pdf', 'Textbook part2.pdf']);
      assert.deepEqual(group.parts.map((x) => x.partNumber), [1, 2]);
    }
  }
  assert.equal(textbooks.find((entry) => entry.level === 'Class 8' && entry.subject === 'Social Science').parts.length, 1);
  assert.equal(textbooks.find((entry) => entry.level === 'Class 9' && entry.subject === 'English').parts.length, 2);
  assert.equal(textbooks.find((entry) => entry.level === '2nd Puc' && entry.subject === 'Physics').parts.length, 1);
  assert.equal(textbooks.find((entry) => entry.level === '2nd Puc' && entry.subject === 'Electronics').parts.length, 1);
  assert.equal(textbooks.find((entry) => entry.level === '2nd Puc' && entry.subject === 'Mathematics').parts.length, 2);
});

test('rejects malformed multipart title groups without inventing missing PDF parts', () => {
  const safe = validateManifest('Level,Subject,BookTitle,FileName,RelativePath\nClass 8,English,Textbook part1,Textbook part1.pdf,Class 8\\English\\Textbook part1.pdf\nClass 8,English,Textbook part2,Textbook part2.pdf,Class 8\\English\\Textbook part2.pdf');
  assert.equal(groupTextbooks(safe)[0].title, 'Textbook');
  assert.deepEqual(groupTextbooks(safe)[0].parts.map((part) => part.partNumber), [1, 2]);
  assert.throws(() => groupTextbooks([safe[0]]), /missing the other part/);
  assert.throws(() => groupTextbooks([safe[0], safe[0]]), /exactly Part 1 and Part 2/);
  assert.throws(() => groupTextbooks([{ ...safe[0], displayTitle: 'Other part1' }, safe[1]]), /share one textbook title/);
  assert.throws(() => groupTextbooks([{ ...safe[0], displayTitle: 'Textbook' }, safe[1]]), /correct PDF part/);
});

test('quoted CSV values and escaped quotes are parsed properly', () => {
  const result = parseCsv('Level,Subject,FileName,RelativePath\r\nClass 8,"Art, Design","book ""one"".pdf","Class 8\\Art, Design\\book ""one"".pdf"\r\n');
  assert.equal(result[0].Subject, 'Art, Design');
  assert.equal(result[0].FileName, 'book "one".pdf');
});

test('preserves exact subject folder names and only explicit part numbers', () => {
  assert.equal(validateManifest(header + '\n' + row('8th Maths Part 1.pdf'))[0].subject, 'Maths');
  const reviewed = validateManifest('Level,Subject,FileName,RelativePath,BookTitle\nClass 8,Maths,maths.pdf,Class 8\\Maths\\maths.pdf,Mathematics Textbook')[0];
  assert.equal(reviewed.displayTitle, 'Mathematics Textbook');
  assert.equal(reviewed.filename, 'maths.pdf');
  assert.equal(explicitPartNumber('9th English SL Part - 2 2026-27.pdf'), 2);
  assert.equal(explicitPartNumber('17 1 PUC Physics P-1 (1).pdf'), 1);
  assert.equal(explicitPartNumber('M1.pdf'), null);
  assert.equal(explicitPartNumber('Computer Science.pdf'), null);
});

test('rejects malformed, duplicate, unknown level and traversal CSV entries', () => {
  assert.throws(() => validateManifest(header + '\n' + row('book.pdf') + '\n' + row('book.pdf')), /Duplicate/);
  assert.throws(() => validateManifest(header + '\nClass 7,Maths,a.pdf,Class 7\\Maths\\a.pdf,,1'), /Unsupported study level/);
  assert.throws(() => validateManifest(header + '\nClass 8,Maths,a.pdf,Class 8\\Maths\\..\\a.pdf,,1'), /RelativePath/);
  assert.throws(() => validateManifest(header + '\nClass 8,Maths,a.pdf,C:\\secret\\a.pdf,,1'), /Absolute PDF path/);
  assert.throws(() => validateManifest(header + '\nClass 8,Maths,a.pdf,Class 8\\Science\\a.pdf,,1'), /RelativePath/);
  assert.throws(() => validateManifest('Level,Subject,FileName\nClass 8,Maths,x.pdf'), /Missing CSV column/);
  assert.throws(() => parseCsv('A,B\n"unterminated,field\n'), /unterminated/);
});

test('file checks verify a real path and PDF magic without copying the file', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshelf-pdf-tests-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const folder = path.join(tempRoot, 'Class 8', 'Maths');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'valid.pdf'), '%PDF-1.7\n%%EOF\n');
  await fs.writeFile(path.join(folder, 'invalid.pdf'), 'THIS IS NOT PDF');
  assert.equal((await inspectPdfFile(tempRoot, 'Class 8/Maths/valid.pdf')).sizeBytes, 15);
  await assert.rejects(inspectPdfFile(tempRoot, 'Class 8/Maths/invalid.pdf'), /missing PDF header/);
  assert.throws(() => resolveCandidate(tempRoot, '../outside.pdf'), /Unsafe relative PDF/);
  assert.throws(() => resolveCandidate(tempRoot, 'C:\\outside.pdf'), /Invalid relative PDF/);
  // A symlink out of root must never serve a file from elsewhere.
  const outside = path.join(os.tmpdir(), `openshelf-outside-${process.pid}.pdf`);
  await fs.writeFile(outside, '%PDF-1.4\n');
  t.after(() => fs.rm(outside, { force: true }));
  await fs.symlink(outside, path.join(folder, 'linked.pdf'));
  await assert.rejects(inspectPdfFile(tempRoot, 'Class 8/Maths/linked.pdf'), /escapes the textbook directory/);
});

test('byte ranges support browser PDF seeking and reject invalid requests', () => {
  assert.equal(pdfByteRange(undefined, 100), null);
  assert.deepEqual(pdfByteRange('bytes=0-24', 100), { start: 0, end: 24 });
  assert.deepEqual(pdfByteRange('bytes=50-', 100), { start: 50, end: 99 });
  assert.deepEqual(pdfByteRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(pdfByteRange('bytes=0-999', 100), { start: 0, end: 99 });
  for (const text of ['bytes=100-', 'bytes=20-10', 'bytes=1-3,6-7', 'bytes=-0', 'garbage']) {
    assert.deepEqual(pdfByteRange(text, 100), { invalid: true });
  }
});

/** PDF file-system boundary: never trust CSV absolute paths or caller-provided paths. */
import path from 'node:path';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { explicitPartNumber } from './studentPdfManifest.js';

const MAX_PDF_BYTES = 500 * 1024 * 1024;

export function textbookRoot(configured = process.env.TEXTBOOKS_ROOT) {
  if (!configured || typeof configured !== 'string' || !path.isAbsolute(configured)) {
    const error = new Error('TEXTBOOKS_ROOT must be configured as an absolute folder path on the server.');
    error.status = 503;
    throw error;
  }
  return path.resolve(configured);
}

export function resolveCandidate(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0') || /^[A-Za-z]:/.test(relativePath)
    || relativePath.startsWith('/') || relativePath.startsWith('\\')) throw new Error('Invalid relative PDF path.');
  const parts = relativePath.split(/[\\/]/);
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('Unsafe relative PDF path.');
  const absolute = path.resolve(root, ...parts);
  const rel = path.relative(root, absolute);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('PDF must be inside the textbook directory.');
  if (!/\.pdf$/i.test(absolute)) throw new Error('PDF file extension required.');
  return absolute;
}

export async function inspectPdfFile(root, relativePath) {
  const candidate = resolveCandidate(root, relativePath);
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(candidate)]);
  const boundary = path.relative(realRoot, realFile);
  if (!boundary || boundary.startsWith('..') || path.isAbsolute(boundary)) throw new Error('Symlink escapes the textbook directory.');
  const info = await stat(realFile);
  if (!info.isFile() || info.size < 5 || info.size > MAX_PDF_BYTES) throw new Error('Invalid PDF size or file type (limit 500 MiB per PDF).');
  const handle = await open(realFile, 'r');
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (header.toString('ascii') !== '%PDF-') throw new Error('File is not a valid PDF (missing PDF header).');
  } finally { await handle.close(); }
  return { absolutePath: realFile, sizeBytes: info.size };
}

/** Returns a strict RFC 7233 single byte-range; multi-range requests are rejected. */
export function pdfByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  let start; let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return { invalid: true };
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return { invalid: true };
  return { start, end: Math.min(size - 1, end) };
}


/**
 * Read a verified, protected PDF even when the student has renamed the physical
 * filename since the last metadata import. A fallback is accepted only when
 * exactly ONE file in the SAME subject folder matches the stored part number.
 * Ambiguous or unrelated PDFs are never guessed.
 *
 * Re-run `npm run pdf:import` after a rename to persist the corrected filename.
 */
export async function inspectStoredPdfFile(root, pdf) {
  try {
    const file = await inspectPdfFile(root, pdf.relativePath);
    return { ...file, relativePath: pdf.relativePath, filename: pdf.filename, relinked: false };
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;

    // The last component is a file name; all candidate files stay in its
    // original, verified study-level and subject folder.
    const original = resolveCandidate(root, pdf.relativePath);
    const folder = path.dirname(original);
    const entries = await readdir(folder, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name));
    const expectedPart = pdf.partNumber ?? null;
    const candidates = files.filter(
      (entry) => explicitPartNumber(entry.name) === expectedPart
    );

    if (candidates.length !== 1) {
      const unavailable = new Error(
        candidates.length > 1
          ? 'Multiple possible PDF files exist for this textbook part. Re-run the manifest importer to select the correct file.'
          : 'The textbook PDF was renamed or removed. Verify the CSV and re-run the manifest importer.'
      );
      unavailable.status = 503;
      throw unavailable;
    }

    // Uses the same PDF-header, size and symlink protections as normal access.
    const candidate = candidates[0].name;
    const relativePath = [...pdf.relativePath.split(/[\\/]/).slice(0, -1), candidate].join('\\');
    const file = await inspectPdfFile(root, relativePath);
    return { ...file, relativePath, filename: candidate, relinked: true };
  }
}

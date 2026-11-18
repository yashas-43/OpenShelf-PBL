import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { textbookRoot, inspectPdfFile } from './studentPdfFiles.js';
import { adminInputError } from '../validators/adminValidation.js';

export const MAX_ADMIN_UPLOAD = 30 * 1024 * 1024;
export const MAX_COVER_UPLOAD = 4 * 1024 * 1024;
const ADMIN_PDF_DIR = 'admin-uploads';

export function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

export function coverExtension(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return 'webp';
  return null;
}

/** Generated internal filenames prevent path traversal and collisions. */
export async function writeManagedPdf(buffer) {
  if (!looksLikePdf(buffer) || buffer.length > MAX_ADMIN_UPLOAD) throw adminInputError('Upload a valid PDF under 30 MiB. Use the local importer for larger files.');
  const root = textbookRoot();
  const fileName = `${randomUUID()}.pdf`;
  const relativePath = `${ADMIN_PDF_DIR}/${fileName}`;
  await mkdir(path.join(root, ADMIN_PDF_DIR), { recursive: true });
  const file = path.join(root, ADMIN_PDF_DIR, fileName);
  await writeFile(file, buffer, { flag: 'wx', mode: 0o600 });
  try { await inspectPdfFile(root, relativePath); }
  catch (error) { await unlink(file).catch(()=>{}); throw error; }
  return { relativePath, absolutePath: file, filename: fileName, sizeBytes: buffer.length };
}

/** Covers have a separate on-disk directory, not an unrestricted public file server. */
export function coversRoot() {
  return path.resolve(process.env.BOOK_COVER_ROOT || path.join(process.cwd(), 'cover-uploads'));
}
export async function writeCover(buffer, bookId) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_COVER_UPLOAD) throw adminInputError('Cover is limited to 4 MiB.');
  const extension = coverExtension(buffer);
  if (!extension) throw adminInputError('Upload a real JPG, PNG, or WebP image.');
  const folder = coversRoot();
  await mkdir(folder, { recursive: true });
  const destination = path.join(folder, `${bookId}.${extension}`);
  await writeFile(destination, buffer, { flag:'w', mode:0o600 });
  return { extension, destination };
}

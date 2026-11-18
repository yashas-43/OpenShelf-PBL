import { OPENSHELF_ADMIN_EMAIL } from '../services/accountRetirementRules.js';
import { createReadStream } from 'node:fs';
import jwt from 'jsonwebtoken';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentPDF from '../models/StudentPDF.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import { studentPublicAvailability } from '../services/studentBorrowingRules.js';
import { expectedReturnsByBook } from '../services/publicBookAvailability.js';
import ReadingHistory from '../models/ReadingHistory.js';
import User from '../models/User.js';
import { hasSubjectAccess } from '../services/paymentService.js';
import { LEVELS } from '../services/studentPdfManifest.js';
import { inspectStoredPdfFile, pdfByteRange, textbookRoot } from '../services/studentPdfFiles.js';
import { classifySubjectPdfBundle } from '../services/subjectPdfBundle.js';

const COOKIE_NAME = 'os_student_pdf_access';
const COOKIE_PATH = '/api/student-pdfs/files';
const PDF_TICKET_MS = 20 * 60 * 1000;
// Test-mode purchases still require published Student PDFs and verified distribution rights.
// Even the test checkout must never provide unlicensed textbook files.
const allowedPdf = (pdf) => Boolean(pdf?.isActive && pdf.rightsConfirmed);

function cookieValue(req, key) {
  for (const item of (req.headers.cookie || '').split(';')) {
    const delimiter = item.indexOf('=');
    if (delimiter !== -1 && item.slice(0, delimiter).trim() === key) return item.slice(delimiter + 1).trim();
  }
  return null;
}

async function activePdf(id) {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;
  const pdf = await StudentPDF.findById(id).lean();
  if (!allowedPdf(pdf)) return null;
  const group = await StudentTextbook.findById(pdf.textbook).select('level subject title isPublished').lean();
  if (!group?.isPublished || !LEVELS.includes(group.level)) return null;
  return { pdf, group };
}

function errorResponse(error, res, next) {
  if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return res.status(503).json({ success: false, message: 'This PDF is unavailable on the server. Check TEXTBOOKS_ROOT and re-run the importer.' });
  if (error?.status) return res.status(error.status).json({ success: false, message: error.message });
  return next(error);
}

export async function catalog(req, res, next) {
  try {
    const level = req.query.level;
    if (!LEVELS.includes(level)) return res.status(400).json({ success: false, message: 'Choose a valid School class or PUC year.' });
    const textbooks = await StudentTextbook.find({ level, isPublished: true }).sort({ subject: 1 }).lean();
    if (!textbooks.length) return res.json({ success: true, level, subjects: [], imported: false });
    const docs = await StudentPDF.find({ textbook: { $in: textbooks.map((x) => x._id) }, isActive: true }).lean();
    const byTextbook = new Map();
    for (const pdf of docs) {
      const id = String(pdf.textbook);
      if (!byTextbook.has(id)) byTextbook.set(id, []);
      byTextbook.get(id).push(pdf);
    }
    // A subject appears as a purchasable PDF only after every part is both
    // authorised and accessible on disk. The school/PUC catalogue still
    // remains browseable for physical borrowing when no digital file exists.
    const pdfBundles = new Map(await Promise.all(textbooks.map(async (group) => {
      const id = String(group._id);
      const bundle = classifySubjectPdfBundle(byTextbook.get(id) || []);
      if (!bundle.ready) return [id, bundle];
      try {
        await Promise.all(bundle.parts.map((pdf) => inspectStoredPdfFile(textbookRoot(), pdf)));
        return [id, bundle];
      } catch {
        return [id, { ready: false, status: 'file_unavailable', parts: [] }];
      }
    })));
    // Each subject has one physical inventory record, even if its PDF has two parts.
    // Return estimates come from actual issued physical loans, not invented dates.
    const soldOut = textbooks.filter((item) => item.availableCopies < 1);
    const deadlineRows = soldOut.length ? await StudentBorrowing.aggregate([
      { $match: {
        textbook: { $in: soldOut.map((item) => item._id) },
        status: { $in: ['borrowed', 'overdue'] },
        returnedAt: null,
        dueAt: { $type: 'date' }
      } },
      { $group: { _id: '$textbook', dueDates: { $push: '$dueAt' } } }
    ]) : [];
    const deadlines = expectedReturnsByBook(deadlineRows);

    const subjects = textbooks.map((group) => {
      const bundle = pdfBundles.get(String(group._id));
      return {
        id: group._id, subject: group.subject, title: group.title, free: false, pricePaise: 1000,
        pdfStatus: bundle?.status || 'not_uploaded',
        physical: studentPublicAvailability(group, deadlines.get(String(group._id))),
        parts: (bundle?.parts || []).map((pdf) => ({
          id: pdf._id, filename: pdf.filename, displayTitle: pdf.displayTitle || pdf.filename,
          partNumber: pdf.partNumber, sizeBytes: pdf.sizeBytes
        }))
      };
    }); // Never imply PDF availability when it is not ready or permitted.
    return res.json({ success: true, level, subjects, imported: subjects.length > 0 });
  } catch (error) { return next(error); }
}

export async function issueReaderAccess(req, res, next) {
  try {
    const result = await activePdf(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Student PDF not found or not published.' });
    if (req.auth.role === 'student' && !await hasSubjectAccess(req.auth.sub, result.group._id)) {
      return res.status(402).json({ success: false, code: 'SUBJECT_PURCHASE_REQUIRED',
        message: 'Complete the ₹10 simulated checkout (no real charge) before opening the PDF.' });
    }
    const resolved = await inspectStoredPdfFile(textbookRoot(), result.pdf);
    const ticket = jwt.sign({ sub: req.auth.sub, role: req.auth.role, version: req.auth.version,
      email: req.auth.email, pdf: String(result.pdf._id), scope: 'student-pdf-stream' },
    process.env.JWT_SECRET, { issuer: 'openshelf-pdf', audience: 'pdf-stream', expiresIn: '20m' });
    const streamPath = `/api/student-pdfs/files/${result.pdf._id}`;
    res.cookie(COOKIE_NAME, ticket, {
      path: COOKIE_PATH, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: PDF_TICKET_MS
    });
    let lastPage = 1;
    if (req.auth.role === 'student') {
      const record = await ReadingHistory.findOneAndUpdate({ user: req.auth.sub, pdf: result.pdf._id },
        { $set: { lastOpenedAt: new Date() }, $setOnInsert: { lastPage: 1 } },
        { new: true, upsert: true, runValidators: true });
      lastPage = record.lastPage;
    }
    return res.json({
      success: true,
      streamPath,
      lastPage,
      filename: resolved.filename,
      displayTitle: result.pdf.displayTitle || resolved.filename,
      validForMinutes: 20,
      renamedOnDisk: resolved.relinked
    });
  } catch (error) { return errorResponse(error, res, next); }
}

async function authorizedStreamTicket(req, pdfId) {
  const token = cookieValue(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'openshelf-pdf', audience: 'pdf-stream' });
    if (claims.scope !== 'student-pdf-stream' || claims.pdf !== pdfId) return null;
    if (claims.role === 'admin') return claims.sub === 'configured-admin'
      && String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() === OPENSHELF_ADMIN_EMAIL
      && claims.email === OPENSHELF_ADMIN_EMAIL ? claims : null;
    if (claims.role !== 'student') return null;
    const user = await User.findById(claims.sub).select('isActive sessionVersion role').lean();
    return user?.isActive && user.role === 'student' && (claims.version ?? 0) === user.sessionVersion ? claims : null;
  } catch { return null; }
}

export async function streamPdf(req, res, next) {
  try {
    const access = await authorizedStreamTicket(req, req.params.id);
    if (!access) return res.status(401).json({ success: false, message: 'PDF access expired. Open the textbook again from the Student Library.' });
    const result = await activePdf(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Student PDF not found.' });
    if (access.role === 'student' && !await hasSubjectAccess(access.sub, result.group._id)) {
      return res.status(403).json({ success: false, message: 'Purchase required for this PDF.' });
    }
    const file = await inspectStoredPdfFile(textbookRoot(), result.pdf);
    const range = pdfByteRange(req.headers.range, file.sizeBytes);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="textbook.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': `frame-ancestors ${process.env.CLIENT_URL || 'http://localhost:5173'}`
    });
    // Helmet defaults to SAMEORIGIN X-Frame-Options, but Vite uses a separate port.
    // CSP frame-ancestors above constrains which frontend may embed this PDF.
    res.removeHeader('X-Frame-Options');
    if (range?.invalid) return res.status(416).set('Content-Range', `bytes */${file.sizeBytes}`).end();
    if (range) {
      res.status(206).set({
        'Content-Range': `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
        'Content-Length': String(range.end - range.start + 1)
      });
    } else res.status(200).set('Content-Length', String(file.sizeBytes));
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(file.absolutePath, range ? { start: range.start, end: range.end } : {});
    stream.on('error', (error) => { if (res.headersSent) res.destroy(error); else next(error); });
    res.on('close', () => stream.destroy());
    return stream.pipe(res);
  } catch (error) { return errorResponse(error, res, next); }
}

export async function saveReadingPage(req, res, next) {
  try {
    const page = req.body?.page;
    if (!Number.isInteger(page) || page < 1 || page > 5000) return res.status(400).json({ success: false, message: 'Page must be a whole number between 1 and 5000.' });
    const result = await activePdf(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Student PDF not found.' });
    if (!await hasSubjectAccess(req.auth.sub, result.group._id)) {
      return res.status(403).json({ success: false, message: 'Purchase required for this PDF.' });
    }
    const record = await ReadingHistory.findOneAndUpdate({ user: req.auth.sub, pdf: req.params.id },
      { $set: { lastPage: page, lastOpenedAt: new Date() } }, { upsert: true, new: true, runValidators: true });
    return res.json({ success: true, lastPage: record.lastPage });
  } catch (error) { return next(error); }
}

export async function readingHistory(req, res, next) {
  try {
    const records = await ReadingHistory.find({ user: req.auth.sub }).sort({ lastOpenedAt: -1 }).limit(100)
      .populate('pdf', 'filename displayTitle textbook isActive').lean();
    const textbookIds = [...new Set(records.filter((record) => record.pdf).map((record) => String(record.pdf.textbook)))];
    const groups = await StudentTextbook.find({ _id: { $in: textbookIds } }).select('level subject').lean();
    const map = new Map(groups.map((group) => [String(group._id), group]));
    const entries = records.flatMap((record) => {
      if (!record.pdf?.isActive || !map.has(String(record.pdf.textbook))) return [];
      const group = map.get(String(record.pdf.textbook));
      return [{ pdfId: record.pdf._id, filename: record.pdf.filename, displayTitle: record.pdf.displayTitle || record.pdf.filename, level: group.level,
        subject: group.subject, lastPage: record.lastPage, lastOpenedAt: record.lastOpenedAt }];
    });
    return res.json({ success: true, data: entries });
  } catch (error) { return next(error); }
}

/** Clear the single file-scoped reading ticket when the user signs out. */
export function clearReaderAccess(_req, res) {
  res.clearCookie(COOKIE_NAME, {
    path: COOKIE_PATH, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production'
  });
  return res.json({ success: true });
}

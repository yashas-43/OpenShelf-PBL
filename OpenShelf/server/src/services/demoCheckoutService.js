import mongoose from 'mongoose';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentPDF from '../models/StudentPDF.js';
import DemoCheckout from '../models/DemoCheckout.js';
import Purchase from '../models/Purchase.js';
import { classifySubjectPdfBundle } from './subjectPdfBundle.js';
import { inspectStoredPdfFile, textbookRoot } from './studentPdfFiles.js';
import { DEMO_PRICE_PAISE, demoReadyForCompletion } from './demoCheckoutRules.js';

export async function startDemoCheckout(userId, subjectId) {
  if (!mongoose.isValidObjectId(subjectId)) return { status: 400, message: 'Invalid textbook subject.' };
  const subject = await StudentTextbook.findOne({ _id: subjectId, isPublished: true }).lean();
  if (!subject) return { status: 404, message: 'Textbook subject is not published.' };
  const [demoOwned, realOwned] = await Promise.all([
    DemoCheckout.exists({ user: userId, textbook: subjectId, status: 'completed' }),
    Purchase.exists({ user: userId, itemType: 'student_textbook', itemId: subjectId, status: 'completed' })
  ]);
  if (demoOwned || realOwned) return { alreadyOwned: true, subjectId };
  const pdfs = await StudentPDF.find({ textbook: subjectId, isActive: true }).lean();
  const bundle = classifySubjectPdfBundle(pdfs);
  if (!bundle.ready) return { status: 409, message: 'An authorised, complete PDF (including all parts) must be published before demo access.' };
  try { await Promise.all(bundle.parts.map(pdf => inspectStoredPdfFile(textbookRoot(), pdf))); }
  catch { return { status: 503, message: 'PDF files are missing from the server. No demo access granted.' }; }
  // Restart pending sessions on each Buy Access attempt, but never rewrite completed entitlements.
  const now = new Date();
  let record;
  try {
    record = await DemoCheckout.findOneAndUpdate(
      { user: userId, textbook: subjectId, status: 'pending' },
      { $set: { startedAt: now, completedAt: null, amountPaise: DEMO_PRICE_PAISE },
        $setOnInsert: { user: userId, textbook: subjectId, status: 'pending' } },
      { upsert: true, new: true, runValidators: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    record = await DemoCheckout.findOne({ user: userId, textbook: subjectId });
    if (record?.status === 'completed') return { alreadyOwned: true, subjectId };
    if (!record) throw error;
  }
  return { checkoutId: String(record._id), amountPaise: DEMO_PRICE_PAISE, subjectId, waitMs: 2000, mode: 'demo', realPayment: false };
}

export async function completeDemoCheckout(userId, checkoutId) {
  if (!mongoose.isValidObjectId(checkoutId)) return { status: 400, message: 'Invalid demo checkout.' };
  const checkout = await DemoCheckout.findOne({ _id: checkoutId, user: userId });
  if (!checkout) return { status: 404, message: 'Demo checkout not found.' };
  if (checkout.status === 'completed') return { completed: true, subjectId: checkout.textbook, alreadyProcessed: true };
  if (!demoReadyForCompletion(checkout.startedAt)) {
    return { status: 409, message: 'Demo checkout is still processing. Wait 2 seconds and try again.' };
  }
  // Re-check publication, rights, completeness and local files at completion time.
  const subject = await StudentTextbook.findOne({ _id: checkout.textbook, isPublished: true }).lean();
  if (!subject) return { status: 409, message: 'Textbook subject is no longer published.' };
  const parts = await StudentPDF.find({ textbook: checkout.textbook, isActive: true }).lean();
  const bundle = classifySubjectPdfBundle(parts);
  if (!bundle.ready) return { status: 409, message: 'The textbook PDF bundle is not approved or is incomplete.' };
  try { await Promise.all(bundle.parts.map(pdf => inspectStoredPdfFile(textbookRoot(), pdf))); }
  catch { return { status: 503, message: 'Textbook PDF files are unavailable. Demo access not granted.' }; }
  const saved = await DemoCheckout.findOneAndUpdate(
    { _id: checkout._id, user: userId, status: 'pending', startedAt: checkout.startedAt },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!saved) {
    const current = await DemoCheckout.findById(checkout._id).lean();
    if (current?.status === 'completed') return { completed: true, subjectId: current.textbook, alreadyProcessed: true };
    return { status: 409, message: 'Demo checkout was restarted. Please retry from Buy Access.' };
  }
  return { completed: true, subjectId: saved.textbook, realPayment: false };
}

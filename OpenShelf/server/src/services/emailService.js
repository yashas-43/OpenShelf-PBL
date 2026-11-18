import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import EmailLog from '../models/EmailLog.js';
import User from '../models/User.js';
import { buildMail, buildOtpMail, buildRegistrationOtpMail } from './emailTemplates.js';

const MAX_ATTEMPTS = 5;
const SMTP_TIMEOUT_MS = 12000;
let transporter = null;
let transporterKey = '';

export function emailConfigured() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  if (!emailConfigured()) return null;
  const key = [process.env.EMAIL_HOST, process.env.EMAIL_PORT, process.env.EMAIL_USER, process.env.EMAIL_PASS].join('|');
  if (transporter && transporterKey === key) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: SMTP_TIMEOUT_MS, greetingTimeout: SMTP_TIMEOUT_MS, socketTimeout: SMTP_TIMEOUT_MS
  });
  transporterKey = key;
  return transporter;
}

const safeErrorCode = (error) => {
  const code = String(error?.code || error?.responseCode || 'SEND_FAILED');
  return /^[A-Z_0-9-]{1,40}$/.test(code) ? code : 'SEND_FAILED';
};

function verifyRecipient(info, address) {
  if (!info?.accepted?.some((accepted) => String(accepted).toLowerCase() === address.toLowerCase())) {
    const error = new Error('SMTP server did not accept the intended recipient.');
    error.code = 'RECIPIENT_NOT_ACCEPTED';
    throw error;
  }
}

/** Queue on the same MongoDB session as a loan mutation so an outbox row survives the commit. */
export async function queueEmail({ userId, kind, eventKey, details = {} }, session = null) {
  const values = { user: userId, kind, eventKey, details, status: 'pending' };
  try {
    const options = session ? { session } : {};
    const [log] = await EmailLog.create([values], options);
    return log;
  } catch (error) {
    // Safe for repeat reminder scans; unique event keys suppress duplicate emails.
    if (error.code === 11000 && !session) return EmailLog.findOne({ eventKey });
    throw error;
  }
}

export async function deliverEmailByEvent(eventKey) {
  const log = await EmailLog.findOne({ eventKey }).select('_id');
  if (!log) return { status: 'not_queued' };
  return deliverEmailLog(log._id);
}

/** Claims the row before SMTP and records its actual result. No pretend delivery. */
export async function deliverEmailLog(logId) {
  const now = new Date();
  if (!emailConfigured()) {
    await EmailLog.updateOne({ _id: logId, status: { $in: ['pending', 'failed', 'not_configured'] } },
      { $set: { status: 'not_configured', lastErrorCode: 'SMTP_NOT_CONFIGURED' } });
    return { status: 'not_configured' };
  }
  const log = await EmailLog.findOneAndUpdate({
    _id: logId, status: { $in: ['pending', 'failed', 'not_configured'] },
    attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now }
  }, {
    $set: { status: 'sending', lastAttemptAt: now, lastErrorCode: null }, $inc: { attempts: 1 }
  }, { new: true });
  if (!log) return { status: 'already_processing_or_sent' };
  try {
    const user = await User.findById(log.user).select('email fullName isActive').lean();
    if (!user?.email || !user.isActive) {
      const error = new Error('Account unavailable for email notification.');
      error.code = 'RECIPIENT_UNAVAILABLE';
      throw error;
    }
    const content = buildMail(log.kind, user, log.details || {});
    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: user.email,
      ...content
    });
    verifyRecipient(info, user.email);
    await EmailLog.updateOne({ _id: log._id, status: 'sending' }, {
      $set: { status: 'sent', sentAt: new Date(), providerMessageId: String(info.messageId || '').slice(0, 300), lastErrorCode: null }
    });
    if (log.kind === 'registration') await User.updateOne({ _id: user._id }, { $set: { emailConfirmationSentAt: new Date() } });
    return { status: 'sent' };
  } catch (error) {
    const delay = Math.min(24 * 60 * 60 * 1000, 5 * 60_000 * 2 ** Math.max(0, log.attempts - 1));
    await EmailLog.updateOne({ _id: log._id, status: 'sending' }, { $set: {
      status: 'failed', lastErrorCode: safeErrorCode(error), nextAttemptAt: new Date(Date.now() + delay)
    } });
    return { status: 'failed' };
  }
}

/**
 * Registration happens before a User record exists, so send directly using SMTP.
 * No OTP is written to an email outbox, logs or saved as plaintext in MongoDB.
 * SMTP acceptance is not proof of inbox delivery; the user must enter the code.
 */
export async function sendRegistrationEmailCode({ email, fullName, code }) {
  const mailer = getTransporter();
  if (!mailer) {
    const error = new Error('Email verification is unavailable. Configure Gmail SMTP in server/.env.');
    error.status = 503;
    throw error;
  }
  try {
    const info = await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      ...buildRegistrationOtpMail({ fullName }, code)
    });
    verifyRecipient(info, email);
    return { status: 'accepted' };
  } catch {
    const error = new Error('Gmail SMTP could not accept the registration code. Check email settings and retry.');
    error.status = 503;
    throw error;
  }
}

/** OTP mail bypasses the retry queue so an OTP never needs to be stored in plaintext. */
export async function sendPasswordResetCode(user, otp, challengeId) {
  const eventKey = `password-reset:${challengeId}:${randomUUID()}`;
  const [log] = await EmailLog.create([{
    user: user._id, eventKey, kind: 'password_reset_code', details: {},
    status: 'sending', attempts: 1, lastAttemptAt: new Date()
  }]);
  try {
    const mailer = getTransporter();
    if (!mailer) {
      const error = new Error('SMTP not configured.');
      error.code = 'SMTP_NOT_CONFIGURED';
      throw error;
    }
    const info = await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER, to: user.email,
      ...buildOtpMail(user, otp)
    });
    verifyRecipient(info, user.email);
    await EmailLog.updateOne({ _id: log._id }, { $set: {
      status: 'sent', sentAt: new Date(), providerMessageId: String(info.messageId || '').slice(0, 300)
    } });
    return { status: 'sent' };
  } catch (error) {
    await EmailLog.updateOne({ _id: log._id }, { $set: {
      status: emailConfigured() ? 'failed' : 'not_configured', lastErrorCode: safeErrorCode(error)
    } });
    return { status: emailConfigured() ? 'failed' : 'not_configured' };
  }
}

/** Called by the scheduled job or npm run email:process; uses a bounded batch. */
export async function processEmailQueue(limit = 50) {
  // A worker may have crashed after claiming a message. Retrying after a lease expires is at-least-once.
  await EmailLog.updateMany({ status: 'sending', lastAttemptAt: { $lt: new Date(Date.now() - 15 * 60_000) }, kind: { $ne: 'password_reset_code' } },
    { $set: { status: 'failed', nextAttemptAt: new Date(), lastErrorCode: 'STALE_DELIVERY_LEASE' } });
  const pending = await EmailLog.find({
    kind: { $ne: 'password_reset_code' },
    status: { $in: ['pending', 'failed', 'not_configured'] },
    attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: new Date() }
  }).sort({ createdAt: 1 }).limit(Math.min(100, Math.max(1, limit))).select('_id').lean();
  const summary = { considered: pending.length, sent: 0, failed: 0, notConfigured: 0 };
  for (const item of pending) {
    const result = await deliverEmailLog(item._id);
    if (result.status === 'sent') summary.sent += 1;
    if (result.status === 'failed') summary.failed += 1;
    if (result.status === 'not_configured') summary.notConfigured += 1;
    if (result.status === 'not_configured') break;
  }
  return summary;
}

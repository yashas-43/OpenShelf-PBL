import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { eligiblePasswordResetLookup } from './passwordResetEligibility.js';
import PasswordResetCode from '../models/PasswordResetCode.js';
import { queueEmail, sendPasswordResetCode, deliverEmailByEvent } from './emailService.js';
import {
  generateOtp, hashSecret, newChallengeId, newResetToken, OTP_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS, OTP_VALID_MINUTES, securelyEquals, validPassword
} from './passwordResetRules.js';

const invalid = () => Object.assign(new Error('Invalid or expired verification code or reset token.'), { status: 400 });
export const RESET_REQUEST_MESSAGE = 'If this email belongs to an active OpenShelf student account, a verification code will be sent. Check your inbox and spam folder. Without a registered account and a valid code, the password cannot be reset.';

export async function requestPasswordReset(email) {
  const lookup = eligiblePasswordResetLookup(email, process.env.ADMIN_EMAIL);
  if (!lookup) return;

  // Only a registered, active, non-archived student can receive a reset code.
  const user = await User.findOne(lookup);
  // No admin reset via this flow: the configured administrator secret is managed outside MongoDB.
  if (!user) return;
  const now = new Date();
  const otp = generateOtp();
  const challengeId = newChallengeId();
  const value = {
    codeHash: hashSecret('otp', user._id, challengeId, otp), challengeId,
    attempts: 0, expiresAt: new Date(now.getTime() + OTP_VALID_MINUTES * 60_000),
    resendAfter: new Date(now.getTime() + OTP_COOLDOWN_SECONDS * 1000),
    resetTokenHash: null, verifiedAt: null
  };
  const existing = await PasswordResetCode.findOne({ user: user._id }).select('resendAfter');
  if (existing) {
    if (existing.resendAfter > now) return;
    const result = await PasswordResetCode.updateOne({ _id: existing._id, resendAfter: { $lte: now } }, { $set: value });
    if (!result.modifiedCount) return;
  } else {
    try { await PasswordResetCode.create({ user: user._id, ...value }); }
    catch (error) { if (error.code === 11000) return; throw error; }
  }
  // Never log OTP text. An SMTP failure leaves a logged attempt, not a fake success.
  await sendPasswordResetCode(user, otp, challengeId);
}

export async function verifyPasswordResetCode(email, code) {
  const lookup = eligiblePasswordResetLookup(email, process.env.ADMIN_EMAIL);
  if (!lookup) throw invalid();
  const user = await User.findOne(lookup).select('_id');
  if (!user || !/^\d{6}$/.test(String(code || ''))) throw invalid();
  // Atomically debit one attempt even when the submitted code is wrong.
  const row = await PasswordResetCode.findOneAndUpdate({
    user: user._id, expiresAt: { $gt: new Date() },
    attempts: { $lt: OTP_MAX_ATTEMPTS }, codeHash: { $ne: null }
  }, { $inc: { attempts: 1 } }, { new: true }).select('+codeHash +resetTokenHash');
  if (!row || !securelyEquals(row.codeHash, hashSecret('otp', user._id, row.challengeId, code))) throw invalid();
  const token = newResetToken();
  const tokenHash = hashSecret('reset-token', user._id, row.challengeId, token);
  const result = await PasswordResetCode.updateOne({ _id: row._id, codeHash: row.codeHash, resetTokenHash: null },
    { $set: { codeHash: null, resetTokenHash: tokenHash, verifiedAt: new Date() } });
  if (!result.modifiedCount) throw invalid();
  return token;
}

export async function completePasswordReset(email, token, password, confirmPassword) {
  if (!validPassword(password) || password !== confirmPassword || !/^[a-f\d]{64}$/.test(String(token || ''))) {
    throw Object.assign(new Error('Enter a valid reset token and matching passwords (8–72 characters).'), { status: 400 });
  }
  const lookup = eligiblePasswordResetLookup(email, process.env.ADMIN_EMAIL);
  if (!lookup) throw invalid();
  const user = await User.findOne(lookup).select('_id');
  if (!user) throw invalid();
  const passwordHash = await bcrypt.hash(password, 12);
  const eventKey = `password-changed:${newChallengeId()}`;
  await mongoose.connection.transaction(async (session) => {
    const row = await PasswordResetCode.findOne({ user: user._id, expiresAt: { $gt: new Date() }, resetTokenHash: { $ne: null } })
      .session(session).select('+resetTokenHash');
    if (!row || !securelyEquals(row.resetTokenHash, hashSecret('reset-token', user._id, row.challengeId, token))) throw invalid();
    const used = await PasswordResetCode.deleteOne({ _id: row._id, resetTokenHash: row.resetTokenHash }, { session });
    if (used.deletedCount !== 1) throw invalid();
    const updated = await User.updateOne({ _id: user._id, isActive: true },
      { $set: { passwordHash }, $inc: { sessionVersion: 1 } }, { session });
    if (updated.modifiedCount !== 1) throw invalid();
    await queueEmail({ userId: user._id, kind: 'password_changed', eventKey }, session);
  });
  await deliverEmailByEvent(eventKey).catch(() => ({ status: 'failed' }));
  return { success: true };
}

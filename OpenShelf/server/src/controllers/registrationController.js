import bcrypt from 'bcryptjs';
import { OPENSHELF_ADMIN_EMAIL } from '../services/accountRetirementRules.js';
import PendingRegistration from '../models/PendingRegistration.js';
import User from '../models/User.js';
import { REGISTRATION_OTP_COOLDOWN_MS, REGISTRATION_OTP_MAX_ATTEMPTS,
  REGISTRATION_OTP_TTL_MS, createRegistrationOtp, matchesOtp, normalizeIndianPhone, otpDigest } from '../services/registrationOtpRules.js';
import { issueStudentToken } from './authController.js';
import { queueEmail, deliverEmailByEvent, emailConfigured, sendRegistrationEmailCode } from '../services/emailService.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function invalid(res, message, status = 400) { return res.status(status).json({ success: false, message }); }

export async function requestRegistrationOtp(req, res, next) {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = normalizeIndianPhone(req.body.phone);
    const password = String(req.body.password || '');
    if (fullName.length < 2 || fullName.length > 80) return invalid(res, 'Full name must be 2–80 characters.');
    if (!emailPattern.test(email) || email.length > 254) return invalid(res, 'Enter a valid email address.');
    if (!phone) return invalid(res, 'Enter a valid ten-digit Indian mobile number starting with 6–9.');
    if (password.length < 8 || password.length > 72 || password !== req.body.confirmPassword) return invalid(res, 'Check password and confirmation (8–72 characters).');
    if (email === OPENSHELF_ADMIN_EMAIL
      || email === String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()) return invalid(res, 'This email cannot be registered.', 409);
    if (await User.exists({ email })) return invalid(res, 'This email is already registered.', 409);
    if (!emailConfigured()) return invalid(res, 'Email verification is not available. Configure Gmail SMTP in server/.env.', 503);

    const now = new Date();
    const pending = await PendingRegistration.findOne({ email }).select('+otpHash +passwordHash');
    if (pending && now.getTime() - pending.lastSentAt.getTime() < REGISTRATION_OTP_COOLDOWN_MS) {
      return invalid(res, 'Please wait 60 seconds before requesting another email code.', 429);
    }
    const otp = createRegistrationOtp();
    const passwordHash = await bcrypt.hash(password, 12);
    const challengeId = pending?._id || new PendingRegistration()._id;
    const otpHash = otpDigest(String(challengeId), otp, process.env.REGISTRATION_OTP_SECRET);
    // Reserve a single-use challenge, but prevent verification until SMTP accepts the code.
    const challenge = await PendingRegistration.findOneAndUpdate({ email }, { $set: {
      fullName, phone, passwordHash, otpHash, attempts: 0, lastSentAt: now,
      emailAcceptedAt: null,
      expiresAt: new Date(now.getTime() + REGISTRATION_OTP_TTL_MS)
    }, $setOnInsert: { _id: challengeId } }, { upsert: true, runValidators: true, new: true });
    try {
      await sendRegistrationEmailCode({ email, fullName, code: otp });
    } catch (error) {
      // Failed SMTP acceptance must never be represented as successful registration.
      await PendingRegistration.deleteOne({ _id: challenge._id, otpHash }).catch(() => {});
      throw error;
    }
    const accepted = await PendingRegistration.updateOne({ _id: challenge._id, otpHash },
      { $set: { emailAcceptedAt: new Date() } });
    if (accepted.modifiedCount !== 1) return invalid(res, 'Registration request changed. Request another email code.', 409);
    return res.json({ success: true, message: 'Email verification code requested. Check your inbox and spam folder for the six-digit code. It expires in five minutes.' });
  } catch (error) {
    if (error.code === 11000) return invalid(res, 'Registration is being processed. Try again.', 409);
    return next(error);
  }
}

export async function confirmRegistrationOtp(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    if (!emailPattern.test(email) || !/^[0-9]{6}$/.test(code)) return invalid(res, 'Enter the six-digit code sent to your email.');
    const pending = await PendingRegistration.findOne({ email }).select('+otpHash +passwordHash');
    if (!pending || !pending.emailAcceptedAt || pending.expiresAt.getTime() < Date.now() || pending.attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
      return invalid(res, 'Code expired or too many attempts. Request a new one.', 400);
    }
    // Atomic attempt increment guards brute-force even under concurrent requests.
    const counted = await PendingRegistration.updateOne({ _id: pending._id, attempts: { $lt: REGISTRATION_OTP_MAX_ATTEMPTS }, emailAcceptedAt: { $ne: null }, expiresAt: { $gt: new Date() } }, { $inc: { attempts: 1 } });
    if (counted.modifiedCount !== 1) return invalid(res, 'Too many attempts. Request a new code.', 429);
    if (!matchesOtp(pending.otpHash, String(pending._id), code, process.env.REGISTRATION_OTP_SECRET)) return invalid(res, 'Incorrect verification code.');
    // Claim the challenge exactly once so two successful verifications cannot create two users.
    const claimed = await PendingRegistration.findOneAndDelete({ _id: pending._id, otpHash: pending.otpHash });
    if (!claimed) return invalid(res, 'This verification code was already used.', 409);
    const user = await User.create({ fullName: pending.fullName, email: pending.email, phone: pending.phone,
      emailVerifiedAt: new Date(), passwordHash: pending.passwordHash });
    let emailStatus = 'not_configured';
    try {
      const eventKey = `registration:${user._id}`;
      await queueEmail({ userId: user._id, kind: 'registration', eventKey });
      emailStatus = (await deliverEmailByEvent(eventKey)).status;
    } catch { emailStatus = 'failed'; }
    return res.status(201).json({ success: true, message: 'Email verified and OpenShelf account created.',
      user: user.toSafeJSON(), token: issueStudentToken(user), emailStatus });
  } catch (error) {
    if (error.code === 11000) return invalid(res, 'An account with this email already exists.', 409);
    return next(error);
  }
}

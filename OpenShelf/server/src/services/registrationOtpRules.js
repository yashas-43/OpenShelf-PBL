import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const REGISTRATION_OTP_TTL_MS = 5 * 60 * 1000;
export const REGISTRATION_OTP_COOLDOWN_MS = 60 * 1000;
export const REGISTRATION_OTP_MAX_ATTEMPTS = 4;
export const phonePattern = /^[6-9][0-9]{9}$/;

export function normalizeIndianPhone(value) {
  // Require exactly ten mobile digits, not a login identifier. Distinct users may share one number.
  const phone = String(value ?? '').trim();
  return phonePattern.test(phone) ? phone : null;
}

export function createRegistrationOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function otpDigest(challengeId, code, secret) {
  if (!secret || secret.length < 32) throw new Error('REGISTRATION_OTP_SECRET must contain at least 32 characters.');
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export function matchesOtp(savedHash, challengeId, code, secret) {
  if (!/^[0-9]{6}$/.test(String(code))) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(savedHash))) return false;
  const candidate = otpDigest(challengeId, String(code), secret);
  return timingSafeEqual(Buffer.from(savedHash, 'hex'), Buffer.from(candidate, 'hex'));
}

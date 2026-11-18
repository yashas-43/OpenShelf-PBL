import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_LENGTH = 6;
export const OTP_VALID_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_COOLDOWN_SECONDS = 60;

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, '0');
}

export function newChallengeId() {
  return randomBytes(16).toString('hex');
}

export function newResetToken() {
  return randomBytes(32).toString('hex');
}

function secret() {
  const value = process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('Configure RESET_TOKEN_SECRET as a 32+ character random secret.');
  return value;
}

export function hashSecret(kind, userId, challengeId, value) {
  return createHmac('sha256', secret())
    .update([kind, String(userId), String(challengeId), String(value)].join(':'))
    .digest('hex');
}

export function securelyEquals(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72;
}

/**
 * Phase 15: validate security-critical configuration before accepting requests.
 * This module intentionally has no external dependencies, so the checks can
 * be tested without MongoDB, Gmail or installing the application.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { OPENSHELF_ADMIN_EMAIL } from './accountRetirementRules.js';

const DEFAULT_MARKERS = /^(?:replace_with|your_|change_me|example|placeholder)/i;

function hasStrongSecret(value) {
  return typeof value === 'string' && value.length >= 32 && !DEFAULT_MARKERS.test(value)
    && !/\s/.test(value);
}

/** A changing bcrypt hash must invalidate outstanding administrator tokens. */
export function adminSessionBinding(jwtSecret, adminPasswordHash) {
  if (!hasStrongSecret(jwtSecret) || !/^\$2[aby]\$\d{2}\$/.test(String(adminPasswordHash || ''))) {
    throw new Error('Administrator session is not securely configured.');
  }
  return createHmac('sha256', jwtSecret)
    .update('openshelf-admin-session-v1\0')
    .update(adminPasswordHash)
    .digest('hex');
}

/** Avoid different comparison times for valid and invalid binding strings. */
export function matchesAdminSessionBinding(candidate, jwtSecret, adminPasswordHash) {
  if (!/^[a-f0-9]{64}$/.test(String(candidate || ''))) return false;
  let expected;
  try { expected = adminSessionBinding(jwtSecret, adminPasswordHash); }
  catch { return false; }
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Reject invalid credentials and unsafe production configuration early.
 * SMTP remains optional for existing-account login, but registration will
 * explicitly refuse to send codes until Gmail is configured.
 */
export function validateStartupSecurity(env = process.env) {
  const problems = [];
  const production = env.NODE_ENV === 'production';
  if (!env.MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI)) {
    problems.push('Set a valid MONGODB_URI in server/.env.');
  }
  if (!hasStrongSecret(env.JWT_SECRET)) {
    problems.push('Set JWT_SECRET to at least 32 random non-space characters.');
  }
  if (String(env.ADMIN_EMAIL || '').trim().toLowerCase() !== OPENSHELF_ADMIN_EMAIL) {
    problems.push(`ADMIN_EMAIL must be ${OPENSHELF_ADMIN_EMAIL}.`);
  }
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(env.ADMIN_PASSWORD_HASH || ''))) {
    problems.push('Set ADMIN_PASSWORD_HASH to a real bcrypt hash, not a password or placeholder.');
  }
  if (production) {
    if (!hasStrongSecret(env.RESET_TOKEN_SECRET) || env.RESET_TOKEN_SECRET === env.JWT_SECRET) {
      problems.push('Production requires a separate strong RESET_TOKEN_SECRET.');
    }
    if (!hasStrongSecret(env.REGISTRATION_OTP_SECRET)
      || [env.JWT_SECRET, env.RESET_TOKEN_SECRET].includes(env.REGISTRATION_OTP_SECRET)) {
      problems.push('Production requires a separate strong REGISTRATION_OTP_SECRET.');
    }
    try {
      const address = new URL(env.CLIENT_URL);
      if (address.protocol !== 'https:' || address.username || address.password || address.pathname !== '/'
        || address.search || address.hash) throw new Error('unsafe origin');
    } catch {
      problems.push('In production, CLIENT_URL must be the HTTPS frontend origin only.');
    }
  }
  if (problems.length) {
    // Do not include the user's raw environment values in the error message.
    throw new Error(`OpenShelf configuration needs attention:\n- ${problems.join('\n- ')}`);
  }
  return { secure: true, production };
}

import { OPENSHELF_ADMIN_EMAIL } from './accountRetirementRules.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build the same restricted student-account lookup for all reset steps.
 *
 * A missing, inactive, archived, or administrator email must never receive a
 * password-reset code or be able to verify a code or change its password.
 * Returning null for a protected address avoids querying MongoDB at all.
 * The public /forgot endpoint deliberately does not reveal lookup results.
 */
export function eligiblePasswordResetLookup(email, configuredAdminEmail = '') {
  const normalized = String(email ?? '').trim().toLowerCase();
  const administratorEmail = String(configuredAdminEmail ?? '').trim().toLowerCase();

  if (
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized) ||
    normalized === OPENSHELF_ADMIN_EMAIL ||
    (administratorEmail && normalized === administratorEmail)
  ) {
    return null;
  }

  return {
    email: normalized,
    role: 'student',
    isActive: true,
    archivedAt: null
  };
}

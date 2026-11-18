/**
 * Pure Student Category inventory rules.
 * PDFs are digital resources; the physical-copy count is managed separately.
 */
export const STUDENT_OPEN_STATUSES = Object.freeze(['borrowed', 'overdue']);

export function studentPublicAvailability(textbook, deadlines = {}) {
  const canBorrow = Boolean(
    textbook.isAvailableForBorrow && textbook.isPublished && textbook.availableCopies > 0
  );

  // Never show the number of physical copies to visitors.
  return {
    isBorrowable: canBorrow,
    nextExpectedReturnAt: canBorrow ? null : deadlines.nextExpectedReturnAt || null,
    hasOverdueLoans: !canBorrow && Boolean(deadlines.hasOverdueLoans)
  };
}

export function studentInventoryUpdate(totalCopies, openLoans) {
  if (!Number.isSafeInteger(totalCopies) || totalCopies < 0 || totalCopies > 10000) {
    throw new Error('Total physical copies must be a whole number between 0 and 10000.');
  }
  if (!Number.isSafeInteger(openLoans) || openLoans < 0 || totalCopies < openLoans) {
    throw new Error('Total physical copies cannot be less than the number of active loans.');
  }
  return { totalCopies, availableCopies: totalCopies - openLoans };
}

export function studentCheckoutDocument(userId, textbookId, now, loanDays) {
  const issuedAt = new Date(now);
  return {
    user: userId,
    textbook: textbookId,
    status: 'borrowed',
    requestedAt: issuedAt,
    issuedAt,
    dueAt: new Date(issuedAt.getTime() + loanDays * 24 * 60 * 60 * 1000),
    events: [{ action: 'auto_checkout', at: issuedAt, byRole: 'student' }]
  };
}

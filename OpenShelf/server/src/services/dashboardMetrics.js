// Pure, testable dashboard rules. A due-date countdown starts only after issue.
export const ACTIVE_STATUSES = ['borrowed', 'overdue'];

export function classifyBorrowing(borrowing, now = new Date()) {
  if (borrowing.status === 'returned' || borrowing.status === 'rejected') return borrowing.status;
  if (!ACTIVE_STATUSES.includes(borrowing.status) || !borrowing.issuedAt || !borrowing.dueAt) return borrowing.status;
  return new Date(borrowing.dueAt).getTime() < now.getTime() ? 'overdue' : 'borrowed';
}

export function remainingMilliseconds(borrowing, now = new Date()) {
  if (classifyBorrowing(borrowing, now) !== 'borrowed' || !borrowing.issuedAt || !borrowing.dueAt) return null;
  return Math.max(0, new Date(borrowing.dueAt).getTime() - now.getTime());
}

export const DUE_SOON_WINDOW_MS = 72 * 60 * 60 * 1000;

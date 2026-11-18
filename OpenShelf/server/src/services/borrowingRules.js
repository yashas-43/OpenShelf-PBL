/** Pure lifecycle policy shared by the API and its automated tests. */
export const OPEN_BORROWING_STATUSES = Object.freeze(['requested', 'approved', 'borrowed', 'overdue']);
export const BORROWING_ACTIONS = Object.freeze({
  approve: { from: ['requested'], to: 'approved' },
  reject: { from: ['requested', 'approved'], to: 'rejected' },
  issue: { from: ['approved'], to: 'borrowed' },
  return: { from: ['borrowed', 'overdue'], to: 'returned' }
});

export function canTransition(status, action) {
  return Object.hasOwn(BORROWING_ACTIONS, action) && BORROWING_ACTIONS[action].from.includes(status);
}

export function loanDays(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 60 ? parsed : 14;
}

export function issueDeadline(now, durationDays) {
  return new Date(new Date(now).getTime() + loanDays(durationDays) * 86_400_000);
}

export function extensionDeadline(dueDate, now, extensionDays = 7) {
  const start = Math.max(new Date(dueDate).getTime(), new Date(now).getTime());
  return new Date(start + extensionDays * 86_400_000);
}

export function canAskExtension(record) {
  return ['borrowed', 'overdue'].includes(record?.status)
    && Boolean(record.issuedAt && record.dueAt && !record.returnedAt)
    && (!record.extensionStatus || record.extensionStatus === 'none');
}

/** New self-service checkout: immediate issue and deadline, no admin approval. */
export function automaticCheckoutRecord(user, book, now = new Date(), durationDays = 14) {
  const at = new Date(now);
  return {
    user, book, status: 'borrowed',
    requestedAt: at, approvedAt: null, issuedAt: at,
    dueAt: issueDeadline(at, durationDays),
    events: [{ action: 'auto_checkout', at, byRole: 'student' }]
  };
}

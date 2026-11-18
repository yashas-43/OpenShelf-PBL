export const FLAT_LATE_FINE_PAISE = 1000; // One-time ₹10 per late physical return.
/** A return is late whenever the actual return confirmation is after the due timestamp.
 * Live overdue loans show the expected ₹10; finalized returns freeze the assessed fine. */
export function overdueFinePaise(loan, now = new Date()) {
  if (!loan?.issuedAt || !loan?.dueAt) return 0;
  if (loan.returnedAt && Number.isInteger(loan.fineAssessedPaise)) return loan.fineAssessedPaise;
  const deadline = new Date(loan.dueAt).getTime();
  const ended = loan.returnedAt ? new Date(loan.returnedAt).getTime() : new Date(now).getTime();
  if (!Number.isFinite(deadline) || !Number.isFinite(ended)) return 0;
  return ended > deadline ? FLAT_LATE_FINE_PAISE : 0;
}
export function fineSummary(loan, now = new Date()) {
  const amountPaise = overdueFinePaise(loan, now);
  const paidPaise = Math.max(0, Number(loan.finePaidPaise) || 0);
  return { fineAmountPaise: amountPaise, fineOutstandingPaise: Math.max(0, amountPaise - paidPaise),
    fineFlatPaise: FLAT_LATE_FINE_PAISE };
}

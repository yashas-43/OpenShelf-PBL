/**
 * The same eligibility filter guards return requests in both physical catalogues.
 * MongoDB updates are atomic: duplicate clicks cannot create duplicate requests.
 * This filter deliberately does not update inventory or mark a book returned.
 */
export const PHYSICAL_RETURN_STATUSES = Object.freeze(['borrowed', 'overdue']);

export function physicalReturnRequestFilter(userId, loanId) {
  return {
    _id: loanId,
    user: userId,
    status: { $in: PHYSICAL_RETURN_STATUSES },
    issuedAt: { $ne: null },
    returnedAt: null,
    returnRequestedAt: null
  };
}

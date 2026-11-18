/**
 * OpenShelf's shared physical borrowing policy.
 * A student may have at most three open loans across both library categories.
 */
export const MAX_ACTIVE_PHYSICAL_BORROWINGS = 3;

// Older General Book records can still be pending approval; they occupy a slot.
export const ACTIVE_GENERAL_LOAN_STATUSES = Object.freeze([
  'requested',
  'approved',
  'borrowed',
  'overdue'
]);

export const ACTIVE_STUDENT_LOAN_STATUSES = Object.freeze(['borrowed', 'overdue']);

/** Count every open physical loan, regardless of which collection stores it. */
export function countActivePhysicalLoans(generalCount, studentCount) {
  if (![generalCount, studentCount].every(
    (value) => Number.isSafeInteger(value) && value >= 0
  )) {
    throw new TypeError('Borrowing counts must be non-negative whole numbers.');
  }
  return generalCount + studentCount;
}

/** Return false when an additional physical loan would exceed the three-book cap. */
export function canCheckoutPhysicalBook(generalCount, studentCount) {
  return countActivePhysicalLoans(generalCount, studentCount) < MAX_ACTIVE_PHYSICAL_BORROWINGS;
}

export function borrowingSlots(generalCount, studentCount) {
  const used = countActivePhysicalLoans(generalCount, studentCount);
  return {
    used,
    maximum: MAX_ACTIVE_PHYSICAL_BORROWINGS,
    remaining: Math.max(0, MAX_ACTIVE_PHYSICAL_BORROWINGS - used)
  };
}

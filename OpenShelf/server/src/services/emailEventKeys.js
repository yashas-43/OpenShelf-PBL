/** Stable, unique keys let repeated job scans reuse the same delivery record. */
export function borrowingEventKey(kind, borrowingId, suffix = '') {
  return [kind, String(borrowingId), suffix].filter(Boolean).join(':');
}

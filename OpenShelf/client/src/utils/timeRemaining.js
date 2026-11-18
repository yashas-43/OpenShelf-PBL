/** Format a due date in the viewer's timezone without inventing a start date. */
export function formatTimeRemaining(dueAt, now = Date.now()) {
  if (!dueAt) return null;

  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return null;

  const difference = due - now;
  if (difference < 0) return 'Overdue';
  if (difference === 0) return 'Due now';

  const days = Math.floor(difference / 86_400_000);
  const hours = Math.floor((difference % 86_400_000) / 3_600_000);
  const minutes = Math.ceil((difference % 3_600_000) / 60_000);

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${Math.max(1, minutes)}m remaining`;
}

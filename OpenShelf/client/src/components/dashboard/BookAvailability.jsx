import { useEffect, useState } from 'react';
import { formatTimeRemaining } from '../../utils/timeRemaining';

/** Public-facing availability: no inventory counts or borrower details. */
export default function BookAvailability({ book, detailed = false }) {
  const [now, setNow] = useState(Date.now());
  const due = book.nextExpectedReturnAt ? new Date(book.nextExpectedReturnAt) : null;
  const hasDate = due && Number.isFinite(due.getTime());

  useEffect(() => {
    if (book.isBorrowable || !hasDate) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [book.isBorrowable, hasDate]);

  if (!book.isAvailableForBorrow) return <span>Physical borrowing unavailable</span>;
  if (book.isBorrowable) return <span>Available to borrow</span>;

  return <span className="book-availability-status">
    <strong>No physical copies available</strong>
    {hasDate ? <small>
      Earliest expected return: {due.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
      {due.getTime() > now ? ` · ${formatTimeRemaining(due, now)}` : ' · Deadline passed'}
    </small> : detailed ? <small>Return date not currently available.</small> : null}
    {book.hasOverdueLoans && <small>Some loans are overdue; actual return dates are uncertain.</small>}
    {detailed && <small>Dates are estimates based on current loan deadlines, not guaranteed availability.</small>}
  </span>;
}

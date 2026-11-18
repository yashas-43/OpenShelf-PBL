import { useEffect, useState } from 'react';
import { formatTimeRemaining } from '../../utils/timeRemaining';

/** Present persisted status; derive overdue/remaining time only after actual issue. */
export default function BorrowingStatus({ record }) {
  const [now, setNow] = useState(Date.now());
  const hasIssuedDeadline = Boolean(record.issuedAt && record.dueAt)
    && ['borrowed', 'overdue'].includes(record.status);

  useEffect(() => {
    if (!hasIssuedDeadline) return undefined;

    const timerId = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timerId);
  }, [hasIssuedDeadline]);

  const overdue = hasIssuedDeadline && new Date(record.dueAt).getTime() < now;
  const status = overdue ? 'overdue' : record.status;

  return <div className="dash-borrow-status">
    <span className={`dash-status dash-status-${status}`}>{status}</span>
    {hasIssuedDeadline && <span className={overdue ? 'dash-overdue' : 'dash-remaining'}>
      {formatTimeRemaining(record.dueAt, now)}
    </span>}
  </div>;
}

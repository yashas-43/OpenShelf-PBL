import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import api from '../../services/api';

const dateLabel = (date) =>
  date ? new Date(date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Administrator controls physical student textbooks, not PDF access. */
export default function AdminStudentBorrowingDesk() {
  const [loans, setLoans] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 0, total: 0 });
  const [revision, setRevision] = useState(0);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/api/admin/student-borrowings', { params: { page, returns: pendingOnly ? 'pending' : undefined } })
      .then(({ data }) => {
        if (!active) return;
        setLoans(data.data);
        setPagination(data.pagination);
      })
      .catch((error) => {
        if (active) setNotice(error.response?.data?.message || 'Could not load student loans.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, revision, pendingOnly]);

  async function change(loan, action, decision = '') {
    const prompt = action === 'return'
      ? 'Confirm that this physical student textbook has actually been returned?'
      : `Confirm ${decision} of this return-date extension?`;
    if (!window.confirm(prompt)) return;

    setBusy(String(loan.id));
    setNotice('');
    try {
      const url = decision
        ? `/api/admin/student-borrowings/${loan.id}/extension`
        : `/api/admin/student-borrowings/${loan.id}/return`;
      const { data } = await api.post(url, decision ? { decision } : {});
      setNotice(data.message);
      setRevision((old) => old + 1);
    } catch (error) {
      setNotice(error.response?.data?.message || 'Action could not be completed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="dash-panel admin-borrow-desk">
      <div className="dash-panel-header">
        <div>
          <span className="dash-eyebrow">STUDENT CATEGORY · PHYSICAL COPIES</span>
          <h2>Student textbook returns</h2>
        </div>
        <button className="dash-outline" onClick={() => setRevision((old) => old + 1)}>
          <RefreshCcw size={15} /> Refresh
        </button>
      </div>
      <p className="dash-helper">
        Student borrowing is automatic when copies are in stock. Only confirm a return
        after receiving the physical book. PDF reading never consumes inventory.
      </p>
      <label className="dash-helper">
        <input
          type="checkbox"
          checked={pendingOnly}
          onChange={(event) => { setPendingOnly(event.target.checked); setPage(1); }}
        />{' '}
        Show only student-requested returns
      </label>
      {notice && <p role="status" className="dash-meta">{notice}</p>}
      {loading ? (
        <p className="dash-state">Loading student borrowing records…</p>
      ) : loans.length === 0 ? (
        <p className="dash-state">No student physical loans yet.</p>
      ) : (
        <div className="admin-borrow-records">
          {loans.map((loan) => (
            <article className="admin-borrow-record" key={loan.id}>
              <div className="admin-borrow-head">
                <div>
                  <h3>{loan.book?.title || 'Textbook not available'}</h3>
                  <p>
                    {loan.user?.fullName || 'Student unavailable'} ·{' '}
                    {loan.user?.email || 'Email unavailable'} ·{' '}
                    Phone: {loan.user?.phone || 'Not provided'}
                  </p>
                </div>
                <span className={`dash-status dash-status-${loan.status}`}>{loan.status}</span>
              </div>
              <div className="dash-borrow-dates">
                <span>Issued: {dateLabel(loan.issuedAt)}</span>
                <span>Due: {dateLabel(loan.dueAt)}</span>
                <span>Returned: {dateLabel(loan.returnedAt)}</span>
                <span>Fine: ₹{(loan.fineAmountPaise / 100).toFixed(2)}</span>
              </div>
              {loan.returnRequestedAt && !loan.returnedAt && (
                <p className="dash-return-pending">
                  Return requested on {dateLabel(loan.returnRequestedAt)} — verify physical receipt.
                </p>
              )}
              <div className="admin-borrow-actions">
                {['borrowed', 'overdue'].includes(loan.status) && (
                  <button className="dash-primary" disabled={Boolean(busy)}
                    onClick={() => change(loan, 'return')}>
                    Record physical return
                  </button>
                )}
                {loan.extensionStatus === 'pending' && (
                  <>
                    <button className="dash-outline" disabled={Boolean(busy)}
                      onClick={() => change(loan, '', 'approve')}>Approve +7 days</button>
                    <button className="dash-outline" disabled={Boolean(busy)}
                      onClick={() => change(loan, '', 'reject')}>Reject extension</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {pagination.pages > 1 && (
        <div className="dash-pages">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>{page} / {pagination.pages}</span>
          <button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}

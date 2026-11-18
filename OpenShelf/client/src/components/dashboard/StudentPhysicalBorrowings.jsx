import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import api from '../../services/api';
import BorrowingStatus from './BorrowingStatus';

function shortDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';
}

/** Shows real physical Student Category loans in My Borrowed Books. */
export default function StudentPhysicalBorrowings({ onBrowse }) {
  const [loans, setLoans] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [returnBusy, setReturnBusy] = useState('');

  useEffect(() => {
    let live = true;
    setBusy(true);
    api.get('/api/dashboard/student-borrowings', { params: { page } })
      .then(({ data }) => {
        if (live) {
          setLoans(data.data);
          setPages(data.pagination.pages);
        }
      })
      .catch((error) => {
        if (live) setNotice(error.response?.data?.message || 'Could not load student loans.');
      })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [page, revision]);

  async function extend(loanId) {
    try {
      const { data } = await api.post(`/api/student-borrowings/${loanId}/extension-request`);
      setNotice(data.message);
      setRevision((old) => old + 1);
    } catch (error) {
      setNotice(error.response?.data?.message || 'Extension request failed.');
    }
  }

  /** Ask to return a physical textbook, without prematurely restoring stock. */
  async function requestReturn(loanId) {
    if (!window.confirm('Return this physical textbook? Staff will confirm the actual handover.')) return;
    setReturnBusy(loanId);
    setNotice('');
    try {
      const { data } = await api.post(`/api/student-borrowings/${loanId}/return-request`);
      setNotice(data.message);
      setRevision((old) => old + 1);
    } catch (error) {
      setNotice(error.response?.data?.message || 'Return request failed.');
    } finally {
      setReturnBusy('');
    }
  }

  return (
    <section className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <span className="dash-eyebrow">PHYSICAL STUDENT TEXTBOOKS</span>
          <h2>My Student Book Loans</h2>
        </div>
        <BookOpen size={20} />
      </div>
      <p className="dash-helper">
        Physical borrowing is separate from the ₹10 simulated digital textbook checkout.
        Late physical returns incur a flat ₹10 fine per loan (recorded as outstanding until settled by staff).
      </p>
      {notice && <p role="status" className="dash-meta">{notice}</p>}
      {busy ? <p>Loading…</p> : !loans.length ? (
        <div className="dash-empty">
          <p>You have not borrowed a physical student textbook yet.</p>
          <button className="dash-outline" onClick={onBrowse}>Browse Student Category</button>
        </div>
      ) : (
        <div className="dash-borrow-list">
          {loans.map((loan) => (
            <article className="dash-borrow-row" key={loan.id}>
              <div className="dash-borrow-main">
                <h3>{loan.book?.title || 'Student textbook'}</h3>
                <p>Physical textbook · Issued {shortDate(loan.issuedAt)}</p>
                <div className="dash-borrow-dates">
                  <span>Due: {shortDate(loan.dueAt)}</span>
                  <span>Returned: {shortDate(loan.returnedAt)}</span>
                </div>
              </div>
              <div className="dash-borrow-end">
                <BorrowingStatus record={loan} />
                {loan.fineAmountPaise > 0 && (
                  <span className="dash-meta">
                    Late-return fine: ₹{(loan.fineAmountPaise / 100).toFixed(2)} · Outstanding ₹{((loan.fineOutstandingPaise || 0) / 100).toFixed(2)}
                  </span>
                )}
                {['borrowed', 'overdue'].includes(loan.status) && !loan.returnRequestedAt && (
                  <button
                    className="dash-primary"
                    type="button"
                    disabled={Boolean(returnBusy)}
                    onClick={() => requestReturn(loan.id)}
                  >
                    {returnBusy === loan.id ? 'Requesting…' : 'Return Book'}
                  </button>
                )}
                {loan.returnRequestedAt && !loan.returnedAt && (
                  <span className="dash-return-pending" role="status">
                    Return requested — waiting for staff confirmation
                  </span>
                )}
                {loan.extensionStatus === 'pending' && (
                  <span className="dash-meta">Extension awaiting administrator</span>
                )}
                {['borrowed', 'overdue'].includes(loan.status)
                  && (!loan.extensionStatus || loan.extensionStatus === 'none') && (
                    <button className="dash-outline" onClick={() => extend(loan.id)}>
                      Request +7 days
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="dash-pages">
          <button disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</button>
          <span>Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const statuses = ['all', 'return-requests', 'requested', 'approved', 'borrowed', 'overdue', 'returned', 'rejected'];
const actionChoices = {
  requested: [['approve', 'Approve'], ['reject', 'Reject']],
  approved: [['issue', 'Mark issued'], ['reject', 'Reject']],
  borrowed: [['return', 'Mark returned']],
  overdue: [['return', 'Mark returned']]
};

function stamp(date) {
  return date ? new Date(date).toLocaleString() : 'Not yet';
}

export default function AdminBorrowingDesk() {
  const { signOut } = useAuth();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [loanDays, setLoanDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/api/admin/borrowings', { params: { page, status } })
      .then(({ data }) => {
        if (!active) return;
        setItems(data.data);
        setPagination(data.pagination);
        setLoanDays(data.loanDays);
      })
      .catch((error) => {
        if (!active) return;
        if (error.response?.status === 401) signOut();
        setNotice({ type: 'error', text: error.response?.data?.message || 'Could not load borrowing records.' });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, status, revision]);

  async function perform(record, action, extensionDecision = '') {
    const description = action === 'issue' ? `Confirm this book was physically handed to ${record.user?.fullName || 'the borrower'}? The ${loanDays}-day return deadline starts now.`
      : action === 'return' ? 'Confirm the physical copy has actually been returned to the library?'
        : `Confirm ${extensionDecision || action} for ${record.book?.title || 'this book'}?`;
    if (!window.confirm(description)) return;
    setBusyId(record.id); setNotice(null);
    try {
      const route = extensionDecision ? `/api/admin/borrowings/${record.id}/extension` : `/api/admin/borrowings/${record.id}/actions/${action}`;
      const { data } = await api.post(route, extensionDecision ? { decision: extensionDecision } : {}, { timeout: 45000 });
      setNotice({ type: 'success', text: data.message });
      setRevision((value) => value + 1);
    } catch (error) {
      if (error.response?.status === 401) signOut();
      setNotice({ type: 'error', text: error.response?.data?.message || 'Action could not be completed.' });
    } finally { setBusyId(''); }
  }

  return <section className="dash-panel admin-borrow-desk" aria-label="Book borrowing administration">
    <div className="dash-panel-header"><div><span className="dash-eyebrow">ADMINISTRATOR · PHYSICAL LOANS</span><h2>Physical borrowing desk</h2></div><BookOpen size={24}/></div>
    <p className="dash-helper">Only verified physical handovers and returns should be recorded. New loans are checked out automatically when students click Borrow. Staff still record physical returns. Older pending requests can be resolved below. Gmail notifications are tracked in the Email Delivery section when SMTP is configured.</p>
    <div className="admin-borrow-toolbar"><label>Filter status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{statuses.map((entry) => <option key={entry} value={entry}>{entry === 'return-requests' ? 'Return requests' : entry}</option>)}</select></label><button className="dash-outline" onClick={() => setRevision((value) => value + 1)}><RefreshCcw size={15}/> Refresh</button><span className="dash-meta">{pagination.total} records · {loanDays}-day issue period</span></div>
    {notice && <p role="status" className={notice.type === 'error' ? 'dash-error' : 'dash-success'}>{notice.text}</p>}
    {loading ? <p className="dash-state">Loading real MongoDB borrowing records…</p>
      : items.length === 0 ? <div className="dash-empty"><h3>No records in this view</h3><p>Borrow requests will appear here after students submit them.</p></div>
        : <div className="admin-borrow-records">{items.map((record) => <article className="admin-borrow-record" key={record.id}>
          <div className="admin-borrow-head"><div><h3>{record.book?.title || 'Book unavailable'}</h3><p>{record.user?.fullName || 'User unavailable'} · {record.user?.email || 'Account unavailable'} · Phone: {record.user?.phone || 'Not supplied'}</p></div><span className={`dash-status dash-status-${record.status}`}>{record.status}</span></div>
          <div className="dash-borrow-dates"><span>Requested: {stamp(record.requestedAt)}</span><span>{record.issuedAt && !record.approvedAt ? 'Checkout: automatic' : `Approved: ${stamp(record.approvedAt)}`}</span><span>Issued: {stamp(record.issuedAt)}</span><span>Due: {stamp(record.dueAt)}</span><span>Returned: {stamp(record.returnedAt)}</span><span>Fine: ₹{((record.fineAmountPaise||0)/100).toFixed(2)} (flat ₹10 per late return)</span><span>Outstanding: ₹{((record.fineOutstandingPaise||0)/100).toFixed(2)}</span></div>
          {record.returnRequestedAt && !record.returnedAt && (
            <p className="dash-return-pending">Return requested by student on {stamp(record.returnRequestedAt)} — verify physical receipt.</p>
          )}
          <div className="admin-borrow-actions">{(actionChoices[record.status] || []).map(([action, label]) => <button className={action === 'reject' ? 'dash-outline' : 'dash-primary'} type="button" key={action} disabled={Boolean(busyId)} onClick={() => perform(record, action)}>{label}</button>)}
            {record.extensionStatus === 'pending' && <><span className="dash-meta">Extension requested</span><button className="dash-primary" disabled={Boolean(busyId)} onClick={() => perform(record, '', 'approve')}>Approve +7 days</button><button className="dash-outline" disabled={Boolean(busyId)} onClick={() => perform(record, '', 'reject')}>Reject extension</button></>}
            {record.extensionStatus !== 'none' && record.extensionStatus !== 'pending' && <span className="dash-meta">Extension: {record.extensionStatus}</span>}
          </div>
        </article>)}</div>}
    {pagination.pages > 1 && <div className="dash-pages"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15}/> Previous</button><span>{page} / {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={15}/></button></div>}
  </section>;
}

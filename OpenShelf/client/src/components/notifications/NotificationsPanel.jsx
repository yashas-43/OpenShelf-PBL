import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const formatDate = (value) => new Date(value).toLocaleString('en-IN', {
  dateStyle: 'medium', timeStyle: 'short'
});

/** A real, paginated student inbox. All read actions are checked on the backend. */
export default function NotificationsPanel({ onUnreadChange, onNavigate }) {
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/notifications', {
        params: { page: pagination.page, unread: unreadOnly }
      });
      setRecords(data.data);
      setPagination(data.pagination);
      onUnreadChange(data.unreadCount);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your notifications.');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, unreadOnly, revision, onUnreadChange]);

  useEffect(() => { load(); }, [load]);

  const readOne = async (record) => {
    if (!record.readAt) {
      try {
        await api.patch(`/api/notifications/${record._id}/read`);
        setRevision((current) => current + 1);
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to mark the notification as read.');
        return;
      }
    }
    const destinations = {
      '#general-books': 'books',
      '#student-library': 'students',
      '#peer-exchange-app': 'peer',
      '#peer-requests': 'peer-requests',
      '#peer-listings': 'peer-listings'
    };
    if (record.link && destinations[record.link]) onNavigate(destinations[record.link]);
  };

  const readAll = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setRevision((current) => current + 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to mark all notifications as read.');
    }
  };

  return <section className="dash-panel" aria-label="Notifications">
    <div className="dash-panel-header">
      <div><span className="dash-eyebrow">YOUR PRIVATE INBOX</span><h2>Notifications</h2></div>
      <Bell size={19} />
    </div>
    <div className="phase14-actions">
      <label className="phase14-toggle">
        <input type="checkbox" checked={unreadOnly} onChange={(event) => {
          setUnreadOnly(event.target.checked);
          setPagination((current) => ({ ...current, page: 1 }));
        }} />
        Unread only
      </label>
      <button type="button" className="dash-outline" onClick={readAll}><CheckCheck size={16} /> Mark all read</button>
      <button type="button" className="dash-outline" onClick={() => setRevision((current) => current + 1)}>
        <RefreshCw size={15} /> Refresh
      </button>
    </div>
    {error && <p role="alert" className="dash-error">{error}</p>}
    {loading ? <p className="dash-state">Loading notifications…</p> : records.length === 0 ?
      <p className="dash-state">No {unreadOnly ? 'unread ' : ''}notifications for your account.</p> :
      <div className="phase14-notifications">
        {records.map((record) => <button
          className={`phase14-notification ${record.readAt ? '' : 'unread'}`}
          key={record._id}
          type="button"
          onClick={() => readOne(record)}
        >
          <strong>{record.title}</strong>
          <span>{record.message}</span>
          <small>{formatDate(record.createdAt)} · {record.readAt ? 'Read' : 'Unread'}</small>
        </button>)}
      </div>}
    {pagination.pages > 1 && <div className="dash-pages">
      <button disabled={pagination.page <= 1} onClick={() => setPagination((old) => ({ ...old, page: old.page - 1 }))}>
        <ChevronLeft size={15} /> Previous
      </button>
      <span>{pagination.page} / {pagination.pages}</span>
      <button disabled={pagination.page >= pagination.pages} onClick={() => setPagination((old) => ({ ...old, page: old.page + 1 }))}>
        Next <ChevronRight size={15} />
      </button>
    </div>}
  </section>;
}

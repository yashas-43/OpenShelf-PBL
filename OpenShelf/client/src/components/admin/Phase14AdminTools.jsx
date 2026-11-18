import { useEffect, useState } from 'react';
import { Megaphone, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const groups = [
  ['generalByGenre', 'General Books by genre'],
  ['studentByLevel', 'Student textbooks by level'],
  ['generalByStatus', 'General loan status'],
  ['studentByStatus', 'Student textbook loan status']
];

/** Real collection counts; the report intentionally excludes paused payments. */
export function Phase14AdminReports() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    api.get('/api/admin/reports/summary')
      .then(({ data }) => { if (active) setReport(data.data); })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load reports.'); });
    return () => { active = false; };
  }, [revision]);

  return <section className="admin11-panel">
    <div className="admin11-panel-top">
      <div><h2>Collection and exchange reports</h2><p>Current MongoDB records, with no simulated payments.</p></div>
      <button className="dash-outline" onClick={() => setRevision((old) => old + 1)}>
        <RefreshCw size={15} /> Refresh
      </button>
    </div>
    {error && <p className="dash-error" role="alert">{error}</p>}
    {!report ? <p className="dash-state">Loading report…</p> : <>
      <div className="admin11-stats">
        {Object.entries(report.totals).map(([key, count]) => <article key={key}>
          <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
          <strong>{count}</strong>
        </article>)}
      </div>
      <div className="phase14-report-grid">
        {groups.map(([key, title]) => <div className="phase14-report-panel" key={key}>
          <h3>{title}</h3>
          {report.breakdowns[key].length ? report.breakdowns[key].map((item) =>
            <p key={item._id || 'unspecified'}><span>{item._id || 'Unspecified'}</span><strong>{item.count}</strong></p>
          ) : <p>No records yet.</p>}
        </div>)}
      </div>
      <p className="dash-helper">
        Outstanding overdue fines in the most recent {report.fineSample.scannedLoans} examined loans: ₹{(report.fineSample.outstandingPaise / 100).toFixed(2)}.
        {report.fineSample.complete ? ' This covers all stored loans.' : ' This is a sample, not a complete total.'}
      </p>
    </>}
  </section>;
}

/** Administrators can send plain-text in-app notices without emailing recipients. */
export function AnnouncementsAdmin() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const publish = async (event) => {
    event.preventDefault();
    if (!window.confirm('Send this in-app announcement to all active student accounts?')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/api/admin/announcements', { title, message });
      setNotice(`${data.message} Recipients: ${data.deliveredTo}.`);
      setTitle('');
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not publish announcement.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="admin11-panel">
    <div className="admin11-panel-top">
      <div><h2><Megaphone size={20} /> Library announcements</h2>
        <p>Send a text-only notification to active students. No email or SMS is sent.</p></div>
    </div>
    <form className="phase14-announce-form" onSubmit={publish}>
      <label>Title<input maxLength={160} minLength={1} required value={title}
        onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Message<textarea maxLength={1000} required rows={5} value={message}
        onChange={(event) => setMessage(event.target.value)} /></label>
      <button className="dash-primary" disabled={busy} type="submit">{busy ? 'Publishing…' : 'Publish announcement'}</button>
    </form>
    {notice && <p role="status" className="dash-success">{notice}</p>}
    {error && <p role="alert" className="dash-error">{error}</p>}
  </section>;
}

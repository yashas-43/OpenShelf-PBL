import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Bell, BookMarked, BookOpen, CalendarDays, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, GraduationCap, Handshake,
  History, House, LibraryBig, ListFilter, LogOut, Menu,
  Settings, Shield, Sparkles, UserRound, Wallet, X
} from 'lucide-react';
import BrandMark from '../components/ui/BrandMark';
import BorrowingStatus from '../components/dashboard/BorrowingStatus';
import NotificationsPanel from '../components/notifications/NotificationsPanel';
import StudentPhysicalBorrowings from '../components/dashboard/StudentPhysicalBorrowings';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const navigation = [
  { id: 'overview', label: 'Dashboard Overview', icon: House },
  { id: 'explore', label: 'Explore Library', icon: LibraryBig, page: 'home' },
  { id: 'search', label: 'Search all books', icon: ListFilter, page: 'search' },
  { id: 'general', label: 'General Books', icon: BookOpen, page: 'books' },
  { id: 'students', label: 'Student Category', icon: GraduationCap, page: 'students' },
  { id: 'borrowings', label: 'My Borrowed Books', icon: BookMarked },
  { id: 'pdfs', label: 'My PDFs / Student Reading Library', icon: BookOpen },
  { id: 'reading', label: 'Reading History', icon: History },
  { id: 'peer', label: 'Peer-to-Peer Exchange', icon: Handshake, page: 'peer' },
  { id: 'listings', label: 'My Listed Books', icon: ListFilter, page: 'peer-listings' },
  { id: 'exchanges', label: 'My Exchange Requests / History', icon: Handshake, page: 'peer-requests' },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'My Profile', icon: UserRound },
  { id: 'settings', label: 'Settings', icon: Settings }
];

const metricDefinitions = [
  { key: 'totalBorrowed', title: 'Total borrowed', icon: BookMarked, tab: 'borrowings' },
  { key: 'currentlyBorrowed', title: 'Currently borrowed', icon: BookOpen, tab: 'borrowings' },
  { key: 'pendingRequests', title: 'Pending requests', icon: Clock3, tab: 'borrowings' },
  { key: 'overdueBooks', title: 'Overdue books', icon: CalendarDays, tab: 'borrowings' },
  { key: 'dueSoonBooks', title: 'Due within 72 hours', icon: Clock3, tab: 'borrowings' },
  { key: 'listedPeerBooks', title: 'My listed books', icon: Handshake, tab: 'listings' },
  { key: 'activeExchangeRequests', title: 'Active exchanges', icon: Sparkles, tab: 'exchanges' },
  { key: 'unreadNotifications', title: 'Unread notifications', icon: Bell, tab: 'notifications' },
  { key: 'outstandingFinePaise', title: 'Outstanding fines (₹)', icon: Wallet, tab: 'borrowings' }
];

function dateLabel(value) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function DashboardEmpty({ title, message, action }) {
  return <div className="dash-empty"><span className="dash-empty-icon"><BookOpen size={28} /></span>
    <h3>{title}</h3><p>{message}</p>{action}</div>;
}


function StudentPdfHistory({ onBrowse }) {
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/api/student-pdfs/history').then(({ data }) => { if (active) setRecords(data.data); })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load PDF reading history.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  return <section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">ACTUAL STUDENT READING RECORDS</span><h2>Reading History</h2></div><BookOpen size={19} /></div>
    <p className="dash-helper">Positions are saved when using the OpenShelf reader Page controls, not when using the browser PDF toolbar.</p>
    {busy ? <p className="dash-state">Loading reading history…</p> : error ? <p className="dash-error" role="alert">{error}</p> : records.length ?
      <div className="dash-activity">{records.map((record) => <div key={record.pdfId}><BookOpen size={18} /><div><strong>{record.filename}</strong><p>{record.level} · {record.subject} · Saved page {record.lastPage} · Last opened {dateLabel(record.lastOpenedAt)}</p></div></div>)}</div> :
      <DashboardEmpty title="No student PDFs opened yet" message="Your saved reading positions will appear after you open a real PDF through the Student Library." />}
    <button className="dash-outline" onClick={onBrowse}>Open Student Library <ArrowRight size={15} /></button>
  </section>;
}

function BorrowingList({ onBrowse }) {
  const { signOut } = useAuth();
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [extensionBusy, setExtensionBusy] = useState('');
  const [returnBusy, setReturnBusy] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    api.get('/api/dashboard/borrowings', { params: { page } })
      .then(({ data }) => { if (active) { setRecords(data.data); setPagination(data.pagination); } })
      .catch((err) => {
        if (!active) return;
        if (err.response?.status === 401) signOut();
        setError(err.response?.data?.message || 'Could not load your borrowings.');
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, revision]);

  const askExtension = async (record) => {
    setExtensionBusy(record.id); setNotice(null);
    try {
      const { data } = await api.post(`/api/borrowings/${record.id}/extension-request`);
      setNotice({ type: 'success', text: data.message });
      setRevision((value) => value + 1);
    } catch (err) {
      if (err.response?.status === 401) signOut();
      setNotice({ type: 'error', text: err.response?.data?.message || 'Extension request failed.' });
    } finally { setExtensionBusy(''); }
  };

  /**
   * Requesting a return never frees stock immediately. Library staff must
   * receive the actual physical copy before marking the loan returned.
   */
  const askReturn = async (record) => {
    if (!window.confirm('Request to return this physical book? Staff must confirm receipt before it leaves your borrowed list.')) return;
    setReturnBusy(record.id);
    setNotice(null);
    try {
      const { data } = await api.post(`/api/borrowings/${record.id}/return-request`);
      setNotice({ type: 'success', text: data.message });
      setRevision((old) => old + 1);
    } catch (error) {
      if (error.response?.status === 401) signOut();
      setNotice({ type: 'error', text: error.response?.data?.message || 'Could not request this return.' });
    } finally {
      setReturnBusy('');
    }
  };

  return <section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">YOUR LIBRARY ACTIVITY</span><h2>My Borrowed Books</h2></div><span className="dash-meta">{pagination.total} records</span></div>
    <p className="dash-helper">You can borrow up to 3 physical books total across General Books and Student Textbooks. Borrow Book checks out a copy automatically and starts the return countdown. Use Return Book to request a return; staff confirm actual receipt before a copy becomes available again. Email delivery requires SMTP configuration in server/.env.</p>
    {notice && <p role="status" className={notice.type === 'error' ? 'dash-error' : 'dash-success'}>{notice.text}</p>}
    {busy ? <p className="dash-state" role="status">Loading borrowing records…</p> : error ? <p className="dash-error" role="alert">{error}</p> : records.length === 0 ?
      <DashboardEmpty title="No borrowing records yet" message="Your real borrowed General Books will appear here as soon as you check one out." action={<button className="dash-primary" onClick={onBrowse}>Browse General Books <ArrowRight size={15} /></button>} /> :
      <div className="dash-borrow-list">{records.map((record) => <article className="dash-borrow-row" key={record.id}>
        <div className="dash-borrow-cover"><img src="/openshelf-general-cover.jpg" alt="OpenShelf general book cover" loading="lazy" /></div>
        <div className="dash-borrow-main"><h3>{record.book?.title || 'Book no longer in catalogue'}</h3><p>{record.book?.author || 'Author unavailable'}</p>
          <div className="dash-borrow-dates"><span>Requested: {dateLabel(record.requestedAt)}</span><span>{record.issuedAt && !record.approvedAt ? 'Checkout: automatic' : `Approved: ${dateLabel(record.approvedAt)}`}</span><span>Issued: {dateLabel(record.issuedAt)}</span><span>Due: {record.issuedAt ? dateLabel(record.dueAt) : 'Not issued'}</span>{record.returnedAt && <span>Returned: {dateLabel(record.returnedAt)}</span>}</div></div>
        <div className="dash-borrow-end"><BorrowingStatus record={record} />
          {record.fineAmountPaise > 0 && <span className="dash-meta">Overdue fine: ₹{(record.fineAmountPaise/100).toFixed(2)} · Outstanding ₹{(record.fineOutstandingPaise/100).toFixed(2)} (flat ₹10 per late return)</span>}
          {['borrowed', 'overdue'].includes(record.status) && !record.returnRequestedAt && (
            <button className="dash-primary" type="button" disabled={Boolean(returnBusy)} onClick={() => askReturn(record)}>
              {returnBusy === record.id ? 'Requesting…' : 'Return Book'}
            </button>
          )}
          {record.returnRequestedAt && !record.returnedAt && (
            <span className="dash-return-pending" role="status">Return requested — awaiting staff confirmation</span>
          )}
          {record.extensionStatus === 'pending' && <span className="dash-meta">Extension requested — awaiting staff</span>}
          {['approved', 'rejected'].includes(record.extensionStatus) && <span className="dash-meta">Extension {record.extensionStatus}</span>}
          {['borrowed', 'overdue'].includes(record.status) && ['none', undefined, null].includes(record.extensionStatus) && <button className="dash-outline" disabled={Boolean(extensionBusy)} onClick={() => askExtension(record)}>Request +7 days</button>}
          </div>
      </article>)}</div>}
    {pagination.pages > 1 && <div className="dash-pages"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /> Previous</button><span>{pagination.page} / {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={15} /></button></div>}
  </section>;
}

function Profile({ user, updateUser, settings = false }) {
  const { signOut } = useAuth();
  const [name, setName] = useState(user.fullName || '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  useEffect(() => setName(user.fullName || ''), [user.fullName]);

  const saveName = async (event) => {
    event.preventDefault(); setBusy(true); setNotice({ type: '', text: '' });
    try {
      const { data } = await api.patch('/api/dashboard/profile', { fullName: name.trim() });
      updateUser(data.user);
      setNotice({ type: 'success', text: data.message });
    } catch (err) {
      if (err.response?.status === 401) signOut();
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not update your profile.' });
    } finally { setBusy(false); }
  };

  const savePassword = async (event) => {
    event.preventDefault(); setBusy(true); setNotice({ type: '', text: '' });
    try {
      await api.post('/api/dashboard/change-password', passwords, { timeout: 45000 });
      signOut();
      window.location.hash = '#home';
      window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } }));
      return;
    } catch (err) {
      if (err.response?.status === 401) signOut();
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not change your password.' });
    } finally { setBusy(false); }
  };

  return <div className="dash-profile-grid"><section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">YOUR ACCOUNT</span><h2>{settings ? 'Profile settings' : 'My Profile'}</h2></div><UserRound size={19} /></div>
    <form onSubmit={saveName} className="dash-form"><label>Full name<input value={name} minLength={2} maxLength={80} required onChange={(event) => setName(event.target.value)} /></label>
      <label>Registered Gmail<input value={user.email} readOnly aria-label="Registered Gmail cannot be changed" /></label>
      <label>Verified mobile number<input value={user.phone || "Not provided on this older account"} readOnly aria-label="Registered mobile number" /></label>
      <p className="dash-helper">Account created: {dateLabel(user.createdAt)} · Role: Student</p>
      <button className="dash-primary" disabled={busy || name.trim() === user.fullName} type="submit">Save profile</button></form></section>
    <section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">ACCOUNT SECURITY</span><h2>Change password</h2></div><Shield size={19} /></div>
      <form onSubmit={savePassword} className="dash-form"><label>Current password<input type="password" required autoComplete="current-password" value={passwords.currentPassword} onChange={(e) => setPasswords((previous) => ({ ...previous, currentPassword: e.target.value }))} /></label>
        <label>New password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={passwords.newPassword} onChange={(e) => setPasswords((previous) => ({ ...previous, newPassword: e.target.value }))} /></label>
        <label>Confirm new password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={passwords.confirmPassword} onChange={(e) => setPasswords((previous) => ({ ...previous, confirmPassword: e.target.value }))} /></label>
        <p className="dash-helper">Changing your password signs out all existing sessions. Sign in again afterward.</p>
        <button className="dash-primary" disabled={busy} type="submit">Update password</button></form></section>
    {notice.text && <p className={notice.type === 'error' ? 'dash-error' : 'dash-success'} role="status">{notice.text}</p>}
  </div>;
}

export default function UserDashboard({ onNavigate }) {
  const { user, checking, sessionError, signOut, updateUser } = useAuth();
  const [active, setActive] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const updateUnreadCount = useCallback((number) => setUnreadCount(number), []);

  useEffect(() => {
    if (!user || user.role !== 'student') return;
    let activeRequest = true;
    setLoading(true);
    api.get('/api/dashboard/overview')
      .then(({ data }) => { if (activeRequest) { setOverview(data.data); setUnreadCount(data.data.summary.unreadNotifications || 0); setLoadError(''); } })
      .catch((err) => { if (activeRequest) { if (err.response?.status === 401) signOut(); setLoadError(err.response?.data?.message || 'Could not load your dashboard.'); } })
      .finally(() => { if (activeRequest) setLoading(false); });
    return () => { activeRequest = false; };
  }, [user?.id]);

  // Refresh unread count while the dashboard is open, without reloading the page.
  // The server always scopes this count to the authenticated student.
  useEffect(() => {
    if (!user || user.role !== 'student') return;
    let live = true;
    const refreshUnread = () => api.get('/api/notifications', { params: { page: 1, unread: true } })
      .then(({ data }) => { if (live) setUnreadCount(data.unreadCount); })
      .catch(() => {});
    refreshUnread();
    const timer = window.setInterval(refreshUnread, 45_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [user?.id, user?.role]);

  if (checking) return <div className="dash-loading">Verifying your OpenShelf session…</div>;
  if (!user || user.role !== 'student') return <div className="dash-loading"><h1>Sign in to access your dashboard</h1><p>{sessionError || 'Your account must be verified before personal records can be shown.'}</p><button className="dash-primary" onClick={() => window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } }))}>Log in</button><button className="dash-plain" onClick={() => onNavigate('home')}>Back to home</button></div>;

  const choose = (item) => {
    setMobileOpen(false);
    if (item.page) return onNavigate(item.page);
    setActive(item.id);
  };
  const current = navigation.find((item) => item.id === active);

  return <main className="dash-page"><aside className={`dash-sidebar ${mobileOpen ? 'dash-sidebar-open' : ''}`} aria-label="Dashboard navigation">
    <div className="dash-sidebar-top"><BrandMark /><button className="dash-mobile-close" aria-label="Close dashboard menu" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
    <div className="dash-sidebar-caption">MY WORKSPACE</div><nav className="dash-sidebar-links">{navigation.map((item) => {
      const Icon = item.icon;
      return <button type="button" key={item.id} className={`dash-nav-item ${active === item.id ? 'is-active' : ''}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => choose(item)}><Icon size={17} /><span>{item.label}</span>{item.id === 'notifications' && unreadCount > 0 && <b>{unreadCount}</b>}</button>;
    })}</nav>
    <button className="dash-nav-item dash-signout" onClick={() => { signOut(); onNavigate('home'); }}><LogOut size={17} /><span>Logout</span></button>
  </aside>
    {mobileOpen && <button className="dash-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <div className="dash-workspace"><header className="dash-topbar"><div className="dash-topbar-start"><button className="dash-menu-toggle" aria-label="Open dashboard menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><button className="dash-top-home" onClick={() => onNavigate('home')}><ArrowLeft size={16} /> Home</button><span className="dash-breadcrumb">/ {current?.label || 'Overview'}</span></div><div className="dash-topbar-end"><button className="dash-bell" aria-label="Open notifications" onClick={() => setActive('notifications')}><Bell size={19} />{unreadCount > 0 && <span />}</button><button className="dash-user-chip" onClick={() => setActive('profile')}><span>{user.fullName?.trim()?.charAt(0)?.toUpperCase() || 'U'}</span><strong>{user.fullName}</strong></button></div></header>
      <div className="dash-inner"><div className="dash-page-heading"><span className="dash-eyebrow">OPENSHELF · YOUR SPACE TO GROW</span><h1>{active === 'overview' ? `Welcome back, ${user.fullName?.split(' ')[0] || 'reader'}.` : current?.label}</h1><p>{active === 'overview' ? 'Your personal library workspace. Every number below comes from your account records.' : 'Your personal OpenShelf workspace.'}</p></div>
      {active === 'overview' && <>
        {loading ? <p className="dash-state" role="status">Loading your dashboard from MongoDB…</p> : loadError ? <p className="dash-error" role="alert">{loadError} <button onClick={() => window.location.reload()}>Retry</button></p> : overview && <>
          {overview.summary.physicalBorrowingSlots && (
            <p className="dash-helper" role="status">
              <strong>Physical borrowing: {overview.summary.physicalBorrowingSlots.used}
                /{overview.summary.physicalBorrowingSlots.maximum} books.</strong>{' '}
              {overview.summary.physicalBorrowingSlots.remaining === 0
                ? 'Borrowing limit reached. Return a physical book before borrowing another.'
                : `${overview.summary.physicalBorrowingSlots.remaining} borrowing slot(s) remaining.`}
              {' '}General Books and Student Textbooks share this limit; digital PDF reading does not count.
            </p>
          )}
          <div className="dash-stat-grid">{metricDefinitions.map(({ key, title, icon: Icon, tab }) => <button type="button" className="dash-stat-card" key={key} onClick={() => tab === 'listings' ? onNavigate('peer-listings') : tab === 'exchanges' ? onNavigate('peer-requests') : setActive(tab)}><span className="dash-stat-title"><Icon size={17} /> {title}</span><strong>{key === 'outstandingFinePaise' ? ((overview.summary[key] || 0) / 100).toFixed(2) : overview.summary[key]}</strong><span className="dash-stat-foot">View details <ArrowRight size={13} /></span></button>)}</div>
          <div className="dash-section-grid"><section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">LIVE FROM YOUR ACCOUNT</span><h2>Recent activity</h2></div><History size={19} /></div>
            {overview.recentActivity.length === 0 ? <DashboardEmpty title="A fresh start" message="You have no borrowing activity yet. Request an available physical book to start." /> : <div className="dash-activity">{overview.recentActivity.map((item) => <div key={item.id}><span className="dash-activity-dot"/><div><strong>{item.bookTitle}</strong><p>{item.status} · {dateLabel(item.date)}</p></div></div>)}</div>}</section>
          <section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">YOUR NEXT CHAPTER</span><h2>Quick access</h2></div><Sparkles size={19} /></div><div className="dash-quick"><button onClick={() => onNavigate('books')}><BookOpen size={20}/><span>Browse General Books</span><ArrowRight size={16}/></button><button onClick={() => onNavigate('students')}><GraduationCap size={20}/><span>Explore Student Library</span><ArrowRight size={16}/></button><button onClick={() => onNavigate('peer')}><Handshake size={20}/><span>Peer-to-Peer Exchange <small>Available</small></span><ArrowRight size={16}/></button></div></section></div>
          <p className="dash-scope"><CircleHelp size={15}/> Automatic physical borrowing, return countdowns and peer exchange are available. Student textbook PDFs require a ₹10 classroom demo checkout per subject. Student PDFs require the local importer on your laptop. These are real account totals, not sample records.</p>
        </>}
      </>}
      {active === 'borrowings' && <>
          <BorrowingList onBrowse={() => onNavigate('books')} />
          <StudentPhysicalBorrowings onBrowse={() => onNavigate('students')} />
        </>}
      {active === 'pdfs' && <section className="dash-panel"><div className="dash-panel-header"><div><span className="dash-eyebrow">STUDENT TEXTBOOK PURCHASES</span><h2>My PDFs / Student Reading Library</h2></div><BookOpen size={20}/></div><p className="dash-helper">Textbook subjects cost ₹10 in classroom demo mode (no money is charged); one completed demo unlocks all PDF parts in that subject. General Books never provide PDFs.</p><button className="dash-primary" onClick={() => onNavigate('students')}>Browse Student PDFs <ArrowRight size={15}/></button></section>}
      {active === 'reading' && <StudentPdfHistory onBrowse={() => onNavigate('students')} />}
      {(active === 'profile' || active === 'settings') && <Profile user={user} updateUser={updateUser} settings={active === 'settings'} />}
      {active === 'notifications' && <NotificationsPanel onUnreadChange={updateUnreadCount} onNavigate={onNavigate} />}
      </div><footer className="dash-footer">OpenShelf · Discover. Borrow. Read. Grow. <span>Phone verification, physical borrowing and overdue fines</span></footer>
    </div>
  </main>;
}

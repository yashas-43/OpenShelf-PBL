import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Camera, Handshake, Mail, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const emptyListing = { title: '', author: '', description: '', category: 'General', condition: 'good', exchangeType: 'exchange', contactConsent: false };
const apiOrigin = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const errorMessage = (error) => error.response?.data?.message || 'Action failed. Check your connection and try again.';
const time = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function PeerExchange({ onBack, initialTab = 'browse' }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [listings, setListings] = useState([]);
  const [own, setOwn] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyListing);
  const [photo, setPhoto] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [composeUrl, setComposeUrl] = useState('');
  const [reportReason, setReportReason] = useState('spam');

  function login() { window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } })); }
  const openTab = next => { setTab(next); setNotice(null); setSelected(null); setThread(null); setComposeUrl(''); setPage(1); };
  const refresh = () => setRevision(x => x + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { page, search, type };
    const url = tab === 'mine' ? '/api/peer-exchange/mine' : tab === 'requests' ? '/api/peer-exchange/requests/mine' : '/api/peer-exchange';
    if (tab !== 'browse' && user?.role !== 'student') { setLoading(false); return undefined; }
    api.get(url, { params: tab === 'browse' ? params : { page } })
      .then(({ data }) => {
        if (!active) return;
        if (tab === 'browse') setListings(data.data || []);
        else if (tab === 'mine') setOwn(data.data || []);
        else setRequests(data.data || []);
        setPages(data.pagination?.pages || 0);
      })
      .catch(error => { if (active) setNotice({ type: 'error', text: errorMessage(error) }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, page, search, type, revision, user?.id]);

  const submit = async event => {
    event.preventDefault();
    if (!user || user.role !== 'student') return login();
    setBusy(true); setNotice(null);
    try {
      const { data } = editing
        ? await api.patch(`/api/peer-exchange/${editing}`, draft)
        : await api.post('/api/peer-exchange', draft);
      if (photo) {
        const form = new FormData(); form.append('photo', photo);
        try { await api.post(`/api/peer-exchange/${editing || data.data.id}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } }); }
        catch (error) { setNotice({ type: 'error', text: `Listing saved, but image upload failed: ${errorMessage(error)}` }); }
      }
      setEditing(null); setDraft(emptyListing); setPhoto(null); refresh();
      setNotice(previous => previous?.type === 'error' ? previous : { type: 'success', text: data.message });
    } catch (error) { setNotice({ type: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  // Reserve a new tab during the user's click. Opening it only after the async
  // request would be blocked by many browsers. Close it if the owner did not
  // consent to email sharing, and retain the manual compose link as a fallback.
  const reserveGmailTab = () => {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    return tab;
  };
  const openGmailOrClose = (tab, url) => {
    if (!tab) return;
    if (url) tab.location.replace(url);
    else tab.close();
  };
  const requestBook = async () => {
    if (!user || user.role !== 'student') return login();
    const gmailTab = reserveGmailTab();
    setBusy(true); setComposeUrl(''); setNotice(null);
    try {
      const { data } = await api.post(`/api/peer-exchange/${selected.id}/requests`);
      const url = data.data.composeUrl || '';
      setComposeUrl(url);
      openGmailOrClose(gmailTab, url);
      setNotice({ type: 'success', text: url
        ? 'Request saved. Gmail compose opened if your browser permitted it; review and send the message yourself.'
        : 'Request saved. The owner has not shared their Gmail; use private OpenShelf messages.' });
      refresh();
    } catch (error) {
      openGmailOrClose(gmailTab, '');
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally { setBusy(false); }
  };
  const report = async () => {
    if (!user || user.role !== 'student') return login();
    setBusy(true);
    try { const { data } = await api.post(`/api/peer-exchange/${selected.id}/reports`, { reason: reportReason });
      setNotice({ type: 'success', text: data.message }); }
    catch (error) { setNotice({ type: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const changeListing = async (id, status) => {
    setBusy(true); setNotice(null);
    try {
      const { data } = status === 'removed' ? await api.delete(`/api/peer-exchange/${id}`)
        : await api.patch(`/api/peer-exchange/${id}/status`, { status });
      setNotice({ type: 'success', text: data.message }); refresh();
    } catch (error) { setNotice({ type: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const changeRequest = async (id, action) => {
    setBusy(true); setNotice(null);
    try { const { data } = await api.post(`/api/peer-exchange/requests/${id}/${action}`);
      setNotice({ type: 'success', text: data.message }); refresh(); }
    catch (error) { setNotice({ type: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const openThread = async record => {
    setThread(record); setComposeUrl(''); setMessage(''); setNotice(null);
    try { const { data } = await api.get(`/api/peer-exchange/requests/${record.id}/messages`); setMessages(data.data || []); }
    catch (error) { setNotice({ type: 'error', text: errorMessage(error) }); }
  };
  const sendMessage = async event => {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/peer-exchange/requests/${thread.id}/messages`, { message });
      setMessage('');
      const { data } = await api.get(`/api/peer-exchange/requests/${thread.id}/messages`);
      setMessages(data.data || []);
    } catch (error) { setNotice({ type: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const getContact = async id => {
    const gmailTab = reserveGmailTab();
    setComposeUrl('');
    try {
      const { data } = await api.get(`/api/peer-exchange/requests/${id}/contact`);
      setComposeUrl(data.composeUrl);
      openGmailOrClose(gmailTab, data.composeUrl);
      setNotice({ type: 'success', text: 'Gmail compose opened if your browser permitted it. No email was sent.' });
    } catch (error) {
      openGmailOrClose(gmailTab, '');
      setNotice({ type: 'error', text: errorMessage(error) });
    }
  };

  return <main className="peer-page">
    <header className="peer-header"><button className="dash-outline" onClick={onBack}><ArrowLeft size={16}/> Back to OpenShelf</button>
      <span><Handshake size={20}/> OPENSHELF / PEER EXCHANGE</span></header>
    <section className="peer-hero"><span className="dash-eyebrow">COMMUNITY-POWERED PHYSICAL BOOKS</span>
      <h1>Share a story.<br/><em>Start a connection.</em></h1>
      <p>List a book you own, discover another reader's copy, and coordinate an exchange or loan. Listings become visible only after administrator approval. No PDFs, payments, or automatic emails.</p>
      <div className="peer-security"><ShieldCheck size={17}/> Gmail compose opens after your request only when the owner has consented; otherwise use private OpenShelf messages.</div>
    </section>
    <nav className="peer-tabs" aria-label="Peer exchange sections">
      {[['browse', 'Explore books'], ['mine', 'My Listed Books'], ['requests', 'Requests & messages']].map(([key, label]) =>
        <button key={key} className={tab === key ? 'active' : ''} onClick={() => openTab(key)}>{label}</button>)}
    </nav>
    {notice && <div role="status" className={notice.type === 'error' ? 'dash-error peer-notice' : 'dash-success peer-notice'}>{notice.text}</div>}
    {composeUrl && <div className="peer-gmail"><Mail size={19}/><span>Gmail is ready to compose. No email was sent.</span><a target="_blank" rel="noopener noreferrer" href={composeUrl}>Open Gmail compose</a></div>}
    {tab === 'browse' && <section className="peer-section">
      <div className="peer-toolbar"><label>Find a book<input value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} maxLength={100} placeholder="Search title or author"/></label>
        <label>Availability type<select value={type} onChange={e => { setPage(1); setType(e.target.value); }}><option value="">Exchange or lending</option><option value="exchange">Exchange</option><option value="lend">Lending</option></select></label>
        <button className="dash-outline" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div>
      {loading ? <p className="dash-state">Loading listings…</p> : !listings.length ? <div className="peer-empty">No available peer listings match your search yet.</div>
        : <div className="peer-grid">{listings.map(item => <article className="peer-book" key={item.id}>
          <div className="peer-photo">{item.hasPhoto ? <img src={`${apiOrigin}/api/peer-exchange/${item.id}/photo`} alt={`Owner's photo of ${item.title}`} loading="lazy"/> : <BookOpen size={42}/>}</div>
          <div className="peer-book-details"><span>{item.exchangeType === 'lend' ? 'Available to lend' : 'Available to exchange'} · {item.condition}</span><h3>{item.title}</h3><p>by {item.author}</p><p>Listed by {item.ownerName}</p>
            <button className="dash-primary" onClick={() => { setSelected(item); setComposeUrl(''); setNotice(null); }}>View book & request</button></div>
        </article>)}</div>}
    </section>}
    {tab === 'mine' && <section className="peer-section">
      {!user || user.role !== 'student' ? <div className="peer-empty"><p>Log in as a student to list your physical books.</p><button className="dash-primary" onClick={login}>Log in</button></div> : <>
        <h2>{editing ? 'Edit your book listing' : 'List a physical book'}</h2>
        <form onSubmit={submit} className="peer-form">
          <label>Book title<input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
          <label>Author<input required maxLength={120} value={draft.author} onChange={e => setDraft({ ...draft, author: e.target.value })}/></label>
          <label>Category<input required maxLength={60} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}/></label>
          <label>Condition<select value={draft.condition} onChange={e => setDraft({ ...draft, condition: e.target.value })}><option value="new">New</option><option value="like-new">Like new</option><option value="good">Good</option><option value="fair">Fair</option></select></label>
          <label>Available for<select value={draft.exchangeType} onChange={e => setDraft({ ...draft, exchangeType: e.target.value })}><option value="exchange">Exchange</option><option value="lend">Lending</option></select></label>
          <label>Optional book photo (JPG/PNG/WebP, up to 4 MiB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] || null)}/></label>
          <label className="peer-wide">Physical book description<textarea required rows={3} maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
          <label className="peer-consent peer-wide"><input type="checkbox" checked={draft.contactConsent} onChange={e => setDraft({ ...draft, contactConsent: e.target.checked })}/>
            I explicitly agree to share my account Gmail with authenticated students who request this book. Otherwise, we will use private OpenShelf messages.</label>
          <div className="peer-wide peer-buttons"><button disabled={busy} className="dash-primary" type="submit">{busy ? 'Saving…' : editing ? 'Resubmit for approval' : 'Submit for admin approval'}</button>
            {editing && <button type="button" className="dash-outline" onClick={() => { setEditing(null); setDraft(emptyListing); setPhoto(null); }}>Cancel editing</button>}</div>
        </form>
        <h2>My listed books</h2>
        {loading ? <p className="dash-state">Loading your listings…</p> : !own.length ? <div className="peer-empty">No books listed yet. Submit your first book for admin review above.</div>
          : <div className="peer-list">{own.map(item => <article key={item.id} className="peer-record"><div><h3>{item.title}</h3>
            <p>{item.author} · {item.exchangeType} · <strong>{item.status}</strong></p><p>Admin review: <strong>{item.approvalStatus === 'approved' ? 'Approved' : item.approvalStatus === 'rejected' ? 'Rejected — edit to resubmit' : 'Pending — hidden from other users'}</strong></p>{item.reviewNote && <small>Admin note: {item.reviewNote}</small>}<small>Contact sharing: {item.contactConsent ? 'Opted in' : 'Off'}</small></div>
            <div className="peer-buttons">{['available','unavailable'].includes(item.status) && <button className="dash-outline" onClick={() => {
              setDraft({ title: item.title, author: item.author, description: item.description, category: item.category, condition: item.condition, exchangeType: item.exchangeType, contactConsent: item.contactConsent }); setEditing(item.id); setPhoto(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>}
              {['available','unavailable','exchanged'].includes(item.status) && <button disabled={busy} className="dash-outline" onClick={() => changeListing(item.id, item.status === 'available' ? 'unavailable' : 'available')}>{item.status === 'available' ? 'Mark unavailable' : 'Relist'}</button>}
              {item.status === 'available' && <button disabled={busy} className="dash-outline" onClick={() => changeListing(item.id, 'exchanged')}>Mark exchanged</button>}
              {['available','unavailable','exchanged'].includes(item.status) && <button disabled={busy} className="dash-outline" onClick={() => { if (window.confirm('Remove this listing from discovery?')) changeListing(item.id, 'removed'); }}>Remove</button>}
              {item.status === 'reserved' && <small>Complete or cancel the accepted request first.</small>}</div>
          </article>)}</div>}
      </>}
    </section>}
    {tab === 'requests' && <section className="peer-section"><h2>My exchange requests & history</h2>
      {!user || user.role !== 'student' ? <div className="peer-empty"><button className="dash-primary" onClick={login}>Log in to see requests</button></div>
        : loading ? <p className="dash-state">Loading requests…</p> : !requests.length ? <div className="peer-empty">No exchange requests yet.</div>
          : <div className="peer-list">{requests.map(item => <article key={item.id} className="peer-record"><div>
            <h3>{item.title}</h3><p>{item.direction === 'incoming' ? `Requested by ${item.requesterName}` : `Owner: ${item.ownerName}`}</p>
            <small>{item.exchangeType} · {item.status} · {time(item.createdAt)}</small></div>
            <div className="peer-buttons"><button className="dash-outline" onClick={() => openThread(item)}><MessageCircle size={15}/> Private messages</button>
              {item.direction === 'incoming' && item.status === 'pending' && <><button disabled={busy} className="dash-primary" onClick={() => changeRequest(item.id, 'accept')}>Accept</button><button disabled={busy} className="dash-outline" onClick={() => changeRequest(item.id, 'reject')}>Reject</button></>}
              {item.direction === 'incoming' && item.status === 'accepted' && <button disabled={busy} className="dash-primary" onClick={() => changeRequest(item.id, 'complete')}>Mark handover completed</button>}
              {item.direction === 'outgoing' && ['pending','accepted'].includes(item.status) && <><button disabled={busy} className="dash-outline" onClick={() => changeRequest(item.id, 'cancel')}>Cancel request</button><button className="dash-outline" onClick={() => getContact(item.id)}>Gmail (if owner opted in)</button></>}</div>
          </article>)}</div>}
      {thread && <section className="peer-thread"><div className="peer-thread-header"><h3>Private messages · {thread.title}</h3><button className="dash-outline" onClick={() => setThread(null)}>Close</button></div>
        <p className="dash-helper">Visible only to the listing owner and requester. No email addresses are shared in messages.</p>
        <div className="peer-messages">{messages.length ? messages.map(m => <div className={m.mine ? 'peer-message mine' : 'peer-message'} key={m.id}><strong>{m.mine ? 'You' : 'Other member'}</strong><p>{m.body}</p><small>{time(m.createdAt)}</small></div>) : <p>No messages yet. Introduce yourself to coordinate.</p>}</div>
        {['pending', 'accepted'].includes(thread.status) && <form className="peer-message-form" onSubmit={sendMessage}><textarea required maxLength={1000} rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="Arrange a meeting place or ask a question…"/><button className="dash-primary" disabled={busy}>Send private message</button></form>}
        <button className="dash-outline" onClick={() => openThread(thread)}><RefreshCw size={14}/> Refresh messages</button>
      </section>}
    </section>}
    {pages > 1 && <div className="peer-pagination"><button className="dash-outline" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="dash-outline" disabled={page >= pages} onClick={() => setPage(x => x + 1)}>Next</button></div>}
    {selected && <div className="peer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><section className="peer-dialog" role="dialog" aria-modal="true" aria-labelledby="peer-dialog-title">
      <button className="peer-close" onClick={() => { setSelected(null); setNotice(null); setComposeUrl(''); }} aria-label="Close book details">×</button>
      <div className="peer-dialog-image">{selected.hasPhoto ? <img src={`${apiOrigin}/api/peer-exchange/${selected.id}/photo`} alt="Book offered by its owner"/> : <BookOpen size={70}/>}</div>
      <div className="peer-dialog-content"><span className="dash-eyebrow">{selected.exchangeType === 'lend' ? 'PHYSICAL LENDING' : 'PHYSICAL EXCHANGE'}</span><h2 id="peer-dialog-title">{selected.title}</h2>
        <p>by {selected.author}</p><p>Condition: {selected.condition} · Listed by {selected.ownerName}</p><p>{selected.description}</p>
        <p className="dash-helper">Request a book to open a prefilled Gmail compose window when the owner has opted in. Otherwise use private messages. Review and send any email yourself; OpenShelf never sends it automatically.</p>
        <div className="peer-buttons"><button disabled={busy || user?.role === 'admin'} className="dash-primary" onClick={requestBook}>{busy ? 'Saving…' : 'Request exchange / lending'}</button>
          <button className="dash-outline" disabled={busy} onClick={report}>Report listing</button><select aria-label="Report reason" value={reportReason} onChange={e => setReportReason(e.target.value)}><option value="spam">Spam</option><option value="misleading">Misleading</option><option value="inappropriate">Inappropriate</option><option value="other">Other</option></select></div>
        {notice && <p role="status" className={notice.type === 'error' ? 'dash-error' : 'dash-success'}>{notice.text}</p>}
        {composeUrl && <a target="_blank" rel="noopener noreferrer" className="peer-gmail-link" href={composeUrl}><Mail size={16}/> Open Gmail compose (does not send)</a>}
      </div></section></div>}
    <footer className="peer-footer">OpenShelf · Discover. Borrow. Read. Grow. · User-owned physical books only</footer>
  </main>;
}

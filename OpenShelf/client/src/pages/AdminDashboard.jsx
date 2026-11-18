import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, BookOpen, BookPlus, ChevronLeft, ChevronRight,
  ClipboardList, FileText, LibraryBig, LogOut, Mail, Menu, RefreshCw,
  Search, Settings, ShieldCheck, Users, X
} from 'lucide-react';
import BrandMark from '../components/ui/BrandMark';
import AdminBorrowingDesk from '../components/admin/AdminBorrowingDesk';
import AdminStudentBorrowingDesk from '../components/admin/AdminStudentBorrowingDesk';
import { Phase14AdminReports, AnnouncementsAdmin } from '../components/admin/Phase14AdminTools';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const navigation = [
  ['overview','Overview',Activity], ['users','Users',Users], ['books','General Books',BookOpen],
  ['borrowings','Borrowings',ClipboardList], ['textbooks','Student PDFs',FileText],
  ['emails','Email Delivery',Mail], ['reports','Reports',ClipboardList],
  ['announcements','Announcements',Mail],
  ['peer','Exchange Moderation',LibraryBig], ['activity','Audit Activity',ShieldCheck], ['settings','Settings',Settings]
];
const genres = ['Fiction','Fantasy','Science Fiction','Mystery','Thriller','Horror','Romance','Historical Fiction',
  'Adventure','Biography','Autobiography','History','Science','Technology','Computer Science','Mathematics',
  'Philosophy','Psychology','Self-Help','Business','Economics','Politics','Sociology','Religion and Spirituality',
  'Travel','Health and Wellness','Education','Literature','Poetry','Art and Design','Environment','Children’s Books'];
const blankBook = { title:'',author:'',genre:'Fiction',description:'',isbn:'',coverUrl:'',language:'English',
  publisher:'',publishedYear:'',price:'0',totalCopies:'3',isAvailableForBorrow:true,isAvailableForPurchase:false,isPublished:true };
const date = (value) => value ? new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '—';
const errorText = (error) => error.response?.data?.message || 'Request failed. Check that the API and MongoDB are running.';

function Pager({ pagination, setPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  return <div className="dash-pages"><button disabled={pagination.page <= 1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/> Previous</button>
    <span>Page {pagination.page} / {pagination.pages} · {pagination.total} records</span>
    <button disabled={pagination.page >= pagination.pages} onClick={()=>setPage(p=>p+1)}>Next <ChevronRight size={15}/></button></div>;
}
function Panel({ title, subtitle, children, action }) {
  return <section className="admin11-panel"><div className="admin11-panel-top"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function DataSection({ endpoint, query = {}, deps = [], render, title, subtitle, searchable = false, extra }) {
  const [data,setData] = useState([]);
  const [pagination,setPagination] = useState(null);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(1);
  const [version,setVersion] = useState(0);
  // Stable primitive dependencies prevent an accidental request loop.
  const queryKey = JSON.stringify(query);
  useEffect(()=>{let live=true; setLoading(true); setNotice('');
    api.get(endpoint,{params:{...JSON.parse(queryKey),page,limit:12,search}})
      .then(({data:response})=>{if(live){setData(response.data || []);setPagination(response.pagination);}})
      .catch(err=>{if(live)setNotice(errorText(err));})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[endpoint,page,version,search,queryKey,...deps]);
  const refresh=()=>setVersion(v=>v+1);
  return <Panel title={title} subtitle={subtitle} action={<button className="dash-outline" onClick={refresh}><RefreshCw size={15}/> Refresh</button>}>
    {searchable && <div className="admin11-search"><Search size={16}/><input aria-label={`Search ${title}`} placeholder="Search by title, name or email" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></div>}
    {extra?.({refresh,notice,setNotice})}
    {notice && <p role="alert" className="dash-error">{notice}</p>}
    {loading ? <p className="dash-state">Loading real database records…</p>
      : !data.length ? <p className="admin11-empty">No matching records in MongoDB.</p>
        : render(data,{refresh,setNotice})}
    <Pager pagination={pagination} setPage={setPage}/>
  </Panel>;
}

function Overview() {
  const [record,setRecord]=useState(null);
  const [error,setError]=useState('');
  const [version,setVersion]=useState(0);
  useEffect(()=>{let live=true;api.get('/api/admin/overview').then(({data})=>{if(live)setRecord(data.data);})
    .catch(err=>{if(live)setError(errorText(err));});return ()=>{live=false;};},[version]);
  const stats = record ? [
    ['Registered students',record.users],['Active accounts',record.activeUsers],['Published General Books',record.books],
    ['Books with stock',record.availableBooks],['Open loans',record.activeLoans],['Overdue loans',record.overdueLoans],
    ['Textbook listings',record.publishedTextbooks],['Active student PDFs',record.pdfs],
    ['Peer listings',record.peerListings],
    ['Failed / unconfigured emails',record.failedEmails],['Pending exchange requests',record.exchangeRequests]
  ] : [];
  return <><Panel title="Library overview" subtitle="Counts from your actual MongoDB collections, never example data."
    action={<button className="dash-outline" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={15}/> Refresh</button>}>
    {error && <p role="alert" className="dash-error">{error}</p>}
    {!record ? <p className="dash-state">Loading library statistics…</p> : <>
      <div className="admin11-stats">{stats.map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    </>}
  </Panel>
  {record && <Panel title="Recent borrowing activity" subtitle="Most recently saved borrowing records."><div className="admin11-record-list">{record.recentLoans.map(item=><div key={item.id}><strong>{item.bookTitle}</strong><span>{item.borrowerName} · {item.status} · {date(item.createdAt)}</span></div>)}{!record.recentLoans.length && <p className="admin11-empty">No loans recorded yet.</p>}</div></Panel>}</>;
}

function StudentLoanHistory({id,onClose}) {
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{let live=true;api.get(`/api/admin/users/${id}/borrowings`).then(({data:r})=>{if(live)setData(r.data);})
    .catch(err=>{if(live)setError(errorText(err));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[id]);
  return <div className="admin11-editor"><div className="admin11-panel-top"><h3>Student borrowing history</h3><button className="dash-outline" onClick={onClose}>Close</button></div>
    {error&&<p className="dash-error" role="alert">{error}</p>}{loading?<p>Loading…</p>
      :data.length?<div className="admin11-record-list">{data.map(item=><div key={item._id}><strong>{item.book?.title||'Missing book'} — {item.status}</strong><span>Due: {date(item.dueAt)} · Returned: {date(item.returnedAt)} · Fine: ₹{((item.fineAmountPaise||0)/100).toFixed(2)} · Outstanding: ₹{((item.fineOutstandingPaise||0)/100).toFixed(2)}</span></div>)}</div>
      :<p className="admin11-empty">No borrowing records for this student.</p>}
  </div>;
}
function UsersAdmin() {
  const [history,setHistory]=useState(null);
  return <><DataSection endpoint="/api/admin/users" title="Student accounts" searchable subtitle="Search by registered name/email, see verified phone numbers and borrowing history, and manage account access."
    render={(items,{refresh,setNotice})=><div className="admin11-record-list">{items.map(item=><div className="admin11-row" key={item._id}>
      <div><strong>{item.fullName}</strong><span>{item.email} · Phone: {item.phone || 'Not provided (older account)'} · Joined {date(item.createdAt)} · {item.isActive?'Active':'Disabled'}</span></div>
      <div className="admin11-actions"><button className="dash-outline" onClick={()=>setHistory(item._id)}>Loan history</button><button className="dash-outline" onClick={async()=>{
        if(!window.confirm(`${item.isActive?'Disable':'Enable'} ${item.fullName}?${item.isActive?' Their existing sessions will be invalidated.':''}`))return;
        try{await api.patch(`/api/admin/users/${item._id}/status`,{isActive:!item.isActive});refresh();}catch(err){setNotice(errorText(err));}
      }}>{item.isActive?'Disable account':'Enable account'}</button></div>
    </div>)}</div>}/>
  {history && <Panel title="Selected student"><StudentLoanHistory id={history} onClose={()=>setHistory(null)}/></Panel>}</>;
}

function BookEditor({initial,afterSave,onCancel}) {
  const [form,setForm] = useState(()=>({...blankBook,...initial,
    publishedYear: initial?.publishedYear ?? '',price:String(initial?.price ?? 0),
    totalCopies:String(initial?.totalCopies ?? 3)}));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const set=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  async function submit(event) {
    event.preventDefault();setSaving(true);setError('');
    try{
      const allowed=['title','author','genre','description','isbn','coverUrl','language','publisher',
        'isAvailableForBorrow','isAvailableForPurchase','isPublished'];
      const body=Object.fromEntries(allowed.map(key=>[key,form[key]]));
      Object.assign(body,{price:Number(form.price),totalCopies:Number(form.totalCopies),
        publishedYear:form.publishedYear===''?null:Number(form.publishedYear)});
      if(initial?._id)await api.patch(`/api/admin/books/${initial._id}`,body);
      else await api.post('/api/admin/books',body);
      afterSave();
    }catch(err){setError(errorText(err));}finally{setSaving(false);}
  }
  return <form className="admin11-editor" onSubmit={submit}>
    <h3>{initial?'Edit General Book':'Add physical General Book'}</h3>
    <div className="admin11-form-grid">
      {['title','author','isbn','language','publisher','coverUrl'].map(key=><label key={key}>{key.replace(/([A-Z])/g,' $1')}<input required={['title','author','language'].includes(key)} maxLength={key==='coverUrl'?500:200} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
      <label>Approved genre<select value={form.genre} onChange={e=>set('genre',e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
      <label>Total physical copies<input type="number" min="0" max="10000" required value={form.totalCopies} onChange={e=>set('totalCopies',e.target.value)}/></label>
      <label>Price (₹)<input type="number" min="0" max="10000000" step="0.01" required value={form.price} onChange={e=>set('price',e.target.value)}/></label>
      <label>Published year<input type="number" min="0" max="2100" value={form.publishedYear} onChange={e=>set('publishedYear',e.target.value)}/></label>
    </div>
    <label>Description<textarea required rows="3" maxLength="5000" value={form.description||''} onChange={e=>set('description',e.target.value)}/></label>
    <div className="admin11-checks">{['isPublished','isAvailableForBorrow','isAvailableForPurchase'].map(key=><label key={key}><input type="checkbox" checked={!!form[key]} onChange={e=>set(key,e.target.checked)}/>{key.replace(/([A-Z])/g,' $1')}</label>)}</div>
    {error&&<p role="alert" className="dash-error">{error}</p>}
    <div className="admin11-actions"><button className="dash-primary" disabled={saving}>{saving?'Saving…':'Save book'}</button><button type="button" className="dash-outline" onClick={onCancel}>Cancel</button></div>
    <p className="dash-helper">Available stock is calculated from active loans. Existing loans cannot be erased or bypassed by editing stock. General Books are physical-only.</p>
  </form>;
}
/** File uploads never include JWTs in URL query strings. Admin middleware checks bearer auth. */
function AdminUpload({url, field='pdf', label, accept, onDone, extraFields={}}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function change(event){
    const file=event.target.files?.[0];
    if(!file)return;
    setError('');setBusy(true);
    try{
      const form=new FormData();
      form.append(field,file);
      Object.entries(extraFields).forEach(([key,value])=>form.append(key,String(value)));
      await api.post(url,form,{headers:{'Content-Type':'multipart/form-data'},timeout:120000});
      onDone?.();
    }catch(err){setError(errorText(err));}finally{setBusy(false);event.target.value='';}
  }
  return <div className="admin11-upload"><label className="dash-outline">{busy?'Uploading…':label}
    <input type="file" accept={accept} disabled={busy} onChange={change} aria-label={label}/>
    </label>{error&&<p role="alert" className="dash-error">{error}</p>}</div>;
}

function BooksAdmin() {
  const [editing,setEditing]=useState(null);
  const [visibility,setVisibility]=useState('all');
  const [version,setVersion]=useState(0);
  return <><Panel title="Catalogue management" subtitle="Manage physical General Books only. Stock cannot fall below active loans."
    action={<button className="dash-primary" onClick={()=>setEditing({})}><BookPlus size={16}/> Add book</button>}>
    <div className="admin11-filter"><label>Visibility <select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="all">All</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div>
    {editing && <BookEditor key={editing._id||'new'} initial={editing._id?editing:undefined} afterSave={()=>{setEditing(null);setVersion(v=>v+1);}} onCancel={()=>setEditing(null)}/>}
  </Panel>
  <DataSection endpoint="/api/admin/books" deps={[version]} query={{visibility}} title="Book inventory" searchable
    subtitle="Only administrators can view numerical copy counts."
    render={(items,{refresh,setNotice})=><div className="admin11-record-list">{items.map(item=><div className="admin11-row" key={item._id}>
      <div><strong>{item.title}</strong><span>{item.author} · {item.genre} · {item.availableCopies}/{item.totalCopies} copies available · {item.isPublished===false?'Archived':'Published'}</span></div>
      <div className="admin11-actions"><button className="dash-outline" onClick={()=>setEditing(item)}>Edit</button>
        <AdminUpload field="cover" label="Upload cover" accept="image/png,image/jpeg,image/webp" url={`/api/admin/books/${item._id}/cover`} onDone={refresh}/>
        {item.isPublished!==false && <button className="dash-outline" onClick={async()=>{
          if(!window.confirm(`Archive ${item.title}? Existing loans and records are preserved.`))return;
          try{await api.delete(`/api/admin/books/${item._id}`);refresh();}catch(err){setNotice(errorText(err));}
        }}>Archive</button>}
      </div></div>)}</div>}/> </>;
}

/**
 * A controlled stock input. Edits stay in TextbooksAdmin state across pages
 * and study-level filters until the administrator clicks Save All Changes.
 */
function StudentPhysicalStockEditor({ item, draft, onChange, disabled }) {
  const value = draft?.copies ?? String(item.totalCopies ?? 0);
  return (
    <>
      <label className="admin11-stock-label">
        Physical copies
        <input
          type="number"
          min="0"
          max="10000"
          aria-label={`Physical copies for ${item.level} ${item.subject}`}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(item, event.target.value)}
        />
      </label>
      <button
        className="dash-outline"
        type="button"
        disabled={disabled}
        onClick={() => onChange(item, '3')}
      >
        Enter 3 copies
      </button>
    </>
  );
}

/** Keep the existing General Book desk and add separate physical student returns. */
function AllBorrowingDesks() {
  return <>
    <AdminBorrowingDesk />
    <AdminStudentBorrowingDesk />
  </>;
}

function TextbooksAdmin() {
  const [level,setLevel]=useState('');
  const [selected,setSelected]=useState(null);
  const [pdfs,setPdfs]=useState([]);
  const [error,setError]=useState('');
  const [version,setVersion]=useState(0);
  const [uploadTitle,setUploadTitle]=useState('');
  const [uploadPart,setUploadPart]=useState('');
  // Keep edited values when the administrator navigates through paginated groups.
  const [stockDrafts, setStockDrafts] = useState({});
  const [savingStock, setSavingStock] = useState(false);
  const [stockNotice, setStockNotice] = useState('');
  const [stockError, setStockError] = useState('');
  const pendingStock = Object.values(stockDrafts);

  function editStock(item, copies) {
    setStockNotice('');
    setStockError('');
    setStockDrafts((previous) => {
      const next = { ...previous };
      // Preserve the original stock value from the first edit for conflict checks.
      const existing = previous[item._id];
      const expectedTotalCopies = existing?.expectedTotalCopies ?? Number(item.totalCopies ?? 0);
      if (copies === String(expectedTotalCopies)) delete next[item._id];
      else next[item._id] = {
        id: item._id,
        copies,
        expectedTotalCopies,
        label: `${item.level} · ${item.subject}`
      };
      return next;
    });
  }

  async function saveAllStock() {
    if (savingStock || pendingStock.length === 0) return;
    const updates = pendingStock.map(({ id, copies, expectedTotalCopies }) => ({
      id,
      totalCopies: Number(copies),
      expectedTotalCopies
    }));
    if (pendingStock.some(({ copies }) =>
      copies.trim() === '' || !/^\d+$/.test(copies) || Number(copies) > 10000 ||
      !Number.isSafeInteger(Number(copies)))) {
      setStockError('Enter a whole number of physical copies between 0 and 10000 for each edited textbook.');
      return;
    }
    if (!window.confirm(
      `Confirm that the library physically owns the entered quantities for all ${updates.length} edited textbook(s)? PDF files do not count as physical copies.`
    )) return;
    setSavingStock(true);
    setStockError('');
    setStockNotice('');
    try {
      await api.patch('/api/admin/student-borrowings/textbooks/stock/bulk', { updates });
      setStockDrafts({});
      setStockNotice(`Saved physical stock for ${updates.length} textbook(s).`);
      setVersion((current) => current + 1);
    } catch (error) {
      // Preserve all pending edits so the administrator can review/retry.
      setStockError(errorText(error));
    } finally {
      setSavingStock(false);
    }
  }

  useEffect(()=>{if(!selected){setPdfs([]);return;}let live=true;
    api.get(`/api/admin/textbooks/${selected._id}/pdfs`).then(({data})=>{if(live)setPdfs(data.data);}).catch(err=>{if(live)setError(errorText(err));});
    return()=>{live=false;};},[selected,version]);
  async function updatePdf(id,body) {setError('');try{await api.patch(`/api/admin/pdfs/${id}`,body);setVersion(v=>v+1);}catch(err){setError(errorText(err));}}
  return <><Panel title="Student textbook management" subtitle="Manage real imported PDF metadata and publishing permissions. General Books never accept PDFs.">
    <div className="admin11-filter"><label>Study level <select value={level} onChange={e=>{setLevel(e.target.value);setSelected(null);}}>
      <option value="">All levels</option>{['Class 8','Class 9','Class 10','1st Puc','2nd Puc'].map(item=><option key={item}>{item}</option>)}</select></label></div>
    <p className="dash-helper">Enter actual physical-copy quantities for as many subjects as needed, including across pages and levels, then use one Save All Changes button. Digital PDFs do not count as physical copies. A single save updates all edited subjects together.</p>
    <div className="admin11-bulk-stock-bar" role="region" aria-label="Save physical textbook inventory">
      <strong>{pendingStock.length} unsaved stock change(s)</strong>
      <button className="dash-primary" type="button" onClick={saveAllStock}
        disabled={!pendingStock.length || savingStock}>
        {savingStock ? 'Saving all…' : `Save All Changes (${pendingStock.length})`}
      </button>
      <button className="dash-outline" type="button" onClick={() => {setStockDrafts({});setStockError('');}}
        disabled={!pendingStock.length || savingStock}>Discard Changes</button>
    </div>
    {stockError && <p role="alert" className="dash-error">{stockError}</p>}
    {stockNotice && <p role="status" className="dash-helper">{stockNotice}</p>}
  </Panel>
  <DataSection endpoint="/api/admin/textbooks" query={{level}} deps={[version]} title="Textbook groups" subtitle="Changes are kept when you switch pages or study levels. Save all edited quantities above."
    render={(items,{refresh,setNotice})=><div className="admin11-record-list">{items.map(item=><div className="admin11-row" key={item._id}>
      <div><strong>{item.level} · {item.subject}</strong><span>₹10 TEST ACCESS · {item.availableCopies ?? 0} physical copies available (admin only) · {item.pdfCount} active PDF(s) · {item.rightsConfirmedCount} rights confirmed · {item.isPublished?'Published':'Hidden'}</span></div>
      <div className="admin11-actions">
        <StudentPhysicalStockEditor item={item} draft={stockDrafts[item._id]}
          onChange={editStock} disabled={savingStock} />
        <button className="dash-outline" onClick={()=>{setSelected(item);setError('');}}>Manage PDFs</button>
        <button className="dash-outline" onClick={async()=>{try{await api.patch(`/api/admin/textbooks/${item._id}/publish`,{isPublished:!item.isPublished});refresh();setVersion(v=>v+1);}catch(err){setNotice(errorText(err));}}}>{item.isPublished?'Unpublish':'Publish'}</button></div>
    </div>)}</div>}/>
  {selected && <Panel title={`${selected.level} · ${selected.subject}`} subtitle="PDF publication and rights controls">
    {error && <p role="alert" className="dash-error">{error}</p>}
    <div className="admin11-upload-row"><label className="admin11-upload-title">Displayed title<input maxLength="250" value={uploadTitle} onChange={e=>setUploadTitle(e.target.value)} placeholder="e.g. Textbook"/></label>
      <label className="admin11-upload-title">PDF part<select value={uploadPart} onChange={e=>setUploadPart(e.target.value)}><option value="">Single complete PDF</option><option value="1">Part 1</option><option value="2">Part 2</option></select></label>
      <AdminUpload url={`/api/admin/textbooks/${selected._id}/pdfs`} extraFields={{displayTitle:uploadTitle,partNumber:uploadPart}} label="Upload new PDF (max 30 MiB)" accept="application/pdf" onDone={()=>setVersion(v=>v+1)}/>
      <p className="dash-helper">Uploaded files are stored privately with randomized paths. Verify distribution rights before enabling production reading. Large collections should use the local importer.</p></div>
    <div className="admin11-record-list">{pdfs.map(pdf=><div className="admin11-row" key={pdf._id}>
      <div><strong>{pdf.displayTitle||pdf.filename}</strong><span>{pdf.filename} · {pdf.source} · {pdf.isActive?'Active':'Hidden'} · {pdf.rightsConfirmed?'Rights confirmed':'Rights not confirmed'}</span></div>
      <div className="admin11-actions"><AdminUpload url={`/api/admin/pdfs/${pdf._id}/replace`} label="Replace PDF" accept="application/pdf" onDone={()=>setVersion(v=>v+1)}/>
      <button className="dash-outline" onClick={()=>{
        if(!window.confirm(`${pdf.rightsConfirmed?'Revoke':'Confirm'} distribution rights for ${pdf.filename}? Only confirm if you have permission.`))return;
        updatePdf(pdf._id,{rightsConfirmed:!pdf.rightsConfirmed});
      }}>{pdf.rightsConfirmed?'Revoke rights':'Confirm rights'}</button>
      <button className="dash-outline" onClick={()=>updatePdf(pdf._id,{isActive:!pdf.isActive})}>{pdf.isActive?'Hide PDF':'Restore PDF'}</button></div>
    </div>)}{!pdfs.length && <p className="admin11-empty">No files in this textbook group.</p>}</div>
    <div className="admin11-actions"><button className="dash-outline" onClick={()=>setSelected(null)}>Close</button></div>
  </Panel>}</>;
}
function EmailsAdmin() {
  const [status,setStatus]=useState('');
  return <DataSection endpoint="/api/admin/emails" query={{status}} title="Email delivery log" subtitle="Actual SMTP acceptance and failure events only. No OTP codes or passwords are shown."
    extra={()=> <div className="admin11-filter"><label>Status <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option>{['pending','sending','sent','failed','not_configured'].map(v=><option key={v}>{v}</option>)}</select></label></div>}
    render={(items,{refresh,setNotice})=><div className="admin11-record-list">{items.map(item=><div className="admin11-row" key={item._id}>
      <div><strong>{item.kind.replace(/_/g,' ')} — {item.status}</strong><span>{item.user?.email||'Unavailable account'} · Attempts: {item.attempts} · {date(item.createdAt)} · {item.lastErrorCode||'No recorded error'}</span></div>
      {['failed','not_configured'].includes(item.status)&&item.kind!=='password_reset_code'&&<button className="dash-outline" onClick={async()=>{
        if(!window.confirm('Retry email delivery for this event?'))return;
        try{const {data}=await api.post(`/api/admin/emails/${item._id}/retry`);setNotice(data.message);refresh();}
        catch(err){setNotice(errorText(err));}
      }}>Retry delivery</button>}
    </div>)}</div>}/>;
}
function ReportsAdmin() {
  const [report,setReport]=useState(null);
  const [error,setError]=useState('');
  const [version,setVersion]=useState(0);
  useEffect(()=>{let live=true;api.get('/api/admin/reports/borrowings').then(({data})=>{if(live)setReport(data.data);})
    .catch(err=>{if(live)setError(errorText(err));});return()=>{live=false;};},[version]);
  return <><Panel title="Borrowing and overdue report" subtitle="Live counts from borrowing records. No speculative payment totals."
    action={<button className="dash-outline" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={15}/> Refresh</button>}>
    {error&&<p className="dash-error" role="alert">{error}</p>}
    {!report?<p className="dash-state">Loading real reports…</p>:<>
      <div className="admin11-stats">{[['Books checked out',report.checkedOut],['Returned loans',report.returned],['Overdue loans',report.overdueTotal]].map(([label,n])=><article key={label}><span>{label}</span><strong>{n}</strong></article>)}</div>
      <h3 className="admin11-subhead">Breakdown by status</h3><div className="admin11-record-list">{report.byStatus.map(item=><div key={item._id}><strong>{item._id} — {item.total}</strong></div>)}</div>
      <h3 className="admin11-subhead">Overdue student records (first 100)</h3><div className="admin11-record-list">{report.overdue.length?report.overdue.map(item=><div key={item.id}><strong>{item.title} · {item.student}</strong><span>{item.email} · Phone: {item.phone||'Unavailable'} · Fine ₹{((item.fineAmountPaise||0)/100).toFixed(2)} · Due: {date(item.dueAt)}</span></div>):<p className="admin11-empty">No overdue loans recorded.</p>}</div>
    </>}
  </Panel><Phase14AdminReports /></>;
}
function PeerAdmin() {
  return <>
    <DataSection endpoint="/api/admin/peer-reports" title="Peer listing reports" searchable={false}
      subtitle="Review actual reports from registered users and resolve them after investigation."
      render={(items,{refresh,setNotice})=><div className="admin11-record-list">{items.map(item=><div key={item._id} className="admin11-row"><div>
        <strong>{item.listing?.title || 'Listing unavailable'}</strong>
        <span>Reason: {item.reason} · Reported by {item.reporter?.fullName || 'Member'} · {date(item.createdAt)}</span>
        {item.details && <span>{item.details}</span>}</div>
        <div className="admin11-actions"><button className="dash-outline" onClick={async()=>{
          try {await api.patch(`/api/admin/peer-reports/${item._id}/resolve`);refresh();}
          catch(error){setNotice(errorText(error));}}}>Resolve report</button></div>
      </div>)}</div>} />
    <DataSection endpoint="/api/admin/peer-listings" title="Peer listing approvals" subtitle="New and edited books remain hidden from other members until approved by an administrator."
      render={(items,{refresh,setNotice})=><div className="admin11-record-list">{items.map(item=><div className="admin11-row" key={item._id}><div>
        <strong>{item.title} — {item.author}</strong>
        <span>Owner: {item.owner?.fullName||'Unknown'} · {item.exchangeType||'exchange'} · {item.status} · Review: {item.approvalStatus||'pending (legacy listing)'}</span>
        <span>{item.description}</span>
        {item.reviewNote && <span>Previous review note: {item.reviewNote}</span>}
      </div><div className="admin11-actions">
        {(!item.approvalStatus || item.approvalStatus==='pending') && ['available','unavailable'].includes(item.status) && <>
          <button className="dash-primary" onClick={async()=>{try{
            await api.patch(`/api/admin/peer-listings/${item._id}/review`,{action:'approve'});setNotice('Listing approved and now visible if available.');refresh();
          }catch(err){setNotice(errorText(err));}}}>Approve</button>
          <button className="dash-outline" onClick={async()=>{
            const note=window.prompt('Reason for rejection (optional, shown to listing owner):','');if(note===null)return;
            try{await api.patch(`/api/admin/peer-listings/${item._id}/review`,{action:'reject',note});setNotice('Listing rejected; owner may edit and resubmit.');refresh();}
            catch(err){setNotice(errorText(err));}}}>Reject</button>
        </>}
        {item.status!=='removed' && <button className="dash-outline" onClick={async()=>{
          if(!window.confirm(`Remove ${item.title} from the peer catalogue?`))return;
          try{await api.delete(`/api/admin/peer-listings/${item._id}`);refresh();}catch(err){setNotice(errorText(err));}}}>Remove listing</button>}
      </div></div>)}</div>}/>
  </>;
}
function AuditAdmin() {
  return <DataSection endpoint="/api/admin/activity" title="Administrator activity" subtitle="Immutable audit entries for administrative changes."
    render={items=><div className="admin11-record-list">{items.map(item=><div key={item._id}><strong>{item.action.replace(/_/g,' ')}</strong><span>{item.targetType} · {date(item.createdAt)} · {item.notes||'—'}</span></div>)}</div>}/>;
}
function SettingsAdmin() {
  const [status,setStatus]=useState(null);
  useEffect(()=>{api.get('/api/admin/overview').then(({data})=>setStatus(data.data.smtpConfigured)).catch(()=>{});},[]);
  return <Panel title="Library configuration" subtitle="Environment variables are read from the backend. Secrets are never exposed in the browser.">
    <div className="admin11-record-list"><div><strong>Email service</strong><span>{status===null?'Checking…':status?'SMTP configured':'SMTP not configured'} · Configure credentials privately in server/.env</span></div>
    <div><strong>Administrator access</strong><span>Configured admin account only. Public admin registration is prohibited.</span></div>
    <div><strong>PDF distribution</strong><span>Production streaming requires explicit rights confirmation per PDF; general books cannot contain PDFs.</span></div>
    <div><strong>Student PDFs and exchange</strong><span>Student PDF checkout costs ₹10 per subject in simulated classroom QR mode. Exchange listings require administrator approval before publication.</span></div></div>
  </Panel>;
}
const sections = {overview:Overview,users:UsersAdmin,books:BooksAdmin,borrowings:AllBorrowingDesks,
  textbooks:TextbooksAdmin,emails:EmailsAdmin,reports:ReportsAdmin,announcements:AnnouncementsAdmin,peer:PeerAdmin,activity:AuditAdmin,settings:SettingsAdmin};
export default function AdminDashboard({onNavigate}) {
  const {user,signOut}=useAuth();
  const [section,setSection]=useState('overview');
  const [open,setOpen]=useState(false);
  const Current=sections[section]||Overview;
  const active=useMemo(()=>navigation.find(entry=>entry[0]===section),[section]);
  const logOut=()=>{signOut();onNavigate('home');};
  return <main className="admin11-shell">
    {open && <button className="admin11-overlay" onClick={()=>setOpen(false)} aria-label="Close navigation"/>}
    <aside className={`admin11-side ${open?'admin11-side-open':''}`}>
      <div className="admin11-brand"><BrandMark/><button className="admin11-close" onClick={()=>setOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <p className="admin11-side-label">ADMINISTRATOR WORKSPACE</p>
      <nav aria-label="Admin dashboard sections">{navigation.map(([id,label,Icon])=><button type="button" key={id} className={section===id?'active':''}
        aria-current={section===id?'page':undefined} onClick={()=>{setSection(id);setOpen(false);}}><Icon size={17}/>{label}</button>)}</nav>
      <div className="admin11-side-bottom"><span><ShieldCheck size={15}/> Protected admin access</span><button onClick={logOut}><LogOut size={17}/> Log out</button></div>
    </aside>
    <div className="admin11-main"><header className="admin11-topbar"><div className="admin11-title"><button className="admin11-menu" onClick={()=>setOpen(true)} aria-label="Open navigation"><Menu size={22}/></button>
      <div><span>OPENSHELF / ADMIN</span><h1>{active?.[1]||'Dashboard'}</h1></div></div><div className="admin11-user"><span>{user?.email}</span>
        <button className="dash-outline" onClick={()=>onNavigate('home')}><ArrowLeft size={15}/> Website</button></div></header>
      <div className="admin11-content"><Current /></div>
      <footer className="admin11-footer">OpenShelf · Administrator actions are authorized on the backend and recorded where applicable.</footer>
    </div>
  </main>;
}

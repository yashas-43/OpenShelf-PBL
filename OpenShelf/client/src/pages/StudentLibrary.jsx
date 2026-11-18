import { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, GraduationCap, School, ChevronRight,
  FileText, LoaderCircle, LockKeyhole, RefreshCw, ChevronLeft
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import StudentPhysicalBorrowPanel from '../components/dashboard/StudentPhysicalBorrowPanel';

const SCHOOL_CLASSES = [8, 9, 10];
const PDF_NOT_READY = {
  not_uploaded: 'The PDF has not been uploaded yet.',
  not_approved: 'This PDF is not authorised for student access yet.',
  incomplete_parts: 'Some PDF parts are missing or still being prepared.',
  file_unavailable: 'The PDF files are not available on the library server right now.'
};
const PUC_YEARS = [{ year: 1, label: '1st PUC', folder: '1st Puc' }, { year: 2, label: '2nd PUC', folder: '2nd Puc' }];

function formattedSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The PDF remains in a protected, streamed iframe: no public /assets/ PDF URLs. */
function PdfReader({ pdf, reader, onClose, onRenew }) {
  const [page, setPage] = useState(reader.lastPage || 1);
  const [draft, setDraft] = useState(String(reader.lastPage || 1));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const goToPage = async (next) => {
    if (!Number.isInteger(next) || next < 1 || next > 5000) {
      setMessage('Enter a valid page number between 1 and 5000.');
      return;
    }
    setPage(next);
    setDraft(String(next));
    setMessage('');
    setSaving(true);
    try {
      await api.put(`/api/student-pdfs/${pdf.id}/progress`, { page: next });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Page position could not be saved.');
    } finally { setSaving(false); }
  };
  const absoluteStream = new URL(reader.streamPath.replace(/^\//, ''), `${api.defaults.baseURL.replace(/\/$/, '')}/`).href;
  // PDF browser controls may scroll independently; only jumps made with our controls are saved.
  const src = `${absoluteStream}#page=${page}&toolbar=1`;
  return <div className="student-pdf-reader">
    <div className="student-reader-heading">
      <div><span className="student-reader-kicker">STUDENT PDF · DEMO ACCESS · NO REAL PAYMENT</span><h3>{pdf.displayTitle || pdf.filename}</h3><p>This file stays on your library server. The reader session lasts 20 minutes.</p></div>
      <button className="student-secondary-link" type="button" onClick={onClose}><ArrowLeft size={15} /> Back to subject</button>
    </div>
    <div className="student-reader-controls" aria-label="Reading position controls">
      <button type="button" onClick={() => goToPage(Math.max(1, page - 1))} disabled={page <= 1 || saving}><ChevronLeft size={16} /> Previous</button>
      <form onSubmit={(event) => { event.preventDefault(); goToPage(Number(draft)); }}>
        <label htmlFor="student-reader-page">Page</label>
        <input id="student-reader-page" type="number" min="1" max="5000" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={saving}>Go</button>
      </form>
      <button type="button" onClick={() => goToPage(Math.min(5000, page + 1))} disabled={saving}>Next <ArrowRight size={16} /></button>
      <button type="button" onClick={onRenew}><RefreshCw size={15} /> Renew access</button>
    </div>
    {message && <p className="student-error" role="alert">{message}</p>}
    <p className="student-reader-tip">Use these Page controls to save your reading position. Changes made inside the browser's built-in PDF toolbar cannot be detected automatically.</p>
    <iframe key={`${pdf.id}-${page}-${reader.streamPath}-${reader.accessId}`} src={src} title={`Student PDF: ${pdf.filename}`} className="student-pdf-frame" referrerPolicy="no-referrer" />
    <p className="student-reader-tip">If the PDF cannot load, ensure the backend is running on the same laptop as your textbook files, then close and reopen it. Use a browser with built-in PDF support.</p>
  </div>;
}

export default function StudentLibrary({ onBack }) {
  const { user } = useAuth();
  const [category, setCategory] = useState(null);
  const [selection, setSelection] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openingId, setOpeningId] = useState(null);
  const [readingPdf, setReadingPdf] = useState(null);
  const [reader, setReader] = useState(null);
  const [ownedSubjects, setOwnedSubjects] = useState(new Set());
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [demoCheckout, setDemoCheckout] = useState(null);
  useEffect(() => {
    if (!user || user.role !== 'student') { setOwnedSubjects(new Set()); return; }
    let active = true;
    Promise.allSettled([
      api.get('/api/payments/purchases'),
      api.get('/api/demo-checkout/purchases')
    ]).then(results => {
      if (!active) return;
      const owned = results.flatMap(result => result.status === 'fulfilled' ? (result.value.data?.data || []) : []);
      setOwnedSubjects(new Set(owned.map(item => String(item.subjectId))));
    });
    return () => { active = false; };
  }, [user?.id]);

  // This classroom QR cannot be paid. The server checks a minimum two-second
  // elapsed time and grants a demo-only entitlement; Razorpay is never called.
  const purchaseSubject = async (subject) => {
    if (!user || user.role !== 'student') {
      setNotice('Log in as a student to open the demonstration checkout.');
      window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } }));
      return;
    }
    setCheckoutBusy(true);
    setNotice('');
    try {
      const { data } = await api.post('/api/demo-checkout/start', { subjectId: subject.id });
      if (data.alreadyOwned) {
        setOwnedSubjects(current => new Set([...current, String(subject.id)]));
        setNotice('You already have access to this textbook subject and all its PDF parts.');
        return;
      }
      if (data.mode !== 'demo' || data.realPayment !== false || data.amountPaise !== 1000 || !data.checkoutId) {
        throw new Error('Unexpected demo checkout response. No access was granted.');
      }
      setDemoCheckout({ id: data.checkoutId, subjectId: String(subject.id), title: subject.subject, stage: 'waiting', error: '' });
    } catch (error) {
      setNotice(error.response?.data?.message || error.message || 'Unable to open demonstration QR.');
    } finally { setCheckoutBusy(false); }
  };

  useEffect(() => {
    if (demoCheckout?.stage !== 'waiting') return undefined;
    let cancelled = false;
    const { id, subjectId } = demoCheckout;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setDemoCheckout(current => current?.id === id ? { ...current, stage: 'processing' } : current);
      try {
        const { data } = await api.post('/api/demo-checkout/complete', { checkoutId: id });
        if (!data.success || !data.completed || data.realPayment !== false) throw new Error('Demo completion was not confirmed.');
        if (cancelled) return;
        setOwnedSubjects(current => new Set([...current, subjectId]));
        setNotice('Demo complete — all authorised PDF parts for this subject are unlocked. No money was paid.');
        setDemoCheckout(current => current?.id === id ? { ...current, stage: 'complete' } : current);
      } catch (error) {
        if (cancelled) return;
        setDemoCheckout(current => current?.id === id ? { ...current, stage: 'error', error: error.response?.data?.message || error.message || 'Demo completion failed.' } : current);
      }
    }, 2200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [demoCheckout?.id]); // Stage changes must not cancel an in-flight completion request.

  useEffect(() => {
    if (!selection) return;
    let active = true;
    setLoading(true);
    setSubjects([]);
    setError('');
    setNotice('');
    api.get('/api/student-pdfs/catalog', { params: { level: selection.folder } })
      .then(({ data }) => { if (active) setSubjects(data.subjects); })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load the Student Library. Check that your server is running.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection]);

  const chooseCategory = (next) => { setCategory(next); setSelection(null); setSelectedSubject(null); setReadingPdf(null); setReader(null); };
  const chooseLevel = (level) => { setSelection(level); setSelectedSubject(null); setReadingPdf(null); setReader(null); };
  const reset = () => { setCategory(null); setSelection(null); setSelectedSubject(null); setReadingPdf(null); setReader(null); };

  const openPdf = async (pdf) => {
    if (!user) {
      setNotice('Please log in to access purchased Student Category PDFs.');
      window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } }));
      return;
    }
    if (!activeSubject || !ownedSubjects.has(String(activeSubject.id))) {
      setNotice("Complete the ₹10 classroom demo to unlock this subject’s PDF parts. No real payment is required.");
      return;
    }
    setOpeningId(pdf.id);
    setNotice('');
    try {
      // WithCredentials is essential: the server sets a short-lived, HttpOnly,
      // file-scoped access cookie so the PDF iframe needs no URL token.
      const { data } = await api.post(`/api/student-pdfs/${pdf.id}/access`, {}, { withCredentials: true });
      setReadingPdf(pdf);
      setReader({ ...data, accessId: Date.now() });
      if (data.renamedOnDisk) {
        setNotice('The PDF opened using a uniquely matched renamed file. Re-run the PDF importer to save the new filename in MongoDB.');
      }
    } catch (err) {
      setNotice(err.response?.data?.message || 'PDF access failed. Confirm the local files are available and try again.');
    } finally { setOpeningId(null); }
  };

  const backToSubject = () => { setReadingPdf(null); setReader(null); setNotice(''); };
  const activeSubject = subjects.find((item) => item.subject === selectedSubject);

  return <main className="student-page">
    <header className="books-topbar student-topbar">
      <button className="books-back" onClick={onBack}><ArrowLeft size={16} /> Back to home</button>
      <div className="books-wordmark"><BookOpen size={20} /> OpenShelf</div>
      <span className="books-phase">STUDENT COLLECTION · PDF + PHYSICAL BORROWING</span>
    </header>
    <section className="student-hero">
      <div className="student-eyebrow"><GraduationCap size={15} /> LEARNING, ORGANIZED</div>
      <h1>Your studies.<br /><span>Your next chapter.</span></h1>
      <p>Choose your class and subject. Try the ₹10 classroom QR demo (automatically completes after 2 seconds, with no charge), or borrow an available physical textbook.</p>
      <div className="student-breadcrumb" aria-label="Current selection">
        <button onClick={reset}>Student Library</button>
        {category && <><ChevronRight size={14} /><button onClick={() => { setSelection(null); setSelectedSubject(null); setReadingPdf(null); }}>{category === 'school' ? 'School' : 'PUC'}</button></>}
        {selection && <><ChevronRight size={14} /><button onClick={() => { setSelectedSubject(null); setReadingPdf(null); }}>{selection.label}</button></>}
        {selectedSubject && <><ChevronRight size={14} /><button onClick={() => { backToSubject(); }}>{selectedSubject}</button></>}
        {readingPdf && <><ChevronRight size={14} /><span>{readingPdf.partNumber ? `Part ${readingPdf.partNumber}` : 'PDF'}</span></>}
      </div>
    </section>
    <section className="student-content">
      {!category && <>
        <div className="student-section-heading"><span className="books-eyebrow">CHOOSE YOUR STUDY PATH</span><h2>Where are you studying?</h2></div>
        <div className="student-path-grid">
          <button className="student-path-card" onClick={() => chooseCategory('school')}>
            <span className="student-path-icon"><School size={28} /></span><span className="student-path-type">SCHOOL</span>
            <strong>School textbooks</strong><span>Choose Class 8, Class 9, or Class 10.</span><span className="student-path-link">Choose class <ArrowRight size={16} /></span>
          </button>
          <button className="student-path-card" onClick={() => chooseCategory('puc')}>
            <span className="student-path-icon"><GraduationCap size={28} /></span><span className="student-path-type">PRE-UNIVERSITY</span>
            <strong>PUC textbooks</strong><span>Choose 1st PUC or 2nd PUC. No stream selection needed.</span><span className="student-path-link">Choose year <ArrowRight size={16} /></span>
          </button>
        </div>
      </>}
      {category && !selection && <>
        <div className="student-section-heading"><span className="books-eyebrow">{category === 'school' ? 'SCHOOL' : 'PRE-UNIVERSITY'}</span><h2>{category === 'school' ? 'Select your class' : 'Select your PUC year'}</h2><p>Subjects are grouped by your actual folders. When authorised PDFs are published, the ₹10 simulated QR checkout unlocks all parts in the subject, without charging money.</p></div>
        <div className={category === 'school' ? 'student-level-grid school-levels' : 'student-level-grid'}>
          {category === 'school' ? SCHOOL_CLASSES.map((level) => <button className="student-level" key={level} onClick={() => chooseLevel({ folder: `Class ${level}`, label: `Class ${level}` })}><span>CLASS</span><strong>{level}</strong><ArrowRight size={16} /></button>) :
            PUC_YEARS.map(({ year, label, folder }) => <button className="student-level puc-level" key={year} onClick={() => chooseLevel({ folder, label })}><span>PRE-UNIVERSITY</span><strong>{label}</strong><ArrowRight size={18} /></button>)}
        </div>
        <button className="student-secondary-link" onClick={reset}><ArrowLeft size={15} /> Change study path</button>
      </>}
      {selection && <>
        {!selectedSubject && <>
          <div className="student-section-heading"><span className="books-eyebrow">{category === 'school' ? 'SCHOOL SUBJECTS' : 'PUC SUBJECTS'}</span><h2>{selection.label}</h2><p>Exact subject names from your textbook manifest.</p></div>
          {loading ? <div className="student-loading" role="status"><LoaderCircle size={22} /> Loading subjects from MongoDB…</div> :
            error ? <p className="student-error" role="alert">{error}</p> : subjects.length ?
              <div className="student-subject-grid">{subjects.map((group) => <button key={group.id} className="student-subject-card" onClick={() => { setSelectedSubject(group.subject); setReadingPdf(null); }}>
                <FileText size={24} /><strong>{group.subject}</strong><span>{group.parts.length === 0 ? 'Digital PDF not yet ready' : group.parts.length === 1 ? '1 complete digital textbook' : `One textbook · ${group.parts.length} parts · one purchase`}</span><span className="student-subject-action">Open subject <ArrowRight size={15} /></span>
              </button>)}</div> : <div className="student-placeholder"><div className="student-placeholder-icon"><BookOpen size={35} /></div><h3>No local PDFs imported yet</h3><p>The CSV is included in your project. Run the local verifier and importer on the laptop containing <code>D:\Library\Textbooks</code> to show real PDFs here.</p><span>No fake PDFs or broken sample links are displayed.</span></div>}
          <button className="student-secondary-link" onClick={() => { setSelection(null); setSelectedSubject(null); }}><ArrowLeft size={15} /> Change class or PUC year</button>
        </>}
        {selectedSubject && activeSubject && <>
          {!readingPdf && <>
            <div className="student-section-heading"><span className="books-eyebrow">{selection.label.toUpperCase()} · TEXTBOOK PDF</span><h2>{selectedSubject}</h2><p>One ₹10 simulated checkout unlocks all approved PDF parts for this subject. No real payment is made; physical borrowing is separate.</p></div>
            {notice && <p className={/failed|error|not available|could not|unable|denied|pending|closed|no physical|invalid|purchase this|log in|requires|not confirmed|try again|still pending/i.test(notice) ? 'student-error' : 'student-info'} role="status">{notice}</p>}
            <section className="student-textbook-card" aria-label={`${selectedSubject} textbook`}>
              <div className="student-textbook-heading">
                <div className="student-textbook-icon"><BookOpen size={27} /></div>
                <div>
                  <span className="student-file-part">{activeSubject.parts.length ? 'DIGITAL TEXTBOOK · ₹10 DEMO · NO REAL CHARGE' : 'DIGITAL TEXTBOOK · PDF NOT READY'}</span>
                  <h3>{activeSubject.title && activeSubject.title.toLowerCase() !== 'textbook' ? activeSubject.title : `${activeSubject.subject} textbook`}</h3>
                  <p>{activeSubject.parts.length === 0
                    ? (PDF_NOT_READY[activeSubject.pdfStatus] || 'No approved PDF is available yet.')
                    : activeSubject.parts.length === 1 ? 'Complete textbook in one PDF.'
                    : `Parts ${activeSubject.parts.map(part => part.partNumber).join(' and ')} are unlocked together by one ₹10 demo checkout.`}</p>
                </div>
              </div>
              {activeSubject.parts.length === 0 && <p className="student-pdf-setup-note" role="status">You can still borrow a physical textbook below. An administrator must upload or import the authorised PDF file(s) before digital checkout becomes available. PDF files are not bundled with the OpenShelf source ZIP.</p>}
              {activeSubject.parts.length > 0 && <div className="student-textbook-purchase" style={{padding:'14px 4px 18px',display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}}>
                <strong>{ownedSubjects.has(String(activeSubject.id)) ? 'Demo access unlocked ✓ · All PDF parts' : 'Textbook access: ₹10.00 (simulated only)'}</strong>
                {!ownedSubjects.has(String(activeSubject.id)) && <button className="student-view-button" type="button" disabled={checkoutBusy} onClick={() => purchaseSubject(activeSubject)}>{checkoutBusy ? 'Opening demo…' : 'Buy Access — ₹10 Demo QR'}</button>}
                <span>This is a classroom demonstration: a non-payable QR appears, then automatically unlocks the complete subject after 2 seconds. No bank, UPI, Razorpay or real funds are involved.</span>
              </div>}
              <StudentPhysicalBorrowPanel
                textbook={activeSubject}
                onNotice={setNotice}
                onAvailabilityChange={(id, physical) => {
                  setSubjects((current) => current.map((item) =>
                    item.id === id ? { ...item, physical } : item
                  ));
                }}
              />
              <div className="student-files-list">{activeSubject.parts.map((pdf) => <article key={pdf.id} className="student-file-card">
                <span className="student-file-icon"><FileText size={26} /></span>
                <div className="student-file-info">
                  <span className="student-file-part">{pdf.partNumber ? `PART ${pdf.partNumber}` : 'COMPLETE PDF'}</span>
                  <h4>{pdf.partNumber ? `Part ${pdf.partNumber}` : 'Full textbook'}</h4>
                  <small>{pdf.filename} · {formattedSize(pdf.sizeBytes)} · Subject access</small>
                </div>
                <button className="student-view-button" disabled={!!openingId} onClick={() => openPdf(pdf)}>{openingId === pdf.id ? <><LoaderCircle size={15} /> Opening…</> : <>{ownedSubjects.has(String(activeSubject.id)) ? <BookOpen size={16} /> : <LockKeyhole size={16} />} {ownedSubjects.has(String(activeSubject.id)) ? (pdf.partNumber ? `View Part ${pdf.partNumber}` : 'View PDF') : 'Locked PDF'}</>}</button>
              </article>)}</div>
            </section>
            <button className="student-secondary-link" onClick={() => setSelectedSubject(null)}><ArrowLeft size={15} /> Back to {selection.label} subjects</button>
          </>}
          {readingPdf && reader && <>
            {notice && <p className="student-info" role="status">{notice}</p>}
            <PdfReader key={readingPdf.id + ':' + reader.accessId} pdf={readingPdf} reader={reader} onClose={backToSubject} onRenew={() => openPdf(readingPdf)} />
          </>}
        </>}
      </>}
    </section>
    {demoCheckout && <div className="openshelf-demo-overlay" role="presentation">
      <section className="openshelf-demo-dialog" role="dialog" aria-modal="true" aria-labelledby="openshelf-demo-title">
        <button type="button" className="openshelf-demo-close" disabled={demoCheckout.stage === 'processing'} aria-label="Close demo checkout" onClick={() => setDemoCheckout(null)}>×</button>
        <span className="openshelf-demo-label">CLASSROOM DEMONSTRATION · NOT A PAYMENT REQUEST</span>
        <h2 id="openshelf-demo-title">₹10 Test QR</h2>
        <p className="openshelf-demo-subject">{demoCheckout.title} · All available PDF parts included</p>
        <img className="openshelf-demo-qr" src="/demo-checkout-qr.svg" alt="Non-payable QR reading OpenShelf classroom demo only; INR ten; no real payment" />
        <p className="openshelf-demo-warning">This QR is not a UPI payment code. Do not send money or scan it with a payment app.</p>
        {demoCheckout.stage === 'waiting' && <p className="openshelf-demo-progress" role="status">Simulating ₹10 payment… automatically completing in 2 seconds.</p>}
        {demoCheckout.stage === 'processing' && <p className="openshelf-demo-progress" role="status">Verifying the classroom demo on the server…</p>}
        {demoCheckout.stage === 'complete' && <p className="openshelf-demo-success" role="status">Demo complete! No money was charged. All approved PDF parts are unlocked.</p>}
        {demoCheckout.stage === 'error' && <p className="openshelf-demo-error" role="alert">{demoCheckout.error}</p>}
        {(demoCheckout.stage === 'complete' || demoCheckout.stage === 'error') && <button type="button" className="openshelf-demo-done" onClick={() => setDemoCheckout(null)}>{demoCheckout.stage === 'complete' ? 'Continue to textbook' : 'Close and try again'}</button>}
      </section>
    </div>}
    <footer className="books-footer"><span>OpenShelf · Student Library</span><span>School / 1st PUC / 2nd PUC · ₹10 demo only · no real payment</span></footer>
  </main>;
}

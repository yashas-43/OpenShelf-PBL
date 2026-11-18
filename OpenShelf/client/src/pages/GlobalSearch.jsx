import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, GraduationCap, Handshake, Search } from 'lucide-react';
import BrandMark from '../components/ui/BrandMark';
import api from '../services/api';

const TABS = [
  { id: 'all', title: 'All collections' },
  { id: 'general', title: 'General Books' },
  { id: 'student', title: 'Student Textbooks' },
  { id: 'peer', title: 'Peer Exchange' }
];

const GROUPS = [
  { key: 'general', label: 'General Books', icon: BookOpen, view: 'books' },
  { key: 'student', label: 'Student Textbooks', icon: GraduationCap, view: 'students' },
  { key: 'peer', label: 'Peer Exchange', icon: Handshake, view: 'peer' }
];

/** Searches public records only. No student account or contact details appear. */
export default function GlobalSearch({ onBack, onNavigate }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [level, setLevel] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    setBusy(true);
    setError('');
    api.get('/api/search', { params: {
      q: query, type, page, limit: 12,
      available: onlyAvailable,
      ...(type === 'student' ? { level } : {})
    } }).then(({ data }) => {
      if (live) setResults(data);
    }).catch((err) => {
      if (live) setError(err.response?.data?.message || 'Search could not be completed.');
    }).finally(() => {
      if (live) setBusy(false);
    });
    return () => { live = false; };
  }, [query, type, page, onlyAvailable, level]);

  const submit = (event) => {
    event.preventDefault();
    const value = input.trim();
    if (value.length < 2) return setError('Enter at least two characters.');
    setPage(1);
    setQuery(value);
  };

  return <main className="phase14-search-page">
    <header className="phase14-search-header">
      <BrandMark />
      <button className="dash-outline" onClick={onBack}><ArrowLeft size={16} /> Back to home</button>
    </header>
    <div className="phase14-search-body">
      <span className="dash-eyebrow">EXPLORE ALL OF OPENSHELF</span>
      <h1>Search the library</h1>
      <p>Find General Books, Student Category subjects, and books offered for peer exchange.</p>
      <form onSubmit={submit} className="phase14-search-form">
        <Search size={20} aria-hidden="true" />
        <input aria-label="Search book title, author or subject" type="search" value={input}
          onChange={(event) => setInput(event.target.value)} maxLength={100}
          placeholder="Search title, author, genre or subject…" />
        <button type="submit">Search</button>
      </form>
      <div className="phase14-search-tabs" role="group" aria-label="Search collection">
        {TABS.map((tab) => <button type="button" key={tab.id}
          aria-pressed={type === tab.id} className={type === tab.id ? 'active' : ''}
          onClick={() => { setType(tab.id); setPage(1); }}>
          {tab.title}
        </button>)}
      </div>
      <div className="phase14-search-filters">
        <label><input type="checkbox" checked={onlyAvailable} onChange={(event) => {
          setOnlyAvailable(event.target.checked); setPage(1);
        }} /> Available physical copies / listings only</label>
        {type === 'student' && <label>Study level
          <select value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }}>
            <option value="">All levels</option>
            {['Class 8', 'Class 9', 'Class 10', '1st Puc', '2nd Puc'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>}
      </div>
      {!query ? <p className="dash-state">Enter a search term to browse matching records.</p> :
        error ? <p className="dash-error" role="alert">{error}</p> :
        busy ? <p className="dash-state">Searching the catalogue…</p> :
        <>
          {GROUPS.filter((group) => type === 'all' || type === group.key).map((group) => {
            const section = results?.data?.[group.key];
            if (!section) return null;
            const Icon = group.icon;
            return <section className="phase14-results" key={group.key}>
              <div className="phase14-section-title"><h2><Icon size={20} /> {group.label}</h2><span>{section.total} matches</span></div>
              {section.items.length ? <div className="phase14-results-grid">
                {section.items.map((record) => <article key={String(record.id || record._id)} className="phase14-result-card">
                  <strong>{record.title || record.subject}</strong>
                  <span>{group.key === 'general' ? record.author :
                    group.key === 'student' ? `${record.level} · ${record.subject}` :
                    `${record.author} · ${record.exchangeType}`}</span>
                  <button type="button" onClick={() => onNavigate(group.view)}>
                    Open {group.label} <span aria-hidden="true">→</span>
                  </button>
                </article>)}
              </div> : <p className="dash-state">No matches in this collection.</p>}
              {type === 'all' && section.total > section.items.length && <button className="dash-outline" onClick={() => { setType(group.key); setPage(1); }}>See all {section.total} matches</button>}
            </section>;
          })}
          {type !== 'all' && results?.pagination?.pages > 1 && <div className="phase14-pagination">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page} of {results.pagination.pages}</span>
            <button disabled={page >= results.pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>}
        </>}
    </div>
  </main>;
}

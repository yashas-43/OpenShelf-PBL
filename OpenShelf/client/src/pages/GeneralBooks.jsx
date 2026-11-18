import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import BookAvailability from '../components/dashboard/BookAvailability';

// Exact 32 genres approved for OpenShelf General Books.
export const GENERAL_BOOK_GENRES = [
  'Fiction','Fantasy','Science Fiction','Mystery','Thriller','Horror','Romance','Historical Fiction',
  'Adventure','Biography','Autobiography','History','Science','Technology','Computer Science','Mathematics',
  'Philosophy','Psychology','Self-Help','Business','Economics','Politics','Sociology','Religion and Spirituality',
  'Travel','Health and Wellness','Education','Literature','Poetry','Art and Design','Environment','Children’s Books'
];
// Phase 13 branding: one approved OpenShelf image is shown for every General Book.
const GENERAL_BOOK_COVER = '/openshelf-general-cover.jpg';

export default function GeneralBooks({ onBack }) {
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState([]);
  const [facets, setFacets] = useState({ genres: [], languages: [] });
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All genres');
  const [language, setLanguage] = useState('');
  const [availability, setAvailability] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.get('/api/books', { params: { search, genre, language, availability, sort, page, limit: 12 } })
      .then(({ data }) => { if (active) { setBooks(data.data || []); setFacets(data.facets || { genres: [], languages: [] }); setPagination(data.pagination || { pages: 0, total: 0 }); } })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load the catalogue. Check that the backend and MongoDB are running.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, genre, language, availability, sort, page, revision]);

  const openDetails = async (book) => {
    setSelected(book);
    setRequestMessage(null);
    // Refresh live availability before offering checkout; catalogue results may be older.
    try {
      const { data } = await api.get(`/api/books/${book._id}`);
      setSelected((current) => current?._id === book._id ? data.data : current);
    } catch { /* Keep the last catalogue state; the server still enforces stock. */ }
  };

  const borrowBook = async () => {
    if (!user) {
      window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } }));
      return;
    }
    if (user.role !== 'student' || !selected) return;
    setRequestBusy(true); setRequestMessage(null);
    try {
      const { data } = await api.post('/api/borrowings', { bookId: selected._id }, { timeout: 45000 });
      setRequestMessage({ type: 'success', text: data.message });
      // Refresh from MongoDB: other readers may have borrowed the remaining copies.
      try {
        const updated = await api.get(`/api/books/${selected._id}`);
        setSelected(updated.data.data);
      } catch { /* The checkout succeeded; the catalogue will still refresh. */ }
      setRevision((value) => value + 1);
    } catch (error) {
      if (error.response?.status === 401) signOut();
      setRequestMessage({ type: 'error', text: error.response?.data?.message || 'Could not borrow this book. Please try again.' });
      if (error.response?.status === 409 && selected) {
        try {
          const fresh = await api.get(`/api/books/${selected._id}`);
          setSelected(fresh.data.data);
          setRevision((value) => value + 1);
        } catch { /* Preserve original error if refresh fails. */ }
      }
    } finally { setRequestBusy(false); }
  };

  const reset = () => { setSearch(''); setGenre('All genres'); setLanguage(''); setAvailability(''); setSort('newest'); setPage(1); };

  return <main className="books-page">
    <header className="books-topbar"><button className="books-back" onClick={onBack}><ArrowLeft size={16}/> Back to home</button><a className="books-wordmark" href="#general-books"><BookOpen size={20}/> OpenShelf</a><span className="books-phase">GENERAL COLLECTION</span></header>
    <section className="books-hero"><span className="books-eyebrow">THE GENERAL LIBRARY · PHYSICAL BOOKS</span><h1>Find a book.<br/><span>Find a new world.</span></h1><p>Explore stories, ideas and discoveries across the OpenShelf collection.</p>
      <label className="books-search"><Search size={19}/><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search title, author or ISBN..."/><kbd>SEARCH</kbd></label>
    </section>
    <section className="books-content">
      <div className="books-section-head"><div><span className="books-eyebrow">CURATED FOR CURIOSITY</span><h2>Explore genres</h2></div><span className="books-count">{GENERAL_BOOK_GENRES.length} GENRES</span></div>
      <div className="genre-strip"><button className={genre === 'All genres' ? 'genre-chip active' : 'genre-chip'} onClick={() => {setGenre('All genres');setPage(1);}}>All books</button>{GENERAL_BOOK_GENRES.map((g) => <button key={g} className={genre === g ? 'genre-chip active' : 'genre-chip'} onClick={() => {setGenre(g);setPage(1);}}>{g}</button>)}</div>
      <div className="catalogue-heading"><div><span className="books-eyebrow">THE SHELVES</span><h2>{genre === 'All genres' ? 'All general books' : genre}</h2><p>{pagination.total} physical {pagination.total === 1 ? 'book' : 'books'} found</p></div><button className="reset-filters" onClick={reset}><X size={14}/> Clear filters</button></div>
      <div className="catalogue-toolbar"><div className="filter-label"><SlidersHorizontal size={16}/> Refine results</div><select aria-label="Language filter" value={language} onChange={e => {setLanguage(e.target.value);setPage(1);}}><option value="">All languages</option>{facets.languages.map(x=><option key={x}>{x}</option>)}</select><select aria-label="Availability filter" value={availability} onChange={e=>{setAvailability(e.target.value);setPage(1);}}><option value="">Any availability</option><option value="available">Available to borrow</option></select><select aria-label="Sort books" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option><option value="author">Author A–Z</option></select></div>
      {error && <div className="books-alert">{error}</div>}
      {loading ? <div className="books-empty"><div className="books-loader"/><p>Opening the shelves…</p></div> : books.length === 0 ? <div className="books-empty"><div className="empty-book"><BookOpen size={34}/></div><h3>{error ? 'Catalogue unavailable' : 'The shelves are waiting'}</h3><p>{error || 'No books match these filters yet. Add catalogue records to MongoDB to make them appear here.'}</p>{!error && <button className="books-outline-btn" onClick={reset}>Clear filters</button>}</div> : <div className="book-grid">{books.map(book=><article className="book-tile" key={book._id} onClick={()=>openDetails(book)}><div className="book-cover-area"><img src={book.coverUrl || GENERAL_BOOK_COVER} onError={(event) => { if (!event.currentTarget.src.endsWith(GENERAL_BOOK_COVER)) event.currentTarget.src = GENERAL_BOOK_COVER; }} alt={`Cover for ${book.title}`} loading="lazy"/><span className="book-genre-tag">{book.genre}</span></div><div className="book-tile-info"><h3>{book.title}</h3><p>by {book.author}</p><div className="book-tile-bottom"><span><BookAvailability book={book} /></span></div><button className="book-details-btn" onClick={e=>{e.stopPropagation();openDetails(book);}}>View details <ChevronRight size={15}/></button></div></article>)}</div>}
      {pagination.pages > 1 && <div className="books-pagination"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/> Previous</button><span>Page {page} of {pagination.pages}</span><button disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Next <ChevronRight size={16}/></button></div>}
    </section>
    <footer className="books-footer"><span>OpenShelf · Discover. Borrow. Read. Grow.</span><span>General collection · Physical books only</span></footer>
    {selected && <div className="book-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="book-modal" role="dialog" aria-modal="true" aria-labelledby="book-modal-title"><button className="book-modal-close" onClick={()=>setSelected(null)} aria-label="Close details"><X/></button><div className="book-modal-cover"><img src={selected.coverUrl || GENERAL_BOOK_COVER} onError={(event) => { if (!event.currentTarget.src.endsWith(GENERAL_BOOK_COVER)) event.currentTarget.src = GENERAL_BOOK_COVER; }} alt={`Cover for ${selected.title}`}/></div><div className="book-modal-copy"><span className="books-eyebrow">{selected.genre}</span><h2 id="book-modal-title">{selected.title}</h2><p className="book-modal-author">by {selected.author}</p><p>{selected.description}</p><dl><div><dt>Language</dt><dd>{selected.language || '—'}</dd></div>{selected.publisher && <div><dt>Publisher</dt><dd>{selected.publisher}</dd></div>}{selected.isbn && <div><dt>ISBN</dt><dd>{selected.isbn}</dd></div>}{selected.publishedYear && <div><dt>Published</dt><dd>{selected.publishedYear}</dd></div>}</dl><div className="book-modal-note">Physical borrowing only. Each student can hold up to 3 physical books total, including Student Textbooks. Clicking Borrow checks out one copy automatically, without administrator approval, and starts the return countdown immediately. Library staff still record physical returns. Email confirmation is attempted after checkout and delivery status is shown below; SMTP must be configured to send messages.</div>
          <div className="borrow-actions"><BookAvailability book={selected} detailed />
            <button type="button" className="dash-primary" disabled={requestBusy || user?.role === 'admin' || !selected.isBorrowable || requestMessage?.type === 'success'} onClick={borrowBook}>
              {requestBusy ? 'Borrowing…' : !user ? 'Log in to borrow' : user.role === 'admin' ? 'Students only' : !selected.isBorrowable ? 'No physical copies available' : 'Borrow Book'}
            </button></div>
          {requestMessage && <p role="status" className={requestMessage.type === 'error' ? 'dash-error' : 'dash-success'}>{requestMessage.text}</p>}</div></section></div>}
  </main>;
}

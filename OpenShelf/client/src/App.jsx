import { lazy, Suspense, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowRight, BookOpen, GraduationCap, LibraryBig, Menu, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import BrandMark from './components/ui/BrandMark';
import Button from './components/ui/Button';
import GlassCard from './components/ui/GlassCard';
import StatusPill from './components/ui/StatusPill';
import AuthModal from './components/auth/AuthModal';
import GeneralBooks from './pages/GeneralBooks';
import StudentLibrary from './pages/StudentLibrary';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PeerExchange from './pages/PeerExchange';
import GlobalSearch from './pages/GlobalSearch';
import { useAuth } from './context/AuthContext';
import { useEffect } from 'react';

const HeroScene = lazy(() => import('./components/home/HeroScene'));
const links = [{ label: 'Search books', href: '#search' }, { label: 'Discover', href: '#discover' }, { label: 'Peer exchange', href: '#peer-exchange-app' }, { label: 'Student library', href: '#student-library' }];

function Header({ onBrowseBooks, onNavigate }) {
  const [open, setOpen] = useState(false);
  const { user, checking, signOut } = useAuth();
  const openAuth = (mode) => window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode } }));
  return <header className="home-header"><a href="#home" aria-label="OpenShelf home"><BrandMark /></a>
    <nav className={open ? 'home-nav is-open' : 'home-nav'} aria-label="Main navigation">{links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
      <div className="home-mobile-actions"><button onClick={() => { setOpen(false); onNavigate('search'); }}>Search all books</button><button onClick={() => { setOpen(false); onBrowseBooks(); }}>Browse books</button>{user ? <><button onClick={() => { setOpen(false); onNavigate(user.role === 'admin' ? 'admin-dashboard' : 'dashboard'); }}>My dashboard</button><button onClick={() => { setOpen(false); signOut(); onNavigate('home'); }}>Log out</button></> : !checking && <><button onClick={() => { setOpen(false); openAuth('login'); }}>Log in</button><button onClick={() => { setOpen(false); openAuth('register'); }}>Create account</button></>}</div>
    </nav>
    <div className="header-actions"><button className="header-login" onClick={() => onNavigate('search')}><Search size={15} /> Search</button><button className="header-login" onClick={onBrowseBooks}>Browse books</button>
      {!checking && (user ? <><button className="header-login" onClick={() => onNavigate(user.role === 'admin' ? 'admin-dashboard' : 'dashboard')}>My dashboard</button><button className="header-login" onClick={() => { signOut(); onNavigate('home'); }}>Log out</button></> : <><button className="header-login" onClick={() => openAuth('login')}>Log in</button><Button size="sm" onClick={() => openAuth('register')}>Get started <ArrowRight size={15} /></Button></>)}
    </div><button className="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
  </header>;
}

function HeroVisual() {
  const reduced = useReducedMotion();
  return <div className="hero-visual-wrap"><div className="visual-halo" />
    {reduced ? <div className="visual-fallback"><BookOpen size={100} strokeWidth={1} /><span>KNOWLEDGE SERIES</span></div> : <Suspense fallback={<div className="visual-fallback"><BookOpen size={80} /></div>}><HeroScene /></Suspense>}
    <div className="floating-note note-left"><span className="note-icon"><BookOpen size={16} /></span><span><strong>Explore freely</strong><small>Ideas without limits</small></span></div>
    <div className="floating-note note-right"><span className="note-icon note-blue"><Sparkles size={16} /></span><span><strong>Find your next read</strong><small>Curated for curiosity</small></span></div>
  </div>;
}

function App() {
  const { user, checking, sessionError } = useAuth();
  const reduceMotion = useReducedMotion();
  const viewFromHash = () => {
    const hash = window.location.hash;
    if (hash === '#dashboard' || hash === '#student-dashboard') return 'dashboard';
    if (hash === '#admin-dashboard') return 'admin-dashboard';
    if (hash === '#general-books') return 'books';
    if (hash === '#search') return 'search';
    if (hash === '#student-library') return 'students';
    if (['#peer-exchange-app', '#peer-listings', '#peer-requests'].includes(hash)) return 'peer';
    return 'home';
  };
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (['#home', '#dashboard', '#student-dashboard', '#admin-dashboard', '#general-books', '#search', '#student-library', '#peer-exchange-app', '#peer-listings', '#peer-requests'].includes(hash)) setView(viewFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const navigate = (next) => {
    const hashes = { home: '#home', search: '#search', books: '#general-books', students: '#student-library', peer: '#peer-exchange-app', 'peer-listings': '#peer-listings', 'peer-requests': '#peer-requests', dashboard: '#dashboard', 'admin-dashboard': '#admin-dashboard' };
    setView(['peer', 'peer-listings', 'peer-requests'].includes(next) ? 'peer' : next);
    window.location.hash = hashes[next] || '#home';
    window.scrollTo(0, 0);
  };
  const openAuth = () => window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'login' } }));
  return <><AuthModal />{view === 'search' ? <GlobalSearch onBack={() => navigate('home')} onNavigate={navigate} /> :
    view === 'books' ? <GeneralBooks onBack={() => navigate('home')} /> :
    view === 'students' ? <StudentLibrary onBack={() => navigate('home')} /> :
    view === 'peer' ? <PeerExchange key={window.location.hash} initialTab={window.location.hash === '#peer-listings' ? 'mine' : window.location.hash === '#peer-requests' ? 'requests' : 'browse'} onBack={() => navigate('home')} /> :
    view === 'dashboard' && user?.role === 'student' ? <UserDashboard onNavigate={navigate} /> :
    view === 'admin-dashboard' && user?.role === 'admin' ? <AdminDashboard onNavigate={navigate} /> :
    (view === 'dashboard' || view === 'admin-dashboard') ?
      <main className="dash-access"><BrandMark/><h1>Access your dashboard</h1><p>{checking ? 'Verifying your session…' : sessionError || (user ? 'This dashboard is not available for your account role.' : 'Please log in to view your private workspace.')}</p><div><button className="dash-primary" onClick={openAuth}>Log in</button><button className="dash-outline" onClick={() => navigate('home')}>Back to home</button></div></main> : <main className="home-page" id="home"><div className="home-grid-bg" /><div className="home-glow glow-a" /><div className="home-glow glow-b" />
    <Header onBrowseBooks={() => navigate('books')} onNavigate={navigate} />
    <section className="home-hero">
      <motion.div className="hero-copy" initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.75 }}>
        <div className="home-eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</div>
        <h1>Discover a world<br />beyond the <span className="home-gradient">covers.</span></h1>
        <p className="hero-lead">A universe of knowledge, one page at a time. Explore a thoughtfully curated digital library built to help curious minds learn, grow and go further.</p>
        <div className="hero-ctas"><Button onClick={() => document.querySelector('#discover')?.scrollIntoView({ behavior: 'smooth' })}>Explore the library <ArrowRight size={17} /></Button><a className="text-link" href="#student-library" onClick={(event) => { event.preventDefault(); navigate('students'); }}><span><BookOpen size={15} /></span> Student textbooks</a></div>
        <div className="hero-trust"><span><ShieldCheck size={15} /> A space for every learner</span><span><Sparkles size={15} /> Made for discovery</span></div>
      </motion.div>
      <HeroVisual />
      <a className="scroll-cue" href="#discover"><span>SCROLL TO EXPLORE</span><ArrowDown size={14} /></a>
    </section>

    <section className="home-proof" aria-label="OpenShelf highlights"><div><strong>01</strong><span>Discover new ideas</span></div><div><strong>02</strong><span>Learn at your pace</span></div><div><strong>03</strong><span>Grow every day</span></div></section>

    <section className="home-section" id="discover"><div className="home-section-heading"><div><span className="home-eyebrow">A LIBRARY THAT MOVES WITH YOU</span><h2>Find your <span className="home-gradient">next curiosity.</span></h2></div><p>From a first spark of interest to a lifelong passion, your next discovery is waiting.</p></div>
      <div className="discovery-grid">
        {/* An anchor makes the whole General Library card keyboard-accessible and clickable. */}
        <GlassCard
          as="a"
          href="#general-books"
          className="discovery-card discovery-general"
          onClick={(event) => { event.preventDefault(); navigate('books'); }}
          aria-label="Open General Library"
        >
          <div className="discovery-icon"><LibraryBig size={23} /></div>
          <StatusPill status="success">Explore collection</StatusPill>
          <h3>General Library</h3>
          <p>Browse a wide range of genres, authors and ideas. Find a book that speaks to you.</p>
          <span className="discovery-card-link">Explore genres <ArrowRight size={15} /></span>
          <div className="card-orbit orbit-one" />
          <div className="card-orbit orbit-two" />
        </GlassCard>

        {/* The full Student Library link works from any part of its card. */}
        <GlassCard
          as="a"
          href="#student-library"
          className="discovery-card discovery-student"
          onClick={(event) => { event.preventDefault(); navigate('students'); }}
          aria-label="Open Student Library"
        >
          <div className="discovery-icon"><GraduationCap size={23} /></div>
          <StatusPill status="neutral">Learning resources</StatusPill>
          <h3>Student Library</h3>
          <p>Find learning resources for School and PUC. Choose 1st or 2nd PUC directly, with no stream selection.</p>
          <span className="discovery-card-link">Explore study paths <ArrowRight size={15} /></span>
          <div className="student-lines" aria-hidden="true">A&nbsp; B&nbsp; C<br />01&nbsp; 02&nbsp; 03</div>
        </GlassCard>
      </div>
    </section>

    <section className="home-section home-peer-intro" id="community-exchange"><div className="home-section-heading"><div><span className="home-eyebrow">BOOKS FROM READERS LIKE YOU</span><h2>Peer-to-peer <span className="home-gradient">book exchange.</span></h2></div><p>List a physical book you own, explore other readers' listings and arrange exchange or lending privately.</p></div><GlassCard className="peer-home-cta"><div className="discovery-icon"><BookOpen size={25}/></div><h3>Pass a book forward.</h3><p>Request a copy from another reader, coordinate securely in-app, and optionally open Gmail compose when the owner consents to sharing their address.</p><Button onClick={() => navigate('peer')}>Explore Peer Exchange <ArrowRight size={16}/></Button></GlassCard></section>

    <section className="home-final-cta" id="login"><div className="cta-spark"><Sparkles size={22} /></div><span className="home-eyebrow">THE NEXT CHAPTER IS YOURS</span><h2>Ready to open<br /><span className="home-gradient">something amazing?</span></h2><p>Your journey through knowledge starts with a single page.</p><Button onClick={() => window.dispatchEvent(new CustomEvent('openshelf:auth-request', { detail: { mode: 'register' } }))}>Join OpenShelf <ArrowRight size={16} /></Button><small>New here? Create a free account to access your dashboard.</small></section>
    <footer className="home-footer"><BrandMark /><span>© {new Date().getFullYear()} OpenShelf · Discover. Borrow. Read. Grow.</span><a href="#home">Back to top ↑</a></footer>
  </main>}</>;
}

export default App;

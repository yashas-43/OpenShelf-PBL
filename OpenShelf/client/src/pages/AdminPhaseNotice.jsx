import { ArrowLeft, ShieldCheck } from 'lucide-react';
import BrandMark from '../components/ui/BrandMark';
import AdminBorrowingDesk from '../components/admin/AdminBorrowingDesk';
import { useAuth } from '../context/AuthContext';

/** Phase 9 provides only the administrator's physical-loan controls.
 * The full Admin Dashboard remains scoped to Phase 11. */
export default function AdminPhaseNotice({ onNavigate }) {
  const { user, signOut } = useAuth();
  return <main className="dash-admin-hold admin-phase-nine">
    <header className="admin-phase-header"><BrandMark /><div><span className="dash-eyebrow">ADMINISTRATOR SESSION</span><h1>Borrowing management</h1><p>Signed in as {user?.email}. Only the Phase 9 borrowing desk is available here. Administrator access is available through the Admin Dashboard. Textbook purchases use a non-payable QR demo in local development.</p></div>
      <div className="admin-phase-links"><button className="dash-outline" onClick={() => onNavigate('home')}><ArrowLeft size={16}/> Home</button><button className="dash-outline" onClick={() => { signOut(); onNavigate('home'); }}>Log out</button></div></header>
    <AdminBorrowingDesk />
    <p className="dash-scope"><ShieldCheck size={16}/> All actions require authenticated admin authorization on the backend; changing the frontend URL cannot grant staff access.</p>
  </main>;
}

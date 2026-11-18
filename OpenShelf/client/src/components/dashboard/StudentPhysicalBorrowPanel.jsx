import { useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import BookAvailability from './BookAvailability';

/**
 * A physical Student Textbook is borrowed once per subject, not once per PDF.
 * The backend is authoritative for inventory and the shared three-book limit.
 */
export default function StudentPhysicalBorrowPanel({ textbook, onNotice, onAvailabilityChange }) {
  const { user } = useAuth();
  const [borrowing, setBorrowing] = useState(false);
  const [checking, setChecking] = useState(false);

  /**
   * Recheck MongoDB instead of relying on the availability captured when the
   * Student Library screen first loaded. This matters after an admin adds stock.
   */
  async function refreshAvailability() {
    setChecking(true);
    try {
      const { data } = await api.get(`/api/student-borrowings/${textbook.id}/availability`);
      onAvailabilityChange(textbook.id, data.data);
      return data.data;
    } catch (error) {
      onNotice(error.response?.data?.message || 'Could not check the physical stock.');
      return null;
    } finally {
      setChecking(false);
    }
  }

  /**
   * Never create a loan without real stock. If the catalogue says sold out,
   * refresh first; a copy may have been added since the page was opened.
   * The server checks the stock again inside a MongoDB transaction.
   */
  async function borrowPhysicalCopy() {
    if (!user) {
      onNotice('Log in with a student account to borrow a physical textbook.');
      window.dispatchEvent(new CustomEvent('openshelf:auth-request', {
        detail: { mode: 'login' },
      }));
      return;
    }

    if (user.role !== 'student') {
      onNotice('Only student accounts can borrow physical textbooks.');
      return;
    }

    setBorrowing(true);
    onNotice('');

    try {
      // A visibly sold-out button still checks whether an administrator
      // registered physical copies in the meantime; it never invents stock.
      if (!textbook.physical?.isBorrowable) {
        const availability = await refreshAvailability();
        if (!availability) return;
        if (!availability.isBorrowable) {
          onNotice(
            'No physical copies are currently available. Ask the librarian to verify and enter actual textbook stock in Admin Dashboard → Student PDFs.',
          );
          return;
        }
      }

      const { data } = await api.post('/api/student-borrowings', {
        textbookId: textbook.id,
      }, { timeout: 45000 });
      onNotice(data.message || 'Physical textbook borrowed. Check My Borrowed Books for the due date.');
    } catch (error) {
      // A stock conflict or fourth-book attempt never decrements inventory.
      onNotice(error.response?.data?.message || 'Physical textbook checkout failed.');
    } finally {
      // Always refresh after checkout: another student might have taken the
      // final copy, or the transaction might have failed due to a race.
      await refreshAvailability();
      setBorrowing(false);
    }
  }

  const isBusy = borrowing || checking;
  const isBorrowable = Boolean(textbook.physical?.isBorrowable);

  return (
    <div className="student-physical-borrow">
      <div className="student-physical-info">
        <strong>Borrow physical textbook</strong>
        <p>
          Borrow up to 3 physical books total across Student Textbooks and General Books.
          Digital PDF access is separate and does not count toward the physical borrowing limit.
        </p>
        {!isBorrowable && (
          <p className="student-stock-help">
            No physical copy has been confirmed as available. The librarian can update
            actual stock in Admin Dashboard → Student PDFs. When a PDF is published, it can be unlocked through the ₹10 classroom demo checkout.
          </p>
        )}
        <BookAvailability
          detailed
          book={{ ...textbook.physical, isAvailableForBorrow: true }}
        />
        <button
          className="student-secondary-link"
          type="button"
          onClick={refreshAvailability}
          disabled={isBusy}
          aria-label={`Refresh physical availability for ${textbook.subject}`}
        >
          {checking ? 'Checking stock…' : 'Refresh availability'}
        </button>
      </div>
      <button
        type="button"
        className="student-view-button"
        disabled={isBusy}
        onClick={borrowPhysicalCopy}
      >
        {borrowing ? 'Borrowing…' : 'Borrow Book'}
      </button>
    </div>
  );
}

# OpenShelf — Three-book physical borrowing limit

## What changed

- Each student may hold **at most three active physical loans in total**, across General Books **and** Student Textbooks combined.
- Borrowing the fourth physical book responds with HTTP **409 Conflict** and a clear explanation. No book inventory or loan record is changed by a rejected checkout.
- Returned and rejected General Book records do **not** use slots. Open General Book requests (including legacy requested/approved), borrowed and overdue loans do. Borrowed and overdue Student Textbooks use slots.
- Admin-recorded returns free a slot. A student cannot exceed the limit by borrowing three from each category.
- Free student PDF reading, peer-to-peer exchange inquiries, and purchases do not count against this library borrowing cap.
- The User Dashboard overview displays `used/3`, with remaining slots. Both catalogue borrowing controls mention the policy.
- Reservations/waiting lists were **not** implemented.

## Transaction safety and existing data

Both checkout services invoke one shared `enforceThreeBookLimit()` check **inside** their MongoDB transactions. The check first increments the student document's internal `borrowLimitRevision` field. This serializes competing checkouts for the same account across both loan collections before either count is read. MongoDB transaction conflicts retry instead of silently allowing a fourth checkout. This field is a transaction lock revision, not an active-loan counter. No migration, book stock reset, data deletion, or account password change is needed.

The counts always use persisted loan documents. Existing loan records count automatically, including students who already held more than three books; such students cannot borrow more until enough loans are returned. The change only limits new checkouts.

**Requires MongoDB replica-set PRIMARY** as with the existing stock transactions. A standalone MongoDB installation is not supported for safe borrowing.

## Files added

- `server/src/services/borrowingLimitRules.js` — pure three-book rules and dashboard slot calculations.
- `server/src/services/borrowingLimitService.js` — shared MongoDB transactional check and user-document write lock.
- `server/src/tests/borrowingLimitRules.test.js` — pure rule tests.
- `docs/THREE-BOOK-BORROWING-LIMIT.md` — this guide.

## Files changed

- `server/src/models/User.js` — private `borrowLimitRevision` transaction field.
- `server/src/services/borrowingService.js` — enforce global cap before General Book checkout.
- `server/src/services/studentBorrowingService.js` — enforce same cap before physical textbook checkout.
- `server/src/controllers/dashboardController.js` — return global slot usage from MongoDB.
- `client/src/pages/UserDashboard.jsx` — show `used/3` and remaining slots.
- `client/src/pages/GeneralBooks.jsx` — clarify cap in checkout details.
- `client/src/components/dashboard/StudentPhysicalBorrowPanel.jsx` — clarify shared cap for textbook borrowing.
- `README.md` — feature and testing guidance.

## Setup in Windows PowerShell

Open the new extracted **OpenShelf** folder in VS Code and preserve your existing private `server/.env` and `client/.env` from the working installation. Do not copy secrets into a public ZIP.

```powershell
node -v
npm -v
npm run install:all
npm test
npm run build
npm run dev
```

Open `http://localhost:5173`. No new environment variables or payment configuration is required.

## Manual checklist

1. With MongoDB connected as PRIMARY, sign in as Student A.
2. Borrow two different General Books, then one physical Student Textbook (with stock configured in Admin Dashboard).
3. Verify the dashboard shows **3/3**.
4. Attempt a **fourth** General Book and a **fourth** Student Textbook. Both must be rejected with the 3-book limit message and no loss of stock.
5. Have an administrator record one return; refresh the dashboard and confirm **2/3** and that another physical loan succeeds.
6. Verify overdue books and legacy pending loans still consume a slot, while a returned loan does not.
7. Verify free PDF reading, Gmail registration OTP and peer exchange work unchanged.
8. Try two checkouts simultaneously with two different categories and verify the limit cannot be exceeded. The database must support transactions and the app must be tested locally for this concurrency case.

## Automated verification and limitations

Pure policy tests can run without MongoDB. Full checkout and simultaneous transaction integration tests require the user's configured MongoDB instance and existing real inventory. A production Vite build requires `npm run install:all` before `npm run build`.

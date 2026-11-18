# Phase 11 — OpenShelf Admin Dashboard

## Scope and implementation

This is a **cumulative** source package based on the Phase 10 Gmail/OTP build. It preserves the frontend, existing authentication/JWT handling, MongoDB models, automatic borrowing with three physical copies, the student PDF importer, Gmail outbox, and student dashboards.

Phase 11 replaces the Phase 9 administrator holding screen **in routing only** with a responsive protected Admin Dashboard. The previous `AdminPhaseNotice.jsx` file remains preserved for historical comparison but is not rendered.

### Modules delivered

| Section | API | What it does |
|---|---|---|
| Overview | `GET /api/admin/overview` | Actual counts for students, books, loans, overdue records, textbook groups, PDFs, email failures, purchases, and listings; latest borrowing activity |
| Users | `GET /api/admin/users`, `PATCH /api/admin/users/:id/status`, `GET /api/admin/users/:id/borrowings` | Filter and page accounts, disable or enable them, invalidate student sessions, inspect borrowing history |
| General Books | `GET/POST /api/admin/books`, `PATCH/DELETE /api/admin/books/:id` | Add, edit, adjust stock, publish/unpublish via editing, archive (soft delete); exact approved 32 genres |
| Cover uploads | `POST /api/admin/books/:id/cover` | Multer multipart JPG/PNG/WebP upload, <=4 MiB, verified magic bytes, served from `GET /api/books/:id/cover` for published books |
| Borrowing | `GET /api/admin/borrowings` and existing POST actions | Retained Phase 9 desk for legacy approvals, verified physical returns, and extension decisions; new loans still auto-checkout |
| Student textbooks | `GET /api/admin/textbooks`, `PATCH /api/admin/textbooks/:id/publish`, `GET /api/admin/textbooks/:id/pdfs` | Inspect group counts, control publication |
| Student PDFs | `POST /api/admin/textbooks/:id/pdfs`, `POST /api/admin/pdfs/:id/replace`, `PATCH /api/admin/pdfs/:id` | Multer private uploads under `TEXTBOOKS_ROOT/admin-uploads`, replace retaining document ID, hide/restore PDF, set display title, confirm/revoke publication rights |
| Email logs | `GET /api/admin/emails`, `POST /api/admin/emails/:id/retry` | SMTP acceptance/failures, retries for safe event types, **never resend OTPs** |
| Purchases | `GET /api/admin/purchases` | Read-only records; actual Razorpay verification is Phase 12 |
| Exchange moderation | `GET /api/admin/peer-listings`, `DELETE /api/admin/peer-listings/:id` | View/remove existing listings; full peer exchange/report intake is Phase 13 |
| Reports | `GET /api/admin/reports/borrowings` | Status breakdown, checked-out/returned/overdue totals, earliest 100 overdue accounts |
| Audit | `GET /api/admin/activity` | Administrator action audit entries, no passwords or secrets |
| Settings | dashboard UI + overview response | Safe SMTP configured/not-configured status, security and deferred feature notes |

### Security controls

- Every `/api/admin/*` route uses `requireAuth` followed by `requireRole('admin')` and checks the signed JWT for the configured admin account. Students cannot access the routes by editing the URL.
- No admin registration is exposed, and no student can assign themselves an admin role.
- Only **physical** General Books may be added; no General Book PDF property is accepted by the backend. Uploaded PDFs are referenced **only** by StudentTextbook/StudentPDF models.
- Inventory edits run in a MongoDB transaction; availability is recalculated as `new total copies - number of open loans`. Admin cannot reduce total below active loans. Archiving preserves history.
- User deactivation revokes sessions by incrementing `sessionVersion`.
- Uploaded PDF bytes require the `%PDF-` header. Private filenames are generated, not taken from caller paths. Upload size is capped at 30 MiB (large files use the manifest importer). Replacement revokes `rightsConfirmed` again.
- Cover images must be JPG, PNG, or WebP by magic bytes (<=4 MiB). The served cover path cannot traverse directories and is available only for published books.
- SMTP secrets, admin password hash, and student password hashes are never returned in admin API responses.
- PDF rights may only be confirmed when you have permission to distribute the material. In production, the PDF reader refuses unconfirmed rights.

### Installation on Windows

1. Extract this Phase 11 ZIP and open the inner `OpenShelf` folder in VS Code.
2. Copy your private `server/.env` and `client/.env` from the previous project. **Never overwrite their values with placeholders.** Rotate your JWT secret if it was previously exposed in a screenshot.
3. Make sure `MONGODB_URI` connects to the same MongoDB `openshelf` replica set as your existing installation. Do **not** drop the database or re-run one-time seed commands.
4. Install the updated dependencies (Phase 11 adds Multer):

   ```powershell
   npm run install:all
   ```

5. For PDF uploads, set `TEXTBOOKS_ROOT=D:\Library\Textbooks` in `server/.env`. This directory and `admin-uploads/` must be writable by the backend. Optionally set `BOOK_COVER_ROOT=D:\Library\OpenShelf-Covers`.
6. Run the tests and frontend build:

   ```powershell
   npm test
   npm run build
   ```

7. Start both services:

   ```powershell
   npm run dev
   ```

8. Open `http://localhost:5173`, sign in using your **existing configured administrator email and password**, and click **My dashboard**. Students still receive the Student Dashboard instead.

Your 58 PDFs remain on your laptop. They are **not included** in this ZIP and are **not re-imported automatically**. If this is a new MongoDB database, run `npm run pdf:check -- --root "D:\Library\Textbooks"` and then `npm run pdf:import -- --root "D:\Library\Textbooks"` only after verification passes. If the existing 58 are already imported, do not re-import just to use Phase 11.

### Tests to run locally

- [ ] Admin login enters the new sidebar dashboard; student login cannot open `/api/admin/overview` (HTTP 403).
- [ ] Overview counts correspond to MongoDB Compass records; empty collections show zeros.
- [ ] Admin adds one real General Book from the approved genres and it appears in the public catalogue. Public stock quantities remain hidden.
- [ ] Change a book's total copies while it has active loans; ensure lower-than-active quantities are rejected.
- [ ] Archive one book; confirm its old borrowing history is preserved and new borrowing attempts are denied.
- [ ] Upload a valid cover, inspect it in General Books, and test that a fake image is rejected.
- [ ] Search student users and disable one test account; its existing session must stop working. Re-enable it afterward.
- [ ] Inspect physical borrowing records and record a confirmed return.
- [ ] Open Student PDF administration; confirm all 37 subject groups / 58 parts in your imported collection.
- [ ] Upload a permitted small PDF, review it, confirm rights only when genuinely authorized; replace it and verify rights are revoked again.
- [ ] Check email logs; retry a failed non-OTP email only after configuring SMTP.
- [ ] View overdue reports and verify they correspond to stored loan dates.
- [ ] View audit activity and verify administrator mutations appear.
- [ ] Run `npm test` and `npm run build` locally and review all errors.

### Known limitations / deliberately future phases

- **Phase 12:** no Razorpay verification, payment processing, monetary revenue totals or purchase creation.
- **Phase 13:** no peer-to-peer listing creation, contact consent workflow, or abuse-report submissions; dashboard can only moderate records already stored.
- **Phase 14:** complete user-facing notification bell, global search, announcements and exports remain pending.
- No original 58 PDF bytes are distributed in the ZIP; local files are required for real reader testing.
- This environment cannot access your MongoDB instance, SMTP, or npm registry. Local end-to-end API, file-upload, Gmail, and production Vite build verification is required on your machine.
- New Multer dependency is added to `server/package.json`. Because the npm registry is inaccessible here, `server/package-lock.json` will be refreshed by your normal `npm run install:all` (`npm install`); **do not run `npm ci` before that refresh**.

### Source changes

New files:
- `client/src/pages/AdminDashboard.jsx`
- `server/src/controllers/adminController.js`
- `server/src/controllers/adminUploadsController.js`
- `server/src/routes/adminRoutes.js`
- `server/src/services/adminUploads.js`
- `server/src/validators/adminValidation.js`
- `server/src/models/AdminAudit.js`
- `server/src/tests/adminManagement.test.js`
- `docs/PHASE-11-COMPLETE-ADMIN-DASHBOARD.md`

Modified files:
- `client/src/App.jsx`
- `client/src/components/admin/AdminBorrowingDesk.jsx`
- `client/src/pages/GeneralBooks.jsx`
- `client/src/styles/index.css`
- `server/src/app.js`
- `server/src/controllers/bookController.js`
- `server/src/models/Book.js`
- `server/src/routes/bookRoutes.js`
- `server/src/services/borrowingService.js`
- `server/.env.example`
- `server/package.json`
- `server/package-lock.json` (top-level dependency declaration; npm install refreshes lock resolution)
- `.gitignore`
- `README.md`

Do not run Phase 12 until explicit approval after Phase 11 tests.

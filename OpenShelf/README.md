> **Classroom demo checkout edition:** Student Library “Buy Access” now opens a non-payable ₹10 QR and simulates completion after about two seconds. No money moves and Razorpay checkout is paused when `NODE_ENV=development` and `DEMO_QR_ENABLED=true`. Add these settings to your existing private `server/.env`; see [the demo QR setup guide](docs/DEMO-QR-2-SECOND-CHECKOUT.md). Do not use simulated access in production.

# OpenShelf — Digital Public Library and Book Exchange System

**CURRENT EDITION (blue + cloud white fixes):** This ZIP uses **Razorpay TEST MODE ONLY**, with one ₹10 subject purchase unlocking **all authorised PDF parts** belonging to the same School/PUC subject. There is a one-time flat ₹10 fine per overdue physical return, and user-submitted peer listings require administrator approval before becoming public. PDF files and private `.env` secrets are **not** included. Payments cannot start until every part is actually uploaded and distribution rights are confirmed.

**Recent fixes:** Sign-in now opens over the book-details dialog; the yellow palette has been replaced by cool off-white and ice-blue; the Student Library explains missing/partial/unapproved PDFs and does not offer checkout until all parts are available. See [PDF, modal and color fix instructions](docs/PDF-SETUP-MODALS-AND-COOL-BLUE-FIXES.md) and [Razorpay test setup](docs/RAZORPAY-10RUPEES-TEST-AND-PEER-APPROVAL.md).

**Important:** The remaining phase notes below are kept for historical reference. Older references to free PDFs, disabled payments, per-day fines, or SMS sign-up describe **superseded editions** rather than the current code. The current registration process uses **email OTP**. Live MongoDB, Gmail, PDF and Razorpay testing must be completed on your laptop using your own credentials and licensed PDF files.

## Phase 13 — Peer-to-Peer Exchange and OpenShelf General Book Cover (latest)

The user-provided `client/public/openshelf-general-cover.jpg` is the consistent visible cover for **all General Books** in the public catalogue, detail view, and student borrowing history. It does not alter original MongoDB title, author, or cover metadata. A separate optional upload is available for peer-owned books.

Phase 12 payment code was previously added after Phase 13 and is now paused. Phase 13 adds physical exchange/lending listings, optional images, personal listing management, real MongoDB requests, owner decisions, private messages, conditional Gmail compose links (only with owner's explicit contact consent), request history, reports, and administrator moderation. **No PDF access or payment flow is added to peer books.**

Read `docs/PHASE-13-PEER-EXCHANGE.md` for security rules, all new endpoints, local setup, tests and limitations.


## Phase 11 — Full administrator workspace (latest)

The administrator login now opens a protected Admin Dashboard with MongoDB-backed overview, student account controls, General Book editing/archiving and cover uploads, existing borrowing desk, Student PDF management and uploads, email delivery logs/retries, purchase history, peer listing moderation, borrowing reports, and audit records. **Purchases, payments, and peer exchange creation are not implemented in Phase 11.**

See **`docs/PHASE-11-COMPLETE-ADMIN-DASHBOARD.md`** for the API reference, file changes, security rules, and testing checklist. The backend adds a `multer` dependency: run `npm run install:all` after extracting, which will also refresh the server package lock. Keep your existing `.env` files and your local 58-PDF collection.

> **Latest update — renamed textbook PDFs:** The bundled `data/Textbooks-Manifest.csv` is from the newest user manifest. It maps **58 local PDFs to 37 textbooks** (16 single-file and 21 two-part). See [`docs/RENAMED-TEXTBOOKS-MANIFEST-3.md`](docs/RENAMED-TEXTBOOKS-MANIFEST-3.md) for Windows import steps. Rename files in `D:\Library\Textbooks` first and verify all 58 before running `pdf:import`. The ZIP does not contain PDF bytes.

# OpenShelf — Digital Library

OpenShelf is being developed incrementally. Each phase ZIP contains the cumulative project from Phase 1 through the latest approved phase.

## Phase 2 — Design System

Phase 2 adds the shared visual language and reusable UI components: brand mark, buttons, glass cards, section headings, status pills, text fields, color tokens, typography, responsive layouts and reduced-motion support. The current screen is a design-system preview, not the final homepage; the cinematic 3D homepage is a later phase.

## Requirements
- Node.js 20 LTS or newer
- npm
- MongoDB running locally or a MongoDB connection string

## Run on Windows / VS Code
1. Extract the ZIP and open the `OpenShelf` folder in VS Code.
2. Open Terminal → New Terminal.
3. Install dependencies from the project root:

   ```bash
   npm run install:all
   ```

4. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and `CLIENT_URL`.
5. Copy `client/.env.example` to `client/.env` and set `VITE_API_URL=http://localhost:5000`.
6. Start both applications from the root:

   ```bash
   npm run dev
   ```

7. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

The frontend and API run separately. Keep the terminal open while using the site. Never commit `.env` files or real credentials.

## Phase 2 component locations
- `client/src/components/ui/BrandMark.jsx`
- `client/src/components/ui/Button.jsx`
- `client/src/components/ui/GlassCard.jsx`
- `client/src/components/ui/SectionHeading.jsx`
- `client/src/components/ui/StatusPill.jsx`
- `client/src/components/ui/TextField.jsx`
- `client/src/styles/index.css`

## API health check
`GET http://localhost:5000/api/health`


## Phase 4 — Authentication setup

Phase 4 adds student registration, common student/admin login, JWT sessions, protected `/api/auth/me`, bcrypt password hashing, login/register rate limiting, and optional Gmail registration confirmation. Admin accounts cannot be created through public registration.

### 1. Install the Phase 4 dependencies

From the project root, run:

```bash
npm run install:all
```

### 2. Configure the server environment

Copy `server/.env.example` to `server/.env` (keep your existing `.env` values and add the new variables). Set a long random `JWT_SECRET`, your MongoDB URI, and administrator details.

Generate a bcrypt hash for your administrator password from the `server` folder:

```bash
npm run hash-password -- "YourStrongAdminPassword"
```

Copy the printed hash into `ADMIN_PASSWORD_HASH`. Set `ADMIN_EMAIL` to the administrator's email. The plain password is not stored in `.env` or frontend code. Do not use the example values in production.

### 3. Configure Gmail registration confirmation (optional for local UI testing)

Set `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_SECURE=false`, `EMAIL_USER`, `EMAIL_PASS` (Google App Password), and `EMAIL_FROM` in `server/.env`. If SMTP is not configured, account registration still works and the API returns `emailStatus: not_configured`; no email is falsely reported as sent.

### 4. Run OpenShelf

From the project root:

```bash
npm run dev
```

Open `http://localhost:5173`. Use **Get started** to register a student, or **Log in** for an existing student/admin account.

### 5. Authentication API

- `POST /api/auth/register` — student registration. Required: `fullName`, `email`, `password`, `confirmPassword`.
- `POST /api/auth/login` — common login. Required: `email`, `password`.
- `GET /api/auth/me` — current account. Requires `Authorization: Bearer <token>`.

JWTs expire after `JWT_EXPIRES_IN` (default 2 hours). The frontend stores the token in localStorage for this development phase. A later hardening pass should move browser sessions to secure, HttpOnly cookies before production deployment.

### Phase 4 limitations

Password-reset flow, email verification links, persistent session refresh, dashboard pages, and production deployment hardening are not implemented in this phase. Registration confirmation email is sent only when SMTP is correctly configured.

## Phase 5 — General Books

Phase 5 adds a physical-books catalogue at `/api/books` and a General Books browsing view in the React client.

### Included
- 32 configurable general-collection genre labels.
- MongoDB `Book` model (physical format only).
- Public catalogue listing and book-detail API endpoints.
- Search by title, author, or ISBN; genre, language, and availability filters; sorting and pagination.
- Responsive catalogue, empty/loading/error states, and book details dialog.
- No general-book PDF upload, reading, or download endpoints or UI.

### Run
From the project root:

```powershell
npm run install:all
```

Configure `server/.env` using `server/.env.example`, ensure MongoDB is running, then:

```powershell
npm run dev
```

Open the Vite URL printed by the client terminal (normally `http://localhost:5173`). Use **Browse books** in the header or **Explore genres** on the General Library card.

### Catalogue data
The Phase 5 catalogue intentionally does not seed invented titles. Add real physical-book records to the MongoDB `books` collection using the fields in `server/src/models/Book.js`. The 32 genre labels currently included are a starter set because the original prompt did not contain the exact named genre list; replace these labels in `client/src/pages/GeneralBooks.jsx` with the authoritative list when supplied. The backend currently exposes read-only catalogue endpoints; admin book management belongs to Phase 11.

### Current scope boundaries
Borrow and purchase buttons are not simulated in this phase. They will be connected to the real borrowing and payment workflows in Phases 9 and 12. General Books have no PDF functionality by design.


## Student Category update (before Phase 7 PDF integration)

The home page Student Library card now opens a working selection screen:
- School → choose only Class 8, Class 9, or Class 10.
- PUC → choose **1st PUC** or **2nd PUC** directly. **No** Science/Commerce stream choice.
- Engineering has been removed from the student navigation and home page description.

The student screens intentionally do not show invented textbooks or pretend to read PDFs. Actual student PDF storage, permissions, catalogue and viewing/upload workflows are Phase 7 features. The General Library remains physical-books-only and has no PDF endpoints.

### Prepare a 4 GB local textbook collection without uploading it to ChatGPT

From the extracted project root, point the manifest generator at the folder on your own laptop that contains the PDFs (Windows PowerShell example):

```powershell
node server/src/scripts/createTextbookManifest.js "D:\Textbooks"
```

This writes `textbook-manifest.csv` to the current folder. It includes only PDF paths relative to your textbook folder, file names and sizes. It does **not** copy, read, transmit or upload any PDF files. Fill in/verify `category` (`school` or `puc`), `schoolClass` (8–10 only) or `pucYear` (1–2), subject, title, language and usage rights. You can share the small CSV in ChatGPT to plan the Phase 7 import. Keep the originals locally.

**Copyright and permissions:** Upload textbooks to a public-facing app only if you have the rights or a license to provide them to users. Scanning the files locally and creating metadata does not itself grant publication rights.

### Class selection restriction (Phase 6 update)

Only Class 8, Class 9 and Class 10 are offered for School. PUC offers only 1st PUC and 2nd PUC, without a Science/Commerce stream step. Do not show Classes 1–7 or Engineering in the Student Library.

---

## Phase 8 — User Dashboard (current phase)

This cumulative project adds the protected Student Dashboard, persistent account-aware navbar and session verification, MongoDB-backed borrowing/peer/purchase/notification summary reads, borrowing history with issue-date-only countdown, profile editing and password changes with session revocation. No fake user activity was seeded. The dashboard is accessible at `#dashboard` after student login.

The authenticated administrator is shown an honest Phase 11 scope notice; admin management has **not** been implemented in this phase.

**Run:** `npm run install:all`, configure `server/.env` and `client/.env` (preserving your existing settings), start MongoDB, then run `npm run dev`. **Tests:** `npm test`. **Build:** `npm run build` after npm dependencies have been installed.

See [docs/PHASE-8-USER-DASHBOARD.md](docs/PHASE-8-USER-DASHBOARD.md) for exact PowerShell commands, all changed files, new API routes and database models, a complete manual testing checklist, test results, and limitations.

**Previous status (Phase 13 handoff):** The PDF importer and reader, Phase 9 automatic borrowing, Phase 10 Gmail/OTP, Phase 11 Admin Dashboard, and Phase 13 Peer Exchange have source implementations. Live database, email, photo upload, and frontend build testing must be completed locally. Phase 12 subject payments have now been added in the current update; Phase 14 broader notifications/search/reports and final integration remain pending.

## Phase 9 — Physical Borrowing (latest)

Phase 9 adds student borrow requests, atomic physical-stock reservations, actual loan issue/return records, return countdown and overdue status, one-time extension requests, and a restricted administrator **borrowing desk**. It retains the Phase 8 User Dashboard and the existing libraries and 3D homepage.

**Important:** Phase 9 requires a MongoDB replica set for transactional stock updates. A local standalone MongoDB server is not sufficient. Gmail borrowing confirmations are not yet implemented (Phase 10). The complete Admin Dashboard is not yet implemented (Phase 11). Real PDFs remain deferred.

See [`docs/PHASE-9-PHYSICAL-BORROWING.md`](docs/PHASE-9-PHYSICAL-BORROWING.md) for exact Windows PowerShell commands, API routes, replica-set setup, limitations and the step-by-step manual testing checklist. Use `npm run audit:stock` to inspect the integrity of your real inventory without modifying it.

## Student PDF integration (post–Phase 9; local files)

The latest ZIP includes the **Student Category PDF catalogue, authenticated reader, page position/history, and local CSV importer**, based on the supplied `data/Textbooks-Manifest.csv` (58 entries). It does **not** contain the 3.3-GB PDF documents, which remain on your Windows laptop. General Books remain physical-only. The reader becomes functional once you import the real files on the machine running the server:

```powershell
# From the OpenShelf root in VS Code; after npm run install:all and configuring .env
npm run pdf:check -- --root "D:\Library\Textbooks"
npm run pdf:import -- --root "D:\Library\Textbooks"
npm run dev
```

Ensure `TEXTBOOKS_ROOT=D:\Library\Textbooks` is set in `server/.env` and your original MongoDB replica-set configuration is preserved. **Read `docs/PHASE-7-STUDENT-PDF-INTEGRATION.md` first** for the complete setup, source correction notes, permission controls, API reference, limitations, and manual testing checklist. The current Phase 12 update changes Student PDF subject access to a verified ₹1-per-subject purchase. The new reader does not alter the Phase 9 borrowing workflow.

## Update — Automatic Borrowing + Three Copies Per General Book

The latest cumulative update adds automatic physical checkout (no administrator approval), a three-copy inventory migration, hidden public stock counts, honest expected-return countdowns on sold-out books, and a fresh Student PDF CSV title-mapping workflow.

**Read `docs/AUTO-BORROWING-THREE-COPIES-AND-PDF-TITLES.md` before running the inventory migration.** You must stop the website, back up MongoDB and run `npm run stock:set-three` (dry run), followed by `npm run stock:set-three -- --apply` once. Until this is run, existing books with zero stock will remain unavailable. Preserve your existing private `.env` files; this ZIP contains only examples. The configured administrator still records physical returns, but not approvals for new loans.

After renaming local PDF files, regenerate `data/Textbooks-Manifest.csv` via:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Generate-TextbooksManifest.ps1 -Root "D:\Library\Textbooks"
```

Review the optional `BookTitle` column before `npm run pdf:check` and `npm run pdf:import`. This does not alter the PDFs' internal content or metadata.

---

## Phase 10 — Gmail and forgot-password integration

**Current phase:** Gmail SMTP delivery, persistent email logs and retries, borrow and return confirmations, due/overdue reminders, and Forgot Password via a six-digit verification code and secure reset token. These features extend the previous automatic three-copy borrowing and Student Category PDF system; they do not rebuild it.

**New configuration (private `server/.env`):** `RESET_TOKEN_SECRET`, `EMAIL_JOBS_ENABLED`, `EMAIL_JOBS_INTERVAL_MINUTES`, plus `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS` and `EMAIL_FROM` for SMTP. Never put credentials in source code, the frontend, or ZIP downloads.

**Queue/reminder job:** `npm run email:process`. **Verification:** `npm test`, `npm run build`, then a real SMTP and MongoDB test on your Windows machine.

Read [`docs/PHASE-10-GMAIL-AND-PASSWORD-RESET.md`](docs/PHASE-10-GMAIL-AND-PASSWORD-RESET.md) for the exact install steps, the full feature list, the new routes/models, Gmail App Password setup, manual testing checklist, and known limitations.

## Historical Phase 12 (superseded) — Razorpay, SMS OTP and late fines

The linked [Phase 12 guide](docs/PHASE-12-RAZORPAY-SMS-AND-FINES.md) is retained for historical reference. At that historical phase, payments were disabled and PDFs free; the current edition instead enables ₹10 test-only subject checkout. SMS registration is also retired in favor of six-digit email OTP; see the latest setup guide at the top of this README. The current edition uses a flat ₹10 per overdue physical return, not a per-day charge.

## Phase 14 — In-app notifications, global search, reports

The homepage now includes **Search**, the User Dashboard provides a real notification inbox,
 and the Admin Dashboard includes expanded reports and in-app announcements.
Historical note: Razorpay was disabled in this phase; the current edition has test-only ₹10 subject checkout.
See `docs/PHASE-14-NOTIFICATIONS-SEARCH-REPORTS.md` for endpoints, settings and testing.
To check real due reminders without Gmail, run `npm run notifications:process` from the project root.


## Three-book physical borrowing limit (post Phase 14)

A student can borrow at most **3 physical books total** across General Books and Student Textbooks, not 3 per category. Both checkout routes enforce the same limit with MongoDB transactions. A fourth attempt returns HTTP 409; after an admin-recorded return, one slot is freed. Digital PDF access does not count as physical borrowing; eligible PDFs require a verified ₹10 test-mode subject purchase. No waiting-list feature was added. See [`docs/THREE-BOOK-BORROWING-LIMIT.md`](docs/THREE-BOOK-BORROWING-LIMIT.md) for implementation details and testing.


## Phase 2 — General Books catalogue (326 approved source records)

See [docs/PHASE-2-GENERAL-BOOKS-CATALOGUE.md](docs/PHASE-2-GENERAL-BOOKS-CATALOGUE.md).

After installing dependencies, verify the original supplied catalogue using `npm run catalogue:check`, then inspect proposed MongoDB changes with `npm run catalogue:preview`. Back up the database and stop OpenShelf before applying with `npm run catalogue:apply -- --confirm-archive`. Active borrowing conflicts stop the migration; no accounts, loans, or book records are deleted.


## Phase 3 — account/login reset (manual, preview-first)

The administrator email is `openshelfofficial01@gmail.com` in `server/.env`. To preview retiring old demo/student login credentials (without changing MongoDB), run `npm run accounts:preview` from the project root. After a verified database backup, zero active obligations and your explicit confirmation, follow `docs/PHASE-3-ACCOUNT-LOGIN-CLEANUP.md` to apply. Historical loan and payment references are preserved; this is not a database wipe.

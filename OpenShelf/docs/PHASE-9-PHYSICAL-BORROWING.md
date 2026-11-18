> **Update:** This document describes the original staff-approval workflow. The newest package supports **automatic checkout and three-copy inventory** instead. For current instructions see `AUTO-BORROWING-THREE-COPIES-AND-PDF-TITLES.md`. Historical pending requests can still be resolved by staff.

# OpenShelf — Phase 9: Physical Borrowing and Return Countdown

**Scope:** Phase 9 only. Built cumulatively from `OpenShelf-Phase-8-User-Dashboard.zip`.

Phase 7 PDFs remain deferred. Gmail borrow confirmations and password-reset OTP are **Phase 10**. Full Admin Dashboard is **Phase 11**; payment is Phase 12; peer-to-peer is Phase 13.

## Completed source features

- General Books detail modal: student-authenticated **Request to borrow** action; actual physical stock, availability and server errors; user-facing message that email **has not** been sent.
- Transactional request: authenticated user identity from JWT, Book `_id`, available-stock decrement and `Borrowing` creation in **one MongoDB transaction**. Unique partial index blocks multiple open requests for the same student/book.
- **Admin borrowing desk only**: real MongoDB list, filters, approve, reject, mark issued, mark returned. Confirmations prevent accidental false handover/return. Authorization enforced on backend.
- Rejection and return atomically restore one available copy. Repeated or illegal state changes return HTTP 409 and cannot double-return stock.
- Issue sets `issuedAt` and `dueAt`, using server-side `LOAN_DAYS` (default 14); a pending/approved request has **no countdown**.
- Overdue status is derived from stored issue/deadline timestamps; the same overdue status is shown to admin and student.
- Student may request **one** 7-day extension on an issued, open loan; admin approves/rejects it. Extension does not affect the due date until admin approves. Physical returns close any pending extension.
- Existing profile, navigation, 3D homepage and libraries preserved; no PDFs or invented books/users/loans introduced.
- Read-only `npm run audit:stock` checks `Book.totalCopies - openBorrowings == Book.availableCopies` and prints discrepancies without writing changes.

## Critical prerequisite: MongoDB replica set

Phase 9 requires MongoDB **multi-document transactions** to avoid corruption of physical stock if a request, rejection or return fails halfway. A standalone `mongod` does *not* support these transactions. **No unsafe nontransactional fallback is attempted.**

Use an existing MongoDB Atlas replica-set URI, or configure a single-node local replica set. If you already have important MongoDB data, **back up the database and `mongod.cfg` before changing your service**. Commands below are for a local development installation on Windows, not for a production cluster.

1. Open the installed MongoDB configuration file (often `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg`; find your exact path in Services → MongoDB → Properties). Add at top level:

   ```yaml
   replication:
     replSetName: rs0
   ```

2. Restart the installed MongoDB Windows service using PowerShell **as Administrator**:

   ```powershell
   Restart-Service MongoDB
   ```

3. Initialize it **only if this is a new replica set** using `mongosh`:

   ```powershell
   mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
   mongosh --eval 'rs.status().myState'
   ```

   A `myState` value of `1` indicates PRIMARY. If you already initialized a replica set, **do not rerun `rs.initiate`**. If you configured hostnames, authentication or nondefault ports, adjust the configuration to match your installation. For hosted Atlas, use your provided URI and do not run local replica-set commands.

4. In `server/.env`, use your real local MongoDB URI:

   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017/openshelf?replicaSet=rs0
   LOAN_DAYS=14
   ```

   Keep your existing account/email settings private; do not overwrite your JWT secret or bcrypt admin hash.

**Data migration caveat:** On startup, Phase 9 creates a unique index for open borrowings. If your database already contains duplicate open loans for the same user and book, MongoDB will reject the index. Resolve duplicates **carefully using the real records**; do not delete data blindly. Audit existing stock before taking live requests.

## Windows/VS Code install and run

Extract the cumulative ZIP. In VS Code choose **File → Open Folder → OpenShelf**. Open Terminal → New Terminal (PowerShell):

```powershell
npm run install:all
if (-not (Test-Path .\server\.env)) { Copy-Item .\server\.env.example .\server\.env }
if (-not (Test-Path .\client\.env)) { Copy-Item .\client\.env.example .\client\.env }
```

If you already have populated `.env` files, **do not replace them**. Add only `LOAN_DAYS` and any necessary replica-set connection changes. Ensure `server/.env` has `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `MONGODB_URI`, and `CLIENT_URL`, and `client/.env` has `VITE_API_URL=http://localhost:5000`.

```powershell
npm run dev
```

Open `http://localhost:5173`.

Check and test using another root terminal:

```powershell
npm test
npm run build
npm run audit:stock
```

The audit inspects **actual** General Book and borrowing records. It does not create demo books. Requests require a legitimate General Book document with `isAvailableForBorrow: true`, `totalCopies > 0`, and `availableCopies > 0`. Seed/admin inventory management is outside this phase; do not invent books to make screenshots look populated.

## Server API contract

All examples assume authenticated JWT in `Authorization: Bearer <token>`; emails cannot be impersonated from the request body.

### Student role

| Method | URL | Payload | Effect |
|---|---|---|---|
| POST | `/api/borrowings` | `{ "bookId": "<real Book ObjectId>" }` | Reserves one physical copy and creates `requested` record; HTTP 201, `emailStatus: not_integrated` |
| POST | `/api/borrowings/:id/extension-request` | `{}` | Requests an extension; due date unchanged until administrator approves |
| GET | `/api/dashboard/borrowings?page=1` | none | Only the authenticated student's borrowing history and extension status |
| GET | `/api/dashboard/overview` | none | Real user-specific counts and recent borrowing activity |

### Administrator role

| Method | URL | Payload | Effect |
|---|---|---|---|
| GET | `/api/admin/borrowings?status=all&page=1` | none | List requests, book and user references, dates and extension requests |
| POST | `/api/admin/borrowings/:id/actions/approve` | `{}` | `requested → approved` |
| POST | `/api/admin/borrowings/:id/actions/reject` | `{}` | `requested/approved → rejected`, restores inventory |
| POST | `/api/admin/borrowings/:id/actions/issue` | `{}` | `approved → borrowed`; saves `issuedAt` and `dueAt` |
| POST | `/api/admin/borrowings/:id/actions/return` | `{}` | `borrowed/overdue → returned`, restores inventory |
| POST | `/api/admin/borrowings/:id/extension` | `{ "decision": "approve" }` or `reject` | Resolves a pending extension; approval adds seven days |

Invalid ObjectIds are rejected (HTTP 400). Invalid/duplicate state transitions return HTTP 409. Unauthorized calls return 401 or 403. Missing transaction support returns 503.

## Manual testing checklist

- [ ] Verify login, registration, homepage, catalogue and Student Library remain unchanged.
- [ ] With a **real** physical General Book and stock available, log in as a student, open View details, request borrow. Confirm `requested` in **My Borrowed Books**; confirm no issue date/countdown and no false “email sent” message.
- [ ] Refresh; confirm the request persists and available stock decreased exactly once.
- [ ] Try a duplicate request; confirm HTTP 409, **no additional stock decrement**.
- [ ] Try a book with zero stock; confirm no borrowing record created.
- [ ] Sign in as configured admin. Only its user sees the Borrowing Desk. Approve the request; user sees `approved`, no countdown.
- [ ] Admin marks **issued** only after actual handover. Confirm issue timestamp and due date persisted in MongoDB and countdown starts.
- [ ] User requests a 7-day extension; admin approves; due date changes only on approval.
- [ ] Verify overdue status using a genuinely past due date in a test copy of your database, not by falsifying live records.
- [ ] Admin marks book **returned** after physical return. Confirm countdown ends, stock is restored exactly once, and subsequent return attempts fail with 409.
- [ ] Admin rejects a different eligible `requested`/`approved` record. Confirm available stock restored.
- [ ] Confirm a normal user cannot call `/api/admin/borrowings` (HTTP 403), and anonymous users cannot borrow (HTTP 401).
- [ ] Test overlapping requests for the same last copy; at most one is accepted. Run `npm run audit:stock` afterward; inspect any warnings.
- [ ] Confirm no PDF action was introduced under General Books and no peer-to-peer or payments were activated.
- [ ] Test responsive layouts and browser console.

## Status and limitations

Source implementation is present. Pure logic tests and static syntax checks can run without npm dependencies or a database. **A successful deployed end-to-end run is not claimed:** this build environment has no local MongoDB server, no `node_modules`, and no real catalogue, user accounts or SMTP credentials. Run `npm run install:all`, `npm run build` and the manual checklist on your own setup.

**Gmail and return reminders are still NOT integrated.** A saved borrowing request is persisted, but no borrow email is sent. Phase 10 must add real email delivery with failure logs/retries. Full Admin Dashboard remains Phase 11. Never treat this phase as final production approval until MongoDB transaction/inventory tests pass locally.

## Created/modified files

### Created
- `server/src/services/borrowingRules.js`
- `server/src/services/borrowingService.js`
- `server/src/controllers/borrowingController.js`
- `server/src/routes/borrowingRoutes.js`
- `server/src/routes/adminBorrowingRoutes.js`
- `server/src/scripts/auditBorrowingStock.js`
- `server/src/tests/borrowingRules.test.js`
- `client/src/components/admin/AdminBorrowingDesk.jsx`
- `docs/PHASE-9-PHYSICAL-BORROWING.md`

### Modified
- `server/src/models/Borrowing.js`
- `server/src/config/database.js`
- `server/src/app.js`
- `server/src/controllers/bookController.js`
- `server/src/controllers/dashboardController.js`
- `server/.env.example`
- `server/package.json`, `package.json`
- `client/src/pages/GeneralBooks.jsx`
- `client/src/pages/UserDashboard.jsx`
- `client/src/pages/AdminPhaseNotice.jsx`
- `client/src/styles/index.css`
- `README.md`

No `.env` secrets, PDFs, fake catalogue records or fabricated SMTP results are included.

# OpenShelf — Phase 8 implementation report

**Scope:** User Dashboard only. Phase 7 remains deferred. No borrowing, payments, PDF import, Gmail workflow, administrator CRUD, or peer-to-peer transactions have been activated.

## Source inspection

The uploaded Phase 6 source has a React/Vite frontend with Tailwind, Framer Motion and React Three Fiber, an Express API, MongoDB/Mongoose `User` and physical `Book` models, JWT login/registration, General Books browsing, and School Class 8–10 / 1st–2nd PUC selection pages. Login previously stored a token and changed the URL fragment, but no page rendered for the dashboard fragment. No borrowing, payment, notification, or peer-to-peer models were present in this ZIP.

## Phase 8 delivered

- Real, JWT-protected Student Dashboard, authenticated navbar state, and student-only backend routes.
- Responsive dashboard sidebar with navigation covering the requested 16 sections and logout.
- Database-backed summary and recent borrowing activity, with truthful zero/empty/error states.
- Read-only borrowing history including title, author, requested/approved/issued/due/returned timestamps, status, pagination and a countdown **only after issue**.
- Read-only recent notifications and unread notification count. Creating/marking notifications read is Phase 14.
- Profile view/edit (full name only); registered Gmail and role are read-only.
- Change-password form checking the current password; bcrypt rehash and revocation of other student JWT sessions using `sessionVersion`.
- Administrator login still works; a clearly marked Phase 11 waiting screen is shown rather than exposing a fake admin dashboard.
- Phase 7, 9, 10, 12, 13 and 14 sections have honest planning/empty states. They do not perform the later-phase actions.
- Added dashboard data models as read-only foundations. **No example records are seeded.**
- Pure-unit tests for overdue rules and frontend deadline formatting.
- Formatting conventions (`.editorconfig` and `.prettierrc.json`) and an ESLint configuration. Formatting and lint checks must still be run locally after installing the tools.

## Read-only dashboard collections

`Borrowing`, `Purchase`, `PeerBookListing`, `ExchangeRequest`, and `Notification` models are schema foundations for future phases. All dashboard records are filtered with the **authenticated account ID obtained on the server**, not a user ID supplied by the browser. Existing unrelated collections/data are not imported or deleted.

**Counting semantics:**

- Total borrowed: persisted `borrowed`, `returned`, or `overdue` borrowing records with an actual issue date.
- Currently borrowed: issued and unreturned books in `borrowed` or `overdue` status.
- Pending requests: borrowing records with `requested` status.
- Overdue: issued and unreturned borrowings with stored `overdue` status, or `borrowed` with passed due date.
- Due soon: issued, unreturned `borrowed` records due within 72 hours.
- Purchased books: completed purchase records only.
- My listed books: peer listings owned by the account, excluding removed listings.
- Active exchange requests: pending or accepted exchange records where the user is owner or requester.
- Unread notifications: account notifications with `readAt: null`.

These counts will be zero when the database has no records. They do not imply that later-phase action endpoints already exist.

## API endpoints

All routes below require a valid bearer JWT and the `student` role, and the account must be active:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/dashboard/overview` | Account-specific metrics, five recent borrowing activities, five recent notifications |
| GET | `/api/dashboard/borrowings?page=1` | Paginated borrowed-book history, 10 results/page |
| GET | `/api/dashboard/profile` | Authenticated account's safe profile |
| PATCH | `/api/dashboard/profile` | Update full name only (`{ "fullName": "..." }`) |
| POST | `/api/dashboard/change-password` | Verify current password, hash new password, invalidate existing student tokens |

The unchanged `GET /api/auth/me` route is used to verify a stored JWT on initial page load. The JWT authentication middleware now checks account existence, active state, token issuer, and token session version. It also validates the configured admin identity before assigning administrator access.

## New and changed files

**Created**

- `client/src/context/AuthContext.jsx`
- `client/src/pages/UserDashboard.jsx`
- `client/src/pages/AdminPhaseNotice.jsx`
- `client/src/components/dashboard/BorrowingStatus.jsx`
- `client/src/utils/timeRemaining.js`
- `client/src/utils/timeRemaining.test.js`
- `server/src/controllers/dashboardController.js`
- `server/src/routes/dashboardRoutes.js`
- `server/src/services/dashboardMetrics.js`
- `server/src/models/Borrowing.js`
- `server/src/models/Purchase.js`
- `server/src/models/PeerBookListing.js`
- `server/src/models/ExchangeRequest.js`
- `server/src/models/Notification.js`
- `server/src/tests/dashboardMetrics.test.js`
- `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`
- `docs/PHASE-8-USER-DASHBOARD.md`

**Modified**

- `client/src/App.jsx`
- `client/src/main.jsx`
- `client/src/components/auth/AuthModal.jsx`
- `client/src/styles/index.css`
- `server/src/app.js`
- `server/src/controllers/authController.js`
- `server/src/middleware/auth.js`
- `server/src/models/User.js`
- `package.json`
- `server/package.json`
- `README.md`

## Windows PowerShell — install and run

Open the `OpenShelf` directory, the folder containing the root `package.json`, in VS Code and open **Terminal → New Terminal**.

```powershell
node --version
npm --version
npm run install:all
```

Use the existing `.env` files if you already have them. If this is a fresh copy, create them:

```powershell
Copy-Item .\server\.env.example .\server\.env
Copy-Item .\client\.env.example .\client\.env
```

Edit `server/.env` privately to set `MONGODB_URI` and a random `JWT_SECRET` with at least 32 characters. Keep any previously configured admin and email values. The client `.env` should have `VITE_API_URL=http://localhost:5000`.

```powershell
npm run dev
```

Visit `http://localhost:5173`. Log in with a registered *student* account and open **My dashboard**. Admin sign-in leads to a Phase 11 scope notice, because administrator management is not part of Phase 8.

```powershell
# From the OpenShelf root, in another terminal:
npm test
npm run build
```

### Configuring administrator credentials (for existing Phase 4 authentication)

```powershell
cd .\server
npm run hash-password -- "ChooseYourStrongAdminPassword"
cd ..
```

Paste the generated bcrypt hash into `ADMIN_PASSWORD_HASH` in `server/.env` and set `ADMIN_EMAIL`. Do not publish the password, hash, or `.env`.

### Optional source format and ESLint checks

Configuration files are provided. Once npm can download packages, from the project root:

```powershell
npm install --save-dev eslint prettier
npx eslint client/src server/src
npx prettier --check "client/src/**/*.{js,jsx}" "server/src/**/*.js"
```

Formatting and lint tooling were **not installed or run** in the assembly environment because npm package downloads were unavailable. Older compact source files may not yet meet the new Prettier conventions.

## Manual testing checklist

- [ ] Start MongoDB; confirm `http://localhost:5000/api/health` responds.
- [ ] Register or log in using a real student account; check `#dashboard` renders and greeting/profile contain the correct student's name and email.
- [ ] Refresh the dashboard; the stored token must be verified through `/api/auth/me` and the account must remain correctly scoped.
- [ ] Log out; dashboard data must disappear, and visiting `#dashboard` must require login.
- [ ] Sign in with another student; verify they cannot see the previous student's records.
- [ ] Check an empty account: overview metrics show zeros; borrowed books and recent activity display empty states, never fake books.
- [ ] Open General Books and Student Category from the sidebar; use Home and Dashboard navigation.
- [ ] Edit full name; refresh and verify the saved name is loaded from MongoDB.
- [ ] Attempt to change the name to an empty/1-character value; confirm validation error.
- [ ] Verify registered email and role are not editable from the profile UI or PATCH API.
- [ ] Change the password with a wrong current password; expect an error and no change.
- [ ] Change the password with the correct old password and confirmation; all prior student JWTs must become invalid; log in with the new password.
- [ ] Try student dashboard APIs with no token (401), with an admin token (403), and with a valid student token (200).
- [ ] Compare `GET /api/dashboard/overview` with MongoDB data if real borrowing records already exist. Verify a pending request has no return countdown.
- [ ] Check a narrow mobile layout; open the sidebar, browse nav, close it, and log out. Check homepage mobile login/dashboard/logout menu.
- [ ] Test backend failure; dashboard should report a real error, not invented counts.
- [ ] Run `npm test` and `npm run build` locally after installing packages.

## Automated checks performed in this environment

- **PASS:** 10 Node built-in unit tests (`npm test`), 0 failures.
- **PASS:** `node --check` for all server JavaScript files.
- **PASS:** Syntax parsing of all JS and JSX source files through the available TypeScript compiler, 0 parser diagnostics.
- **NOT RUN:** Vite production build; the npm dependency installation could not complete because packages were not cached and external downloads were unavailable.
- **NOT RUN:** MongoDB-connected end-to-end testing; no local running application database/dependency installation was available.
- **NOT RUN:** Prettier/ESLint command execution; their npm packages were not available.

## Remaining issues / explicitly deferred work

1. General Books still uses the older provisional set of genre labels. It does **not** match the 32 exact names in the master prompt; this needs a scoped correction in a later approved phase.
2. The actual catalogue dataset is not embedded in the uploaded ZIP. Dashboard and catalogue views need your real MongoDB data.
3. The app retains its original localStorage JWT design. Secure HttpOnly cookie sessions and a full deployment audit remain Phase 15 work.
4. Borrow/return/extension actions, Gmail delivery and forgot-password OTP, purchases and Razorpay, peer-to-peer owner/listing/exchange workflows, and notification mutation are **not** implemented here.
5. Admin management is still Phase 11; the admin placeholder does not simulate any admin data.
6. PDF import and textbook reading remain Phase 7, deferred until explicitly approved. No PDFs or payment gates were added.
7. Frontend build and full live-browser/API integration still need testing on your laptop after dependencies are installed.

**Stop point:** Phase 8 has been implemented in source and unit-checked; await explicit approval before Phase 9.

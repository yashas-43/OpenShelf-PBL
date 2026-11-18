# OpenShelf — Phase 15: Security, Testing and Bug Fixes

## Scope and preservation

This phase **continues the Phase 3 account-cleanup source** and preserves the completed 326-book catalogue, free School/PUC PDFs, student and administrator dashboards, 3-book cap shared across both physical catalogues, peer-to-peer exchange, Gmail-only registration OTP, automatic checkout, student return requests, ₹10/day overdue fines, and Phase 14 notifications/search/reports.

**Razorpay and its webhooks stay disabled.** The Phase 3 account retirement operation stays **preview-only by default**; no credentials, historical borrowing records, textbook files, or MongoDB documents are deleted or migrated by this ZIP.

## Changes made

1. `server/src/services/startupSecurity.js` (new): Checks MongoDB URI, sufficiently long JWT secret, exact administrator identity, bcrypt-format hash. Production additionally requires independent strong reset/registration secrets and an HTTPS frontend origin. Errors do not echo raw secrets.
2. `server/src/controllers/authController.js`: Administrator JWTs include a signature-bound fingerprint of the current administrator password hash. Changing `ADMIN_PASSWORD_HASH` invalidates older admin JWTs.
3. `server/src/middleware/auth.js`: Rechecks the fingerprint on every administrator API request; student sessions still use stored `sessionVersion` and account status.
4. `server/src/config/database.js`: Ensures indexes exist for **both** physical borrowing collections and for users, email OTP challenges, password resets, and exchange requests. Starts the API only if the safety indexes can be initialized. Existing duplicate/conflicting data may require **review and backup**, not automatic deletion.
5. `server/src/server.js`: Runs configuration validation before connecting to MongoDB or accepting requests.
6. `server/src/app.js`: Adds no-store headers for API responses, safe 400/409 handling of Mongoose validation/duplicate-key errors, and structured error logging that does not print private payloads.
7. `server/src/controllers/bookController.js`: Bounds pagination and filters and rejects invalid book IDs before querying MongoDB.
8. `client/src/App.jsx` and `client/src/styles/index.css`: Better reduced-motion behavior for animated hero content and CSS transitions, while preserving existing design.
9. `scripts/verifySourceImports.mjs` (new): Dependency-free static audit for missing relative files and missing **default exports** such as the earlier `peerExchangeRoutes.js` crash.
10. `scripts/smokeApi.mjs` (new): **Read-only**, localhost-only smoke checks of health/MongoDB, public catalogues, authorization boundaries, PDF ticket protection, search validation, and disabled payments.
11. `scripts/verifySourceImports.test.mjs`, `scripts/smokeApi.test.mjs`, and `server/src/tests/phase15Security.test.js` (new): Deterministic security/preflight and smoke-check unit tests.
12. `package.json`, `server/.env.example`, `README.md`: Commands and safe setup documentation.

## Before starting (Windows / VS Code)

1. Extract the ZIP and open the **inner `OpenShelf` folder** in VS Code.
2. Copy your private `server/.env` and `client/.env` from your working version. **Never share or commit them.**
3. In `server/.env`, ensure `ADMIN_EMAIL=openshelfofficial01@gmail.com` and `ADMIN_PASSWORD_HASH` is your real bcrypt hash; `JWT_SECRET` is a securely generated secret of at least 32 characters. For production also set separate OTP and reset secrets, plus the real HTTPS frontend origin.
4. Back up MongoDB before this version's first startup. Starting the backend will try to ensure unique indexes exist; it will **fail safely** if previous data violates a constraint.
5. Check MongoDB Compass: `rs.status().myState` should return `1`. Preserve the existing `openshelf` database. `TEXTBOOKS_ROOT` must point to the real local PDFs.

```powershell
node -v
npm -v
npm run install:all
npm run verify:imports
npm test
npm run build
npm run dev
```

The API is normally `http://localhost:5000/api/health` and the frontend `http://localhost:5173`.

In a second VS Code terminal, while **both** the API and MongoDB are running:

```powershell
npm run smoke:api
```

This smoke test sends **GET requests only**, doesn't read credentials, and doesn't create loans or change any data. It refuses to target an external public website.

## Manual integration checklist — necessary on your laptop

**Identity and admin:** Register with a new email and the correct six-digit Gmail OTP; reject wrong, reused, and expired codes. Sign in with email/password. Confirm a disabled student's old JWT fails. Test Forgot Password, reset the password, and verify previous sessions no longer work. Sign in as the configured administrator; change the admin bcrypt hash in `.env`, restart the backend, and verify the old admin JWT no longer grants admin access.

**Physical borrowing:** With real stock confirmed, borrow three books across General Books and Student Textbooks. The fourth must fail without lowering inventory. A student must never be able to return another student's loan. Student Return Book sends a request; stock is restored only after administrator confirms physical receipt. Validate due dates, extensions, overdue estimates, and ₹10 per started day, including time-zone boundaries.

**General Books catalogue:** Run the 326-book catalogue preview/import only after backup. Verify titles/authors across genres, shared OpenShelf cover, no duplicate visible cards, search and sorting, and preservation of existing loan IDs and stock. Audit visibility of archived book records.

**PDF privacy and access:** Run `npm run pdf:check -- --root "D:\Library\Textbooks"`, and only if needed run `pdf:import`. Test Class 8 single- and two-part PDFs, remaining four levels, reading history, direct link without a valid ticket (must fail), disabled account, path traversal, and production copyright-permission checks. **PDF uploads and direct file access must remain unavailable for General Books.**

**Peer exchange and notifications:** Publish a listing, request it from another account, verify ownership checks on edits and messages, opt out of contact-Gmail sharing, complete an exchange, and test moderation. Test unread counts, mark-as-read, announcements and automatic due notifications.

**Payments:** Confirm `/api/payments/*` responds `410 PAYMENTS_DISABLED` and no payment button is shown. Student Category PDFs remain free after login.

**Accessibility / quality:** Test keyboard navigation and focus rings, mobile and tablet widths, reduced-motion settings, empty states, error messages, and the full Vite production build.

## Verification performed in the development workspace

- `npm test`: **128 tests passed** (13 new Phase 15 tests + 111 backend regression tests + 4 frontend utility tests).
- `npm run verify:imports`: **144 source files checked**, zero missing-import/default-export errors.
- `node --check`: **117 backend/root JavaScript files checked**, zero syntax errors.
- CSS parser: parsed successfully.
- ZIP integrity and baseline file preservation: checked during packaging.

**Limitations:** The development container does not have the project's frontend dependencies installed. `npm run build` therefore cannot complete here (`vite: not found`). MongoDB, real Gmail delivery, physical inventory, and your `D:\Library\Textbooks` files are on your laptop, so none of their live integration tests is claimed as passed. Run these checks on Windows before calling the website production ready.

## Known remaining work (Phase 16 preparation)

- Verify the full Vite production build and real browser functionality after local dependency installation.
- Complete real MongoDB transactions and index tests with backed-up data.
- Test genuine Gmail SMTP, reading permissions and authorized PDF uploads.
- For public deployment, design a production-grade authentication-cookie/CSRF model and strengthen operations (HTTPS, backups, CSP, incident logging, secrets rotation, monitoring). The current frontend uses browser localStorage for JWTs; **never deploy with untrusted script injection**.
- Deploy a publicly reachable backend/database/storage if OpenShelf will be used beyond the local machine. Local `D:` drive PDFs and MongoDB cannot be reached by remote website users.

Stop after Phase 15. Phase 16 requires the user's approval.

# OpenShelf — Phase 10: Gmail notifications and password recovery

## Scope

This is a **cumulative** OpenShelf source update. It retains the 3D website, General Books library, student PDF reader and local PDF import, three-copy automatic checkout, inventory transactions, and user dashboard. **Phase 11 admin-dashboard redesign, Phase 12 payments, Phase 13 peer-to-peer exchange, and Phase 14 in-app notification center are not implemented here.**

### Added and implemented in Phase 10

- Registration email delivery (existing feature upgraded to use the persistent email outbox).
- Automatic physical book checkout confirmation, recording the actual due deadline. No admin approval is needed to checkout, consistent with the previous borrowing update.
- Email events on legacy borrowing approval, rejection, issue, return, and extension approval/rejection. Actual email delivery is handled after the corresponding database operation commits.
- Recurring **due within 48 hours** and **overdue** reminder generation based on real, active MongoDB loan records. Dates are calculated from the stored `dueAt` value, never from a fabricated loan.
- Persistent `EmailLog` records with `pending`, `not_configured`, `sending`, `sent`, and `failed` statuses, attempt counts, retry delays and SMTP acceptance details.
- A bounded outbox-retry worker (`npm run email:process`) and an optional periodic worker while the API runs (`EMAIL_JOBS_ENABLED=true`).
- Forgot-password flow: request code → verify code → create new password. Six-digit CSPRNG code, HMAC hash in database, 10-minute expiry, five attempts, 60-second resend cooldown, per-IP rate limits, single-use cryptographic reset token, bcrypt password hash, and invalidation of earlier user JWT sessions.
- A confirmation email after password changes through both the reset flow and User Dashboard profile settings.
- Login-modal UI for Forgot Password, verification, resend and new password.

### Not yet implemented

- Production-confirmed Gmail deliveries (require your Gmail app credentials and a test on your Windows machine).
- Password resets for the server-configured **administrator**. The admin's hash is stored in `server/.env`, not in MongoDB. To change this password, generate a new bcrypt hash and update the environment variable; do not use the student forgot-password form.
- Purchase/payment email notifications until actual verified payment workflows exist in Phase 12.
- Peer-to-peer inquiry emails until the Phase 13 consent and ownership workflow exists.
- Always-on scheduled reminders when the API is stopped. To send reminders while the app is down, run the CLI from Windows Task Scheduler on a running server with access to MongoDB.
- Integration test results for your Gmail account or MongoDB; no credentials or live database are available inside the artifact-building environment.

## 1. Extract the ZIP and preserve private configuration

Unzip the cumulative package and open the inner `OpenShelf` folder in VS Code. Copy your **private, locally configured** `server/.env` and `client/.env` from the previously working OpenShelf project into the new one. They are intentionally NOT included in ZIP. Do not replace your current JWT secret, admin Gmail, password hash or MongoDB settings.

In the VS Code PowerShell terminal, from the root directory containing `package.json`:

```powershell
node -v
npm -v
npm run install:all
```

Your MongoDB must already be PRIMARY in a replica set, as required by borrowing and the PDF importer. Verify in Compass Shell:

```javascript
rs.status().myState  // 1 = PRIMARY
```

## 2. Gmail SMTP settings

Set these values in **`server/.env`** (use your actual Gmail account and Google App Password, NOT your normal Gmail password):

```dotenv
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your_private_16_character_google_app_password
EMAIL_FROM=OpenShelf <yourgmail@gmail.com>
```

Your Gmail account generally needs two-step verification enabled before you can generate a Google App Password. Google's account policies may restrict this option for some accounts. Do not send your Google App Password, `.env`, reset tokens, or generated JWT secret in ChatGPT or project ZIP files. If Gmail rejects app-password SMTP, use an appropriately configured SMTP provider instead; no simulated email delivery is provided.

Create a **separate random secret** for reset-code/token HMACs:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy it into:

```dotenv
RESET_TOKEN_SECRET=your_private_new_random_secret
EMAIL_JOBS_ENABLED=true
EMAIL_JOBS_INTERVAL_MINUTES=60
```

`RESET_TOKEN_SECRET` falls back to `JWT_SECRET` for local compatibility but a separate secret is recommended. Changing the reset secret invalidates unused verification/reset tokens; changing the JWT secret invalidates all sessions.

Important: `ADMIN_EMAIL` is for backend administrator login; `EMAIL_USER` selects the SMTP account. They can be the same, but neither is a substitute for `EMAIL_PASS`.

## 3. Start the website

```powershell
npm run dev
```

Website: `http://localhost:5173` — API health: `http://localhost:5000/api/health`.

### Test real Gmail delivery

1. Register a **new** student using an email inbox you control. The API responds with `emailStatus`, and `EmailLog` records SMTP status. The browser automatically enters the student dashboard; check the inbox and spam folder.
2. Sign in with a student account. Borrow an available General Book. The checkout is immediately persisted; the response states whether SMTP accepted the borrowing email. Borrowing still succeeds if the email fails. Verify `EmailLog` in Compass.
3. Sign out and open **Log in → Forgot password?**. Enter the same registered email. A generic response is returned even for unknown emails. Read the genuine six-digit code from your inbox, verify it, choose a new password and log in. Previously issued student JWT tokens must no longer work.
4. Try an incorrect code and confirm it cannot be used after 5 attempts. Wait at least 60 seconds before requesting a new code. Do not paste real codes in screenshots.
5. As the administrator, mark a borrowed book returned, and confirm an email log is created and sending is attempted.
6. Use the dashboard to change a student's password and check the security email and session invalidation.

### Status meanings

- `sent`: the SMTP server **accepted** the message for the intended recipient; this cannot guarantee placement in the recipient's inbox.
- `pending`: message queued in MongoDB, not yet attempted.
- `not_configured`: SMTP values missing. Email **was not sent**.
- `failed`: SMTP or provider failure. A retry may be attempted, up to the configured limit.
- `sending`: a worker has claimed the record. A stale record is retried after a 15-minute lease.

**OTP code deliveries are deliberately not eligible for generic outbox retry**. The code is never saved in plaintext. Users must request a new code if SMTP delivery failed.

## 4. Process emails and reminders

To run the email/reminder queue manually:

```powershell
npm run email:process
```

The command examines active due/overdue loans, stores any unique new reminders, and attempts a bounded batch of queued/failed email. By default an API job is disabled for backward compatibility; set `EMAIL_JOBS_ENABLED=true` to run once at startup and then every `EMAIL_JOBS_INTERVAL_MINUTES` while the API is running.

For unattended use on Windows, configure a Windows Task Scheduler task to run `npm run email:process` **from the root OpenShelf directory**, while MongoDB and the project server dependencies are accessible, using a private account authorized to read `server/.env`. Do not run multiple overlapping scheduled workers. The code provides **at-least-once** delivery semantics: a process crash after SMTP acceptance but before the database is updated can lead to an occasional duplicate email; it cannot provide exactly-once end-to-end email delivery.

## 5. Developer-oriented API reference

All endpoints below are public and individually rate-limited; email identity comes from MongoDB.

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/password/forgot` | `{ email }`; returns a **generic** 202 response. Does not expose account existence. |
| `POST /api/auth/password/verify` | `{ email, code }`; returns a short-lived `resetToken` only after a valid OTP. |
| `POST /api/auth/password/reset` | `{ email, resetToken, newPassword, confirmPassword }`; consumes token, hashes password, increments `sessionVersion`. |
| `POST /api/auth/register` | Creates an account and attempts a logged registration email. |
| `POST /api/borrowings` | Transactional immediate checkout and queued/attempted email after commit. |
| `POST /api/admin/borrowings/:id/actions/return` | Return and logged email event after commit. |

Database collections created: `emaillogs` and `passwordresetcodes`. The latter automatically expires old challenges via a TTL index (MongoDB's TTL cleanup is not immediate; API expiry checks are authoritative).

## 6. Automated checks and known constraints

```powershell
npm test
npm run build
npm run audit:stock
```

The source-level test suite checks email escaping, required template types, six-digit OTP format, keyed hashes, and borrowing rules. The session-invalidation workflow is implemented but still needs a live database integration test. Live API, SMTP and MongoDB transaction tests must be performed on your laptop.

**Known limitations and considerations:**

- Login tokens currently use browser localStorage inherited from earlier phases; Phase 15 should review XSS hardening and session-cookie design.
- Generic reset requests avoid explicit account enumeration, although email send timings can vary; production deployments should also review timing side channels and anti-abuse policies.
- Notification retries are at least once. If SMTP accepted a message but the process failed before storing the acceptance, a retry could duplicate that email.
- Reset-code delivery is not retried because the system intentionally does not persist the plaintext code.
- A server-configured admin account cannot use the user-document reset system. Changing the admin password remains a local server configuration operation.
- Optional reminder jobs only run while the API process is up; use Task Scheduler for reliable host-level scheduling.
- Existing physical loan policy starts the loan when Borrow is clicked (no physical-handover verification). This behavior was requested in the previous phase and is intentionally preserved here.

## 7. Exact file change log for teacher review

**Created (12):**

- `docs/PHASE-10-GMAIL-AND-PASSWORD-RESET.md`
- `server/src/controllers/passwordResetController.js`
- `server/src/models/EmailLog.js`
- `server/src/models/PasswordResetCode.js`
- `server/src/scripts/processEmails.js`
- `server/src/services/borrowEmailNotifications.js`
- `server/src/services/emailEventKeys.js`
- `server/src/services/emailTemplates.js`
- `server/src/services/passwordResetRules.js`
- `server/src/services/passwordResetService.js`
- `server/src/services/reminderService.js`
- `server/src/tests/phase10Security.test.js`

**Modified (16):**

- `README.md`
- `client/src/components/admin/AdminBorrowingDesk.jsx`
- `client/src/components/auth/AuthModal.jsx`
- `client/src/pages/GeneralBooks.jsx`
- `client/src/pages/UserDashboard.jsx`
- `client/src/styles/index.css`
- `package.json`
- `server/.env.example`
- `server/package.json`
- `server/src/controllers/authController.js`
- `server/src/controllers/borrowingController.js`
- `server/src/controllers/dashboardController.js`
- `server/src/routes/authRoutes.js`
- `server/src/server.js`
- `server/src/services/borrowingService.js`
- `server/src/services/emailService.js`

**Preservation:** all 92 files in the prior `OpenShelf-Updated-Textbook-Names-And-Parts.zip` remain present. Nothing from the previous project was deleted. There are no `.env` secrets or textbook PDF contents in the deliverable.

**Artifact-build validation:** 40/40 automated tests passed (36 server + 4 client utilities); all JavaScript and JSX source files parsed; CSS and relative imports parsed/validated; no live SMTP or MongoDB test available. A Vite build attempt failed at `vite: not found` because the required npm packages were not installed in the artifact environment. Run `npm run install:all` followed by `npm run build` on Windows before production use.

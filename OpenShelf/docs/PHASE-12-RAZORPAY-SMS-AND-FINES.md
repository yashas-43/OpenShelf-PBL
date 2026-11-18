# OpenShelf — Phase 12: Razorpay Subject Purchases, Phone OTP, and Overdue Fines

## Scope, retained features

This is a cumulative update to the Phase 13 archive, incorporating Phase 12 after Phase 13 by the user's explicit request. Preserve the 3D homepage, default General Book cover, MongoDB catalogues, dashboards, borrowing (automatic checkout), Gmail password recovery, admin management, and peer exchanges. No General Book or peer-exchange PDF attachments are added.

## New behavior

### Subject PDF price and entitlements

- **Default ₹1 (100 paise) per subject and class/PUC year.** `StudentTextbook.pricePaise` is the authoritative backend price; existing imported records use the Mongoose default / API fallback of 100 paise.
- One verified `Purchase` for `user + student_textbook ID` unlocks every current and future PDF part under that specific subject. The entitlement survives sign-out and subsequent sign-ins with the same registered email because access is tied to its immutable database user ID.
- A purchase of Class 8 English **does not** unlock Class 9 English. A second part of Class 8 English **does not** require a second payment.
- A paid entitlement is not inferred from a frontend button press, a returned Checkout signature alone, or a mock response. The backend verifies the HMAC Checkout signature, fetches payment and order records from Razorpay, requires captured payment and paid order with the recorded amount/currency, and transactionally persists `Payment` and `Purchase`.
- `payment.captured` and `order.paid` webhooks verify HMAC against the **exact raw request body** before Razorpay API reconciliation. Duplicate callbacks are idempotent. Webhooks should be configured at `POST https://YOUR_PUBLIC_SERVER/api/payments/webhook` with the matching secret; `localhost` cannot receive public webhooks directly.
- Only the safe public Razorpay **key ID** reaches the browser. Never expose the key secret or webhook secret.
- Student PDF routes and streaming verify ownership on the backend; the streaming ticket alone cannot bypass payment. Admins may open published authorized files for maintenance.
- The importer does **not** rename or remove PDF files. Their original local paths remain under `TEXTBOOKS_ROOT`.
- The admin may edit Student subject price under **Admin Dashboard → Student PDFs → Change price**. Previous purchases remain unlocked; a price change applies to future orders. The already-existing admin General Book editor supports title-level selling price and total physical stock changes, while protecting active loans.
- General Books remain physical-only. This phase's checkout covers Student Category subjects, **not** general physical book sales, overdue fine payments, or peer exchanges.

### Phone verification during account creation

- New student registration asks for name, unique email, ten-digit Indian mobile number, password, confirmation. Mobile must start with 6, 7, 8, or 9; it is **not unique**, and distinct email accounts may share the same phone.
- Login remains email + password only. Public registration cannot create an admin.
- `/api/auth/register/start` sends a real four-digit SMS code through Twilio Programmable Messaging after validating fields; `/api/auth/register/verify-phone` verifies it and only then creates the user. Previous `POST /api/auth/register` is intentionally retired to prevent bypassing phone verification.
- Code expiry: **5 minutes**, four verification attempts, resend cooldown 60 seconds, short-lived hashed OTP challenge with MongoDB TTL, rate limiting; no code is written to logs or returned in HTTP responses.
- **Critical provider dependency:** Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM`, and a long random `REGISTRATION_OTP_SECRET`. Without them, *new registrations fail explicitly with HTTP 503* rather than receiving a pretend SMS. Configure India SMS delivery/DLT where required by the provider/carriers. Provider acceptance does not guarantee delivery to the handset.
- Existing users may still log in without a newly verified number; they will appear as `Not provided (older account)` in admin records. There is no forced migration, no fabricated phone numbers.
- Administrators see registered phone numbers only through admin-protected APIs in Users → Search and Borrowing Desk. They can search registered names and inspect loan history.

### Overdue fines

- **₹10 for every started 24-hour period after the actual MongoDB `dueAt` timestamp.** At exactly due time: ₹0; one second overdue: ₹10; more than 24 hours overdue: ₹20.
- Active overdue loans calculate a current amount from `dueAt` and the current time; on verified return, `fineAssessedPaise` freezes the fine on the borrowing record. `finePaidPaise` is reserved for a future audited settlement workflow, and starts at zero.
- Dashboard shows live accrued amount and outstanding balance. Admin borrowing views and reports show actual user, phone, loan, due date, and fine. **Fines are not automatically debited** through Razorpay in this phase.
- Return-date extensions affect the actual stored due date. This policy uses the final deadline to calculate outstanding fine; future policy changes should address retroactive fine handling explicitly.

## Setup on Windows / VS Code

1. Back up your actual MongoDB database. Extract this ZIP and open the inner `OpenShelf` folder in VS Code.
2. Copy your private `server/.env` and `client/.env` from the previous working installation. Never copy secrets into the ZIP, Git, screenshots or this chat.
3. Run `npm run install:all` from the OpenShelf root.
4. Make sure MongoDB is running as a replica-set PRIMARY; in Compass Shell: `rs.status().myState` should return `1`. Use the existing `MONGODB_URI` and `TEXTBOOKS_ROOT` settings.
5. In `server/.env`, add **real test-mode** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Add real Twilio SMS credentials, sender/service and `REGISTRATION_OTP_SECRET`. Example placeholders are in `server/.env.example`.
6. Generate a new OTP secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. **Rotate your JWT secret if it appeared in a screenshot.**
7. `npm test`; `npm run build`; `npm run dev`.
8. Website: `http://localhost:5173`; backend health: `http://localhost:5000/api/health`.
9. Check your real PDF collection: `npm run pdf:check -- --root "D:\Library\Textbooks"`. Import if needed: `npm run pdf:import -- --root "D:\Library\Textbooks"`.
10. **Test Mode** uses Razorpay's simulated payment methods. A real PhonePe/Google Pay UPI debit requires activated **live** mode and explicit `RAZORPAY_ALLOW_LIVE=true`. Do not enable live keys without live readiness and rights review.

## Endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register/start` | Public, rate-limited | Request actual SMS OTP |
| POST | `/api/auth/register/verify-phone` | Public, rate-limited | Verify 4-digit SMS OTP, create account |
| GET | `/api/payments/config` | Public | Public key ID / availability only |
| POST | `/api/payments/orders` | Student | Create/reuse subject Razorpay order |
| POST | `/api/payments/verify` | Student | Verify checkout signature + captured payment |
| GET | `/api/payments/my` | Student | Own payment history |
| GET | `/api/payments/purchases` | Student | Own completed subject entitlements |
| GET | `/api/payments/orders/:orderId` | Student | Own recorded order status |
| POST | `/api/payments/webhook` | Provider-signed | Server-side captured payment reconciliation |
| PATCH | `/api/admin/textbooks/:id/price` | Admin | Change price for future subject purchases |
| GET | `/api/admin/users` | Admin | Search name/email with verified mobile field |
| GET | `/api/admin/users/:id/borrowings` | Admin | Borrowed books, due dates and fines |

## Tests and honest limitations

- Unit tests exercise 4-digit OTP validation/hash binding, payment signature, webhook raw-body signature, captured status checks, price validation, and overdue-fine rounding. Existing tests are retained.
- Server/JSX parsing checks are independent of npm dependency installation. Run a real browser build and MongoDB tests locally.
- Razorpay cannot be verified end-to-end without **your own provider keys** and a reachable webhook endpoint; Twilio cannot deliver SMS without **your own sender configuration** and operational compliance. This code does not invent payment records, send simulated OTPs or confirm fake checkout success.
- A phone number is personal data; the application protects it behind authenticated admin/profile endpoints. Admins must use it appropriately.
- Publishing and selling third-party PDF textbooks requires suitable copyright and distribution permission, independently of whether you charge ₹1.
- Refunds, full physical-book sales, fine collection, and accounting reconciliation with payout fees are outside this specific implementation scope and must be addressed before a live commercial launch.

# OpenShelf — Gmail OTP Registration & Automatic Peer Gmail Compose

This update is based on the **Payments Removed / Free Student PDFs** ZIP and does not re-enable Razorpay.

## What changed

- Registration collects full name, **unique email**, 10-digit Indian **contact number**, password, and confirmation. The contact number is **not verified by SMS**; multiple accounts may share it, and only email/password are used to log in.
- `/api/auth/register/start` validates the details, stores a short-lived hashed **six-digit** email OTP and requests a real SMTP send. A new account is **not created** until OTP verification passes.
- `/api/auth/register/verify-email` checks the six-digit code against a secret-keyed digest in MongoDB. Four unsuccessful attempts, a five-minute expiry, a 60-second resend cooldown, and one-use challenge consumption apply. The response identifies incorrect/expired codes; no plaintext code is stored.
- The obsolete `/api/auth/register/verify-phone` and Twilio SMS implementation were removed. Existing student records and historical `phoneVerifiedAt` fields are retained for compatibility; new student accounts use `emailVerifiedAt`.
- Existing Forgot Password uses a separate **six-digit email OTP**, backend verification, 10-minute expiry, five attempts, and a one-use reset token. It remains unchanged.
- After clicking **Request exchange / lending**, OpenShelf saves the request and attempts to open an editable Gmail compose tab **only if the listing owner explicitly opted in** to share their email. If no consent, the preopened tab is closed and private in-app messaging remains available. Browsers may block popups; a manual Gmail compose link is shown as a fallback.
- Neither peer exchange nor Gmail compose automatically **sends** an email; the student must review and click Send.

## Environment

Preserve private `server/.env` and `client/.env` from the working project. Set the real credentials in `server/.env`:

```dotenv
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=youraddress@gmail.com
EMAIL_PASS=your_google_app_password
EMAIL_FROM="OpenShelf <youraddress@gmail.com>"
REGISTRATION_OTP_SECRET=another_random_32_plus_character_secret
RESET_TOKEN_SECRET=a_different_random_32_plus_character_secret
```

No `TWILIO_*` variables are needed. Gmail SMTP provider acceptance is **not** a guarantee of inbox delivery: check Spam, and enter the actual received OTP. Without valid SMTP credentials, registration fails explicitly rather than bypassing verification.

Generate fresh secrets from the project root using:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate a different value for each secret; never publish or include your real `.env` files in a ZIP.

## Start and test

```powershell
npm run install:all
npm test
npm run build
npm run dev
```

Go to `http://localhost:5173` (or the URL Vite prints).

1. Register with a 10-digit phone and a **new** email address; confirm a six-digit Gmail code is received.
2. Enter a wrong code: account creation must fail. Try a correct code before expiry: account creation should succeed.
3. Try registering a second account with a **different** email but the same phone: it should work.
4. Test Forgot Password with a six-digit code sent to the registered email; a wrong code must not reset the password.
5. In Peer Exchange, create a listing with consent checked. From a second student account, click **Request exchange / lending**: after saving, Gmail compose should open (if allowed), with the recipient/title filled but **no message sent**.
6. Repeat with owner consent unchecked: no address is shared, and private messages remain available.
7. Verify General Books, PDFs, borrowing, overdue fines, admin access, and payment-disabled routes still work.

## Verification limitations

Source-level tests do **not** prove real SMTP delivery, browser popup behavior, live MongoDB transactions, or Vite build success. Run those tests on the Windows computer with valid provider credentials.

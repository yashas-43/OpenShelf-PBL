# Forgot Password — registered student accounts only

## Problem fixed

Previously, the login modal switched immediately to the OTP entry form after **Send code** regardless of whether that email was registered. This was confusing, even though the backend already withheld an OTP from unknown accounts.

## Updated behavior

1. The student clicks **Forgot password?** and enters an email address.
2. The backend searches for an **active, non-archived student account** with that email in MongoDB. The administrator account is not eligible for this reset flow.
3. Only when such an account exists does OpenShelf create and send a six-digit code to the account's registered email.
4. Both known and unknown emails receive the **same generic request response**. This deliberately prevents strangers from checking who has registered.
5. The login modal stays on the request form and explains the next step. A student who actually receives the code clicks **I received a code**.
6. An unknown, disabled, archived, or administrator email cannot verify a code or change a password. A missing/wrong/expired OTP is rejected.
7. The user can check the email address or choose **create an account** if no code arrives.

## Security properties

- Never expose account existence through a distinct HTTP response or UI message.
- Expiry: 10 minutes; attempt limit: five; resend cooldown: 60 seconds.
- Codes are stored as keyed hashes, never in plaintext.
- Reset tokens are single-use. After a successful reset, existing sessions are invalidated.
- Gmail SMTP must be configured and the API running for actual email delivery.
- The administrator password remains controlled by the administrator's private `server/.env` file.

## Modified / created files

- `server/src/services/passwordResetEligibility.js` (new: single safe lookup policy)
- `server/src/services/passwordResetService.js` (changed: use the policy for request, verify and completion)
- `client/src/components/auth/AuthModal.jsx` (changed: no automatic move to OTP form; clear guidance)
- `server/src/tests/passwordResetEligibility.test.js` (new: lookup and flow regression checks)
- `docs/FORGOT-PASSWORD-REGISTERED-EMAIL-ONLY.md` (new)

## Local verification

```powershell
npm run install:all
npm test
npm run build
npm run dev
```

Test one **existing active student email** and one **unregistered email**. The response to a reset request must look the same. Only the registered email should receive a code, and only that account should be able to verify it and change its password. If Gmail SMTP is not configured, neither account will receive an email; inspect the server's email logs without exposing credentials.

Do not run account-cleanup scripts during this test.

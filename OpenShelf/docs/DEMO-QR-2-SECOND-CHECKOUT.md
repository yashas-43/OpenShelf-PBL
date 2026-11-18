# OpenShelf – Classroom QR demo checkout (no Razorpay, no money)

This edition replaces the **Student Library Buy Access UI** with a clearly labelled **non-payable demo QR**. The user sees a fixed ₹10 illustration, then the browser calls the backend after approximately two seconds. The backend independently checks the elapsed time and, if the subject and all PDF parts are published, authorised, and accessible on disk, records **demo-only access** in MongoDB.

**No bank, UPI, real QR payment, payment gateway, or Razorpay transaction is initiated.** The QR code encodes text that says it is a classroom demo. It does not encode a UPI link. No real money is sent or received. Do not represent demo completion as genuine payment.

## Setup on Windows

1. Extract the ZIP into a **new** folder. Never copy `node_modules` from another project version.
2. Copy your existing **private** `server/.env` and `client/.env` files to the new version after rotating exposed credentials. Never share these files, including in screenshots.
3. In `server/.env`, set:

   ```env
   NODE_ENV=development
   DEMO_QR_ENABLED=true
   PORT=5000
   # Keep the same working MONGODB_URI, JWT_SECRET and admin settings as before.
   ```

   Razorpay API credentials are **not required** for this demo flow. They may be omitted. Demo mode is explicitly disabled when `NODE_ENV=production` or `DEMO_QR_ENABLED` is not `true`.
4. Set `client/.env` to use the backend, for example `VITE_API_URL=http://localhost:5000`.
5. In the main `OpenShelf` folder:

   ```powershell
   npm run install:all
   npm run dev
   ```

6. Check `http://localhost:5000/api/health`, then open the URL shown by Vite (normally `http://localhost:5173`). If ports are occupied, stop duplicate servers first; avoid running multiple versions of OpenShelf together.
7. Sign in as a student, navigate to Student Library → School or PUC → subject with an **authorised, complete PDF bundle** and press **Buy Access — ₹10 Demo QR**. It shows the non-payable QR and automatically marks the demo complete after about two seconds. Press **Continue to textbook** and open any PDF part. The unlocked status survives a page refresh while demo mode remains enabled.

## Why a PDF may not show up

Actual textbook PDF files are **not bundled in the source ZIP**. The Student Library catalogue can show metadata without PDF files. Set `TEXTBOOKS_ROOT` to the directory containing your authorised files, then use the importer or admin upload system. Missing, unpublished, unapproved, or incomplete Part 1/Part 2 sets remain unavailable (demo checkout is denied).

## Backend design

- `POST /api/demo-checkout/start` checks authentication, publication, rights, and all files; it creates/refreshes a pending demo session.
- `POST /api/demo-checkout/complete` verifies the same user, checks a server-side minimum 2-second wait, rechecks the PDF bundle, and marks **only** the demo record completed.
- `GET /api/demo-checkout/purchases` lists completed demo access so it remains available after refresh.
- The existing PDF reader and stream endpoints use server-side entitlement checks. A completed demo gives subject-level access to every authorised PDF part **only while classroom demo mode is enabled**.
- Real Razorpay `Payment` and `Purchase` records are not created or modified by this demo. Real Razorpay order creation is paused when demo mode is enabled. Existing test-payment code remains in the repository for later use, but there is no Razorpay script in the Student Library page.
- Administrator approval for peer exchange, physical borrowing, overdue fines, sign-in and dashboards remain separate and unchanged.

## Verification and limitations

Run `npm run verify:imports` and `npm test` after installing dependencies. The QR and timer are for **demonstration only**. For a real commercial transaction, replace the mock flow with a genuine payment provider and server-verified payment before any access is granted, and obtain appropriate textbook distribution rights.

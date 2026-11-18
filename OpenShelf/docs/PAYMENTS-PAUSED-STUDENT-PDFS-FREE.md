# OpenShelf — Payments paused; Student PDFs free

## Current behavior

- Razorpay Checkout is no longer loaded, and there are no payment/unlock buttons or prices for Student PDFs.
- **Every published Student Category PDF is free to read**, including Part 1 and Part 2. Reading still requires login.
- Every request under `/api/payments`, including `/api/payments/orders` and `/api/payments/webhook`, returns HTTP **410** and `PAYMENTS_DISABLED`. No API order creation, payment verification, or webhook is mounted.
- Existing `Payment` and `Purchase` documents in MongoDB are **not deleted or modified**. The legacy Razorpay code is disconnected from the server and remains dormant for possible future reactivation after a separate security review.
- User and Admin dashboards do not show payments, purchase records, revenue, or subject pricing. Admin General Book stock editing and internal price management remain available for future use; public General Book prices and price-based sorting are hidden.
- The current fine is **₹10 per started overdue day**, tracked as an account balance; it is **not collected automatically**.
- Phone OTP registration, email/password login, Gmail messages, physical borrowing, peer exchange, 3D homepage and the common General Book cover remain preserved.

## Security and rights

- **General Books have no PDF access**, regardless of login state.
- Student PDFs require an active PDF record, published textbook, and actual file under `TEXTBOOKS_ROOT`.
- Production streaming still requires an administrator-confirmed distribution right for each PDF. The content being free does not grant copyright permission.
- A signed-in student uses a short-lived, HttpOnly access cookie for streaming. The server validates sessions and reading history.
- Remove old Razorpay secrets from your private `server/.env` and disable obsolete webhook deliveries in your Razorpay merchant dashboard. This ZIP cannot reverse charges or reconcile historic orders. If a real payment was captured or pending before pausing, review it directly in Razorpay before switching off its notifications.

## Installation (Windows / VS Code)

Extract the ZIP and open the inner `OpenShelf` folder in VS Code. Back up your current project and MongoDB. Copy the private `server/.env` and `client/.env` from your functioning previous OpenShelf project; do not upload these files here. Keep the MongoDB URL, JWT secret, admin hash, Gmail SMTP setup, OTP service and `TEXTBOOKS_ROOT`. Remove any unused `RAZORPAY_*` values.

At the OpenShelf root in PowerShell:

```powershell
node -v
npm -v
npm run install:all
npm test
npm run build
npm run pdf:check -- --root "D:\Library\Textbooks"
npm run pdf:import -- --root "D:\Library\Textbooks"
npm run dev
```

Use the `pdf:import` command only if the PDF verification reports zero errors and MongoDB is running. Open `http://localhost:5173`. A public website URL is not needed to run this version locally. Actual PDFs remain on your laptop; the ZIP contains only the source and manifest.

## Manual validation checklist

- [ ] Student Library shows FREE, without payment buttons or ₹1 labels.
- [ ] A fresh student account can open a complete single PDF without payment.
- [ ] A fresh student account can open both parts of a multipart textbook without payment.
- [ ] Logged-out visitors are asked to sign in before reading.
- [ ] No General Book exposes a PDF link or quantity counter.
- [ ] `/api/payments/orders` and `/api/payments/webhook` respond with `410` and `PAYMENTS_DISABLED`.
- [ ] Existing MongoDB payment/purchase records remain unchanged; no new payment orders are created.
- [ ] Admin can still change General Book physical stock, manage Student PDF publication and view student borrowing history.
- [ ] Borrowing, ₹10 overdue fines, new email OTP registration, peer exchange and Gmail features still work on the laptop.

## Validation limits

Unit/static tests can run locally in the source environment. Full Vite production build, real MongoDB, actual textbook files and Gmail/email OTP integrations still require your laptop and provider configuration. Do not treat source-level tests as proof of end-to-end integration.

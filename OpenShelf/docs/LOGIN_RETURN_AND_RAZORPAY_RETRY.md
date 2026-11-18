# OpenShelf: login returns to your original page + Razorpay fallback

## What changed

- Logging in from a General Library book details window keeps that window and book open. Click **Borrow Book** after login; OpenShelf does not borrow automatically.
- Logging in while browsing a Student Library subject keeps the selected subject; the user can continue the PDF checkout after login.
- Logging in from Peer Exchange keeps the current section. Logins/registrations no longer force `#dashboard`.
- Dashboard navigation still works by choosing **My dashboard**, and a login requested from an actual dashboard link goes to the appropriate student/admin dashboard.
- Razorpay's optional UPI-first display config now uses only documented fields. If the hosted checkout displays **Something went wrong**, close it, choose **Having trouble? Try standard Razorpay checkout** below the buy button, then try again.
- Standard checkout lets Razorpay choose the supported payment methods; it does not guarantee UPI will be available.
- ₹10 **test** payment price, payment signature verification, and one-purchase-unlocks-all-PDF-parts logic remain unchanged.

## Setup

1. Extract this ZIP, then copy `client/.env` and `server/.env` from your old installation **locally** (never share them).
2. From the `OpenShelf` root run `npm run install:all` if dependencies are not installed, then `npm run dev`.
3. Verify your API on `http://localhost:5000/api/health` and the frontend on the Vite address printed in the terminal.
4. Test: open a General Library book and click **Log in to borrow**. After a successful login, the same book details should still appear, with **Borrow Book** available.
5. Test: open Student Library, choose a class and subject, click purchase while logged out. After logging in, you should remain on that subject.
6. Test: on a published, authorised Student PDF subject, click **Buy access — ₹10 test payment**. If Razorpay's hosted checkout fails before payment, close it, use the standard checkout toggle, and try a documented test method.
7. Verify payment status in the Razorpay **Test Mode** dashboard before repeating a payment attempt. Paid access is never granted based solely on the frontend callback.

## A note about Razorpay's own error screen

OpenShelf cannot suppress Razorpay's hosted `Uh! oh! Something went wrong` error or enable methods that aren't active on your merchant account. The error can also be influenced by the browser or extension settings. For a repeatable test, use a normal browser tab (Chrome/Edge, not an editor's embedded browser), check the browser console and Razorpay Test Mode transaction details, and try the checkout fallback above. Don't use a real UPI transfer for a test payment.

## Tests

```
node --test client/src/utils/postAuthNavigation.test.mjs client/src/utils/razorpayCheckout.test.mjs
npm run test:phase15
npm run verify:imports
npm run test --prefix server
```

The Mongoose-dependent test requires server dependencies installed (`npm install --prefix server`). Tests that need MongoDB or live Razorpay Test Mode require your own local service and credentials.

## Security

Do not add `.env` files to a ZIP or share screenshots containing Razorpay secrets, Gmail app passwords, or session tokens. Revoke keys that have been exposed and update the copies stored only on your laptop.

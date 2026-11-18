# OpenShelf — Homepage cleanup and Razorpay payment routing

This cumulative update is based on **OpenShelf-Phase-12-Razorpay-Phone-OTP-Fines.zip**.

## Homepage changes

- Removed the decorative reading quote section and the Discover/Choose/Grow steps section.
- Removed unused styles and the now-dead `#how-it-works` navigation target.
- Replaced the header **How it works** link with **Student library**, which routes into the working Student Library view.
- Replaced the hero **See how it works** link with **Student textbooks** and routed it to the existing Student Library.
- Preserved all other existing functionality, including login, user/admin dashboards, student PDFs, automatic borrowing, peer exchange, Gmail integration, Razorpay Checkout, phone verification and fines.

## Razorpay implementation in this source

`client/src/services/razorpayCheckout.js` loads Razorpay's hosted Standard Checkout SDK (`https://checkout.razorpay.com/v1/checkout.js`). The code **does not** contain a fixed UPI QR image, a homemade QR scanner, or a hard-coded recipient's UPI ID. When the merchant's live payment methods permit it, the hosted checkout can offer UPI Intent or a Razorpay-generated QR to pay using a supported UPI app. Available methods vary with account configuration and checkout device.

- **Test keys (`rzp_test_…`)**: simulated transactions only; no real money reaches anyone.
- **Live keys (`rzp_live_…`)**: payment is collected for the Razorpay merchant account owning those API keys. After settlement, applicable net proceeds go to the registered settlement bank account for that Razorpay merchant, subject to fees, settlement timing and any account restrictions.
- The `ADMIN_EMAIL` setting is an OpenShelf sign-in configuration and **not** a payout destination.
- The website does not know or reveal the actual settlement bank account. Confirm it in the Razorpay merchant dashboard.

## Run and check

From the extracted inner `OpenShelf` folder, copy your private `.env` files from the working version, then:

```powershell
npm run install:all
npm test
npm run build
npm run dev
```

Verify that the two removed sections are gone, that the **Student library** navigation works, and that other pages still open. Razorpay test mode and live settlement remain dependent on your Razorpay account and private credentials.

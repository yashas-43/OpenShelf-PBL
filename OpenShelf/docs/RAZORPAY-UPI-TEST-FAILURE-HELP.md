# Razorpay UPI / QR and test payment troubleshooting

OpenShelf runs **₹10 test-mode-only** payments for a *textbook subject*. One verified successful payment unlocks all available parts in that subject. No real money is charged by a test transaction.

## What changed

- Checkout now **requests UPI/QR before cards and netbanking** with Razorpay's supported `config.display` interface. It does not invent a payment method or remove alternatives.
- **Manual UPI Collect / typing a UPI ID** is deprecated for most web merchants. The configuration hides `upi` → `collect`, allowing Razorpay's supported UPI Intent/QR method when the merchant and platform permit it. On desktop, Razorpay typically presents UPI QR; on supported mobile devices, app Intent is used.
- If UPI remains absent, enable/check it at **Razorpay Dashboard → Account & Settings → Payment Methods** and **Payment Configuration**, or contact Razorpay support. An application cannot force methods the merchant account does not have.
- When the payment fails, OpenShelf now displays the `description`, `code`, `reason`, `source`, and `step` provided by Razorpay rather than a generic failure message.
- Checkout dismissal no longer overwrites a failure reason.
- The ₹10 server-side amount, signature verification, captured-payment reconciliation, textbook PDF bundle gate, and student purchase ownership logic were unchanged.

## Why the screenshot failed

The screenshot displayed a warning that **Union Bank of India payments were experiencing issues**. A selected bank or payment route can fail for reasons outside OpenShelf. The exact cause of an individual attempt is only confirmed by Razorpay's transaction diagnostics, which include a failure reason and payment ID in the dashboard. Reproduce the test with a mock card or another available test bank.

## Test payment steps

1. Keep your `server/.env` **test** key ID (`rzp_test_...`) and matching secret. Never put the secret in the frontend.
2. Run `npm run install:all` from OpenShelf root, then `npm run dev`.
3. In Student Library, open a subject whose approved PDF bundle is ready and click **Buy access — ₹10 test payment**.
4. Try UPI/QR **only if Razorpay displays it**. Razorpay test UPI behaviour may differ from live UPI Intent/QR; do not use your real banking app for a test purchase.
5. To validate the end-to-end demo, use a documented **test card** (for example, Visa `4111 1111 1111 1111`, any future expiry and arbitrary CVV) and choose the mock success flow shown by Razorpay. Alternatively use an available mock netbanking bank and choose success.
6. If payment fails, read OpenShelf's new detailed error banner and find the attempt in **Razorpay Dashboard → Test Mode → Transactions / Payments**. Check `error.code`, `reason`, `source`, `step` for the actual cause.
7. After success, OpenShelf's backend still verifies the **captured** transaction through Razorpay before granting access. If you close checkout, use **Check payment status** instead of starting more payments immediately.

## Important restrictions

- Razorpay controls whether the UPI method appears in **Test Mode**; highlighting it does not activate it.
- Do not modify the frontend to mark payment successful on `payment.failed` or an unverified callback.
- Only distribute PDFs you have permission to license or sell. Government textbooks available for free education are not automatically licensed for paid resale.

Reference documentation:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/
- https://razorpay.com/docs/payments/payment-methods/upi/faqs/
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/test-integration/

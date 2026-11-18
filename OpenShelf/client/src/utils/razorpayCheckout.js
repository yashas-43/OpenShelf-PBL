/**
 * Razorpay Standard Checkout display preferences.
 * The merchant's Razorpay account and Razorpay Test Mode ultimately decide
 * which methods (including UPI Intent / QR) can actually be displayed.
 * Manual UPI Collect is deprecated. Do not show a fake UPI payment button.
 */
export function upiPreferredCheckoutConfig() {
  return {
    display: {
      blocks: {
        preferred_upi: {
          name: 'UPI / QR (when available)',
          instruments: [{ method: 'upi' }]
        }
      },
      sequence: ['block.preferred_upi', 'card', 'netbanking', 'wallet'],
      preferences: { show_default_blocks: true },
      // Keep only documented Razorpay display fields. Razorpay handles
      // availability of UPI Intent / QR and deprecated Collect flows.
    }
  };
}

/** Keep provider diagnostic details, but don't disclose credentials or PII. */
export function razorpayFailureMessage(event) {
  const error = event?.error ?? {};
  const sanitize = (value, max = 180) =>
    typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '';
  const reason = sanitize(error.reason, 80);
  const description = sanitize(error.description);
  const code = sanitize(error.code, 80);
  const source = sanitize(error.source, 50);
  const step = sanitize(error.step, 50);
  const explanation = description || 'Razorpay did not complete this attempt.';
  const details = [code && `Code: ${code}`, reason && `Reason: ${reason}`,
    source && `Source: ${source}`, step && `Step: ${step}`].filter(Boolean).join(' · ');
  return `Test payment failed: ${explanation}${details ? ` (${details})` : ''}. ` +
    'No textbook access was granted. Try another available Razorpay test method; check payment status before starting a new purchase.';
}

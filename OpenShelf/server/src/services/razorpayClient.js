/** Razorpay REST adapter. No server secret is sent to the browser. */
export function paymentsConfigured() {
  const id = process.env.RAZORPAY_KEY_ID || '';
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  // Classroom demo: test credentials only. Live keys cannot enable charges.
  return /^rzp_test_[A-Za-z0-9]+$/.test(id) && Boolean(secret);
}
export async function razorpayRequest(method, path, body) {
  if (!paymentsConfigured()) {
    const error = new Error('Razorpay is not configured. Use test keys to enable checkout.');
    error.status = 503;
    throw error;
  }
  const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method, headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000)
    });
  } catch {
    const error = new Error('Could not reach Razorpay. No payment was confirmed.');
    error.status = 503;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Razorpay rejected the request (${response.status}). No payment was confirmed.`);
    error.status = 502;
    throw error;
  }
  return response.json();
}

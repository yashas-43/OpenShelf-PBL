/** Classroom-only QR demo. Never treat this as a real financial transaction. */
export const DEMO_PRICE_PAISE = 1000;
export const DEMO_DELAY_MS = 2000;
export const demoModeEnabled = (env = process.env) =>
  ['development', 'test'].includes(env.NODE_ENV) && env.DEMO_QR_ENABLED === 'true';
export function demoReadyForCompletion(startedAt, now = Date.now()) {
  const started = new Date(startedAt).getTime();
  return Number.isFinite(started) && now >= started + DEMO_DELAY_MS;
}

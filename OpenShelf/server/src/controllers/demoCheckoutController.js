import DemoCheckout from '../models/DemoCheckout.js';
import StudentTextbook from '../models/StudentTextbook.js';
import { demoModeEnabled } from '../services/demoCheckoutRules.js';
import { startDemoCheckout, completeDemoCheckout } from '../services/demoCheckoutService.js';

function unavailable(res) {
  return res.status(503).json({ success: false, message: 'Demo QR checkout is disabled. Set DEMO_QR_ENABLED=true in server/.env for local development only.' });
}
export async function start(req, res, next) {
  if (!demoModeEnabled()) return unavailable(res);
  try {
    const result = await startDemoCheckout(req.auth.sub, req.body?.subjectId);
    if (result.status) return res.status(result.status).json({ success: false, message: result.message });
    return res.json({ success: true, ...result });
  } catch (error) { return next(error); }
}
export async function complete(req, res, next) {
  if (!demoModeEnabled()) return unavailable(res);
  try {
    const result = await completeDemoCheckout(req.auth.sub, req.body?.checkoutId);
    if (result.status) return res.status(result.status).json({ success: false, message: result.message });
    return res.json({ success: true, ...result, message: 'Simulated payment complete. No money was taken.' });
  } catch (error) { return next(error); }
}
export async function myDemoAccess(req, res, next) {
  if (!demoModeEnabled()) return unavailable(res);
  try {
    const entries = await DemoCheckout.find({ user: req.auth.sub, status: 'completed' }).sort({ completedAt: -1 }).lean();
    const subjectIds = entries.map(x => x.textbook);
    const subjects = await StudentTextbook.find({ _id: { $in: subjectIds } }).select('level subject title').lean();
    const byId = new Map(subjects.map(s => [String(s._id), s]));
    return res.json({ success: true, data: entries.map(e => ({ subjectId: e.textbook, subject: byId.get(String(e.textbook)) || null, completedAt: e.completedAt, isDemo: true })) });
  } catch (error) { return next(error); }
}

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { start, complete, myDemoAccess } from '../controllers/demoCheckoutController.js';

const router = Router();
router.use(requireAuth, requireRole('student'));
router.get('/purchases', myDemoAccess);
router.post('/start', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), start);
router.post('/complete', rateLimit({ windowMs: 15 * 60_000, limit: 50 }), complete);
export default router;

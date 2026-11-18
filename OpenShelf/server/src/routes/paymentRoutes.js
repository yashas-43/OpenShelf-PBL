import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { config, createOrder, myPayments, myPurchases, orderStatus, verifyPayment } from '../controllers/paymentsController.js';

const router = Router();
router.get('/config', config);
router.use(requireAuth, requireRole('student'));
router.get('/my', myPayments);
router.get('/purchases', myPurchases);
router.get('/orders/:orderId', orderStatus);
router.post('/orders', rateLimit({ windowMs: 15 * 60_000, limit: 10 }), createOrder);
router.post('/verify', rateLimit({ windowMs: 15 * 60_000, limit: 20 }), verifyPayment);
export default router;

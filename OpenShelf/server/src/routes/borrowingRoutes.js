import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requestBook, requestExtension, requestReturn } from '../controllers/borrowingController.js';

const router = Router();
router.use(requireAuth, requireRole('student'));
router.post('/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'Too many borrowing requests. Try again later.' }
}), requestBook);
router.post('/:id/extension-request', requestExtension);
router.post('/:id/return-request', requestReturn);
export default router;

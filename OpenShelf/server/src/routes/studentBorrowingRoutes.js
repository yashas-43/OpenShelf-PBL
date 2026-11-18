import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { askExtension, availability, checkout, requestReturn } from '../controllers/studentBorrowingController.js';

const router = Router();

// Physical stock status can be read publicly; actual copy counts remain private.
router.get('/:id/availability', availability);
router.use(requireAuth, requireRole('student'));
router.post('/', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}), checkout);
router.post('/:id/extension-request', askExtension);
router.post('/:id/return-request', requestReturn);

export default router;

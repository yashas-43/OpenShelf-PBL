import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { borrowings, studentBorrowings, changePassword, overview, profile, updateProfile } from '../controllers/dashboardController.js';

const router = Router();
router.use(requireAuth, requireRole('student'));
router.get('/overview', overview);
router.get('/borrowings', borrowings);
router.get('/student-borrowings', studentBorrowings);
router.get('/profile', profile);
router.patch('/profile', updateProfile);
router.post('/change-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many password attempts. Try again later.' }
}), changePassword);

export default router;

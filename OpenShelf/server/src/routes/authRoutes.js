import { Router } from 'express';
import { login, me, register } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { requestRegistrationOtp, confirmRegistrationOtp } from '../controllers/registrationController.js';
import { forgotPassword, verifyResetCode, resetPassword } from '../controllers/passwordResetController.js';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' } });
router.post('/register', authLimiter, register); // explicitly disabled: no email verification bypass
router.post('/register/start', authLimiter, requestRegistrationOtp);
router.post('/register/verify-email', authLimiter, confirmRegistrationOtp);
router.post('/login', authLimiter, login);
const resetRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many requests. Try again in 15 minutes.' } });
const resetVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' } });
router.post('/password/forgot', resetRequestLimiter, forgotPassword);
router.post('/password/verify', resetVerifyLimiter, verifyResetCode);
router.post('/password/reset', resetVerifyLimiter, resetPassword);
router.get('/me', requireAuth, me);
export default router;

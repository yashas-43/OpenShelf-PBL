import { completePasswordReset, requestPasswordReset, RESET_REQUEST_MESSAGE, verifyPasswordResetCode } from '../services/passwordResetService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    // For known and unknown accounts, the API response deliberately reveals nothing.
    await requestPasswordReset(email);
    res.status(202).json({ success: true, message: RESET_REQUEST_MESSAGE });
  } catch (error) { next(error); }
}

export async function verifyResetCode(req, res, next) {
  try {
    const resetToken = await verifyPasswordResetCode(req.body?.email, req.body?.code);
    res.json({ success: true, message: 'Code verified. You can now choose a new password.', resetToken });
  } catch (error) { next(error); }
}

export async function resetPassword(req, res, next) {
  try {
    await completePasswordReset(req.body?.email, req.body?.resetToken, req.body?.newPassword, req.body?.confirmPassword);
    res.json({ success: true, message: 'Your password has been changed. Please log in again.' });
  } catch (error) { next(error); }
}

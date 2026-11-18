import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { OPENSHELF_ADMIN_EMAIL } from '../services/accountRetirementRules.js';
import { adminSessionBinding } from '../services/startupSecurity.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const issueToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '2h', issuer: 'openshelf-api' });

export function issueStudentToken(user) {
  return issueToken({ sub: String(user._id), role: 'student', email: user.email, version: user.sessionVersion });
}

/** Legacy registration cannot bypass required email verification. */
export async function register(req, res) {
  return res.status(410).json({ success: false, message: 'Use the verified email registration flow.' });
}

export async function login(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!emailPattern.test(email) || !password) return res.status(400).json({ success: false, message: 'Enter your email and password.' });

    // Exactly one admin identity is permitted; the backend .env must match.
    if (email === OPENSHELF_ADMIN_EMAIL) {
      if (String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() !== OPENSHELF_ADMIN_EMAIL
        || !process.env.ADMIN_PASSWORD_HASH) {
        return res.status(503).json({ success: false, message: 'Administrator login is not configured.' });
      }
      const validAdmin = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
      if (!validAdmin) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      const user = { id: 'configured-admin', fullName: process.env.ADMIN_NAME || 'OpenShelf Administrator', email, role: 'admin' };
      return res.json({ success: true, message: 'Administrator login successful.', token: issueToken({ sub: user.id, role: 'admin', email, adminBinding: adminSessionBinding(process.env.JWT_SECRET, process.env.ADMIN_PASSWORD_HASH) }), user });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    return res.json({ success: true, message: 'Login successful.', token: issueToken({ sub: String(user._id), role: 'student', email, version: user.sessionVersion }), user: user.toSafeJSON() });
  } catch (error) { next(error); }
}

export async function me(req, res, next) {
  try {
    if (req.auth.role === 'admin') return res.json({ success: true, user: { id: req.auth.sub, fullName: process.env.ADMIN_NAME || 'OpenShelf Administrator', email: req.auth.email, role: 'admin' } });
    const user = await User.findById(req.auth.sub);
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'This account is unavailable.' });
    return res.json({ success: true, user: user.toSafeJSON() });
  } catch (error) { next(error); }
}

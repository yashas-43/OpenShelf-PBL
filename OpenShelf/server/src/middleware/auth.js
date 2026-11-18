import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { OPENSHELF_ADMIN_EMAIL } from '../services/accountRetirementRules.js';
import { matchesAdminSessionBinding } from '../services/startupSecurity.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'openshelf-api' });
    if (claims.role === 'admin') {
      if (claims.sub !== 'configured-admin'
        || String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() !== OPENSHELF_ADMIN_EMAIL
        || claims.email !== OPENSHELF_ADMIN_EMAIL
        || !matchesAdminSessionBinding(claims.adminBinding, process.env.JWT_SECRET, process.env.ADMIN_PASSWORD_HASH)) {
        return res.status(401).json({ success: false, message: 'Administrator session is unavailable.' });
      }
    } else if (claims.role === 'student') {
      const user = await User.findById(claims.sub).select('isActive sessionVersion role');
      if (!user?.isActive || user.role !== 'student' || (claims.version ?? 0) !== user.sessionVersion) {
        return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Invalid account role.' });
    }
    req.auth = claims;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'
      || error.name === 'CastError' || error.name === 'NotBeforeError') {
      return res.status(401).json({ success: false, message: 'Your session is invalid or has expired. Please log in again.' });
    }
    return next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) return res.status(403).json({ success: false, message: 'You do not have permission to access this resource.' });
    next();
  };
}

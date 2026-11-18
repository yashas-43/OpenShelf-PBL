import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listNotifications,
  markNotificationRead,
  markAllRead
} from '../controllers/notificationsController.js';

const router = Router();
router.use(requireAuth, requireRole('student'));
router.get('/', listNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markNotificationRead);
export default router;

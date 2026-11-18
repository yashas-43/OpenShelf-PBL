import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { changeBorrowingStatus, decideExtension, listAdminBorrowings } from '../controllers/borrowingController.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/', listAdminBorrowings);
router.post('/:id/actions/:action', changeBorrowingStatus);
router.post('/:id/extension', decideExtension);
export default router;

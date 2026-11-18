import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  adminExtension,
  adminInventory,
  adminInventoryBatch,
  adminList,
  adminReturn
} from '../controllers/studentBorrowingController.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// Student physical loans and textbook inventory are administrator-only.
router.get('/', adminList);
router.post('/:id/return', adminReturn);
router.post('/:id/extension', adminExtension);
// Bulk route must come before the parameterized single-textbook route.
router.patch('/textbooks/stock/bulk', adminInventoryBatch);
router.patch('/textbooks/:id/stock', adminInventory);

export default router;

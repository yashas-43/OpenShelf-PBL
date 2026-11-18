import { Router } from 'express';
import { getBook, listBooks, serveBookCover } from '../controllers/bookController.js';
const router = Router();
router.get('/', listBooks);
router.get('/:id/cover', serveBookCover);
router.get('/:id', getBook);
export default router;

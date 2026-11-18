import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { catalog, issueReaderAccess, streamPdf, saveReadingPage, readingHistory, clearReaderAccess } from '../controllers/studentPdfController.js';

const router = Router();
// Published catalogue metadata is browseable; file content is protected separately.
router.get('/catalog', catalog);
router.post('/logout', clearReaderAccess);
router.get('/history', requireAuth, requireRole('student'), readingHistory);
router.post('/:id/access', requireAuth, requireRole('student', 'admin'), issueReaderAccess);
router.put('/:id/progress', requireAuth, requireRole('student'), saveReadingPage);
router.get('/files/:id', streamPdf);
router.head('/files/:id', streamPdf);
export default router;

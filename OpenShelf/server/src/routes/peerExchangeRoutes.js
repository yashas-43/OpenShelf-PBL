import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { MAX_PEER_PHOTO_BYTES } from '../services/peerPhotos.js';
import { browse, detail, photo, mine, createListing, editListing, uploadPhoto,
  changeListingStatus, removeListing, createRequest, myRequests, contact, actionRequest,
  readMessages, sendMessage, reportListing } from '../controllers/peerExchangeController.js';
const router = Router();
const writes = rateLimit({ windowMs: 15 * 60 * 1000, limit: 35, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'Too many exchange actions. Try again later.' } });
const image = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PEER_PHOTO_BYTES, files: 1, fields: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
router.get('/', browse);
// Specific private GET endpoints precede the public /:id matcher.
const student = [requireAuth, requireRole('student')];
router.get('/mine', ...student, mine);
router.get('/requests/mine', ...student, myRequests);
router.get('/requests/:id/contact', ...student, contact);
router.get('/requests/:id/messages', ...student, readMessages);
router.get('/:id/photo', photo);
router.get('/:id', detail);
router.use(...student);
router.post('/requests/:id/messages', writes, sendMessage);
router.post('/requests/:id/:action', writes, actionRequest);
router.post('/', writes, createListing);
router.patch('/:id', writes, editListing);
router.patch('/:id/status', writes, changeListingStatus);
router.post('/:id/photo', writes, image.single('photo'), uploadPhoto);
router.delete('/:id', writes, removeListing);
router.post('/:id/requests', writes, createRequest);
router.post('/:id/reports', writes, reportListing);

// Expose these endpoints to the Express application.
export default router;

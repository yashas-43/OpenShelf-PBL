import { Router } from 'express';
import multer from 'multer';
import { MAX_ADMIN_UPLOAD, MAX_COVER_UPLOAD } from '../services/adminUploads.js';
import { addPdf, replacePdf, uploadBookCover } from '../controllers/adminUploadsController.js';
import { publishAnnouncement } from '../controllers/notificationsController.js';
import { reportSummary } from '../controllers/reportingController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  activity, archiveBook, books, createBook, editBook, editPdf, emailLogs,
  hidePeerListing, overview, peerListings, reviewPeerListing, publishTextbook, purchases,
  setUserStatus, textbookPdfs, textbooks, userBorrowings, users, retryEmail, borrowingReport, peerReports, resolvePeerReport
} from '../controllers/adminController.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
const pdfUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_ADMIN_UPLOAD,files:1,fields:5},
  fileFilter:(_req,file,callback)=> callback(null,file.mimetype==='application/pdf')});
const coverUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_COVER_UPLOAD,files:1,fields:1},
  fileFilter:(_req,file,callback)=>callback(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
router.get('/overview', overview);
router.get('/users', users);
router.patch('/users/:id/status', setUserStatus);
router.get('/users/:id/borrowings', userBorrowings);
router.get('/books', books);
router.post('/books', createBook);
router.patch('/books/:id', editBook);
router.delete('/books/:id', archiveBook);
router.post('/books/:id/cover',coverUpload.single('cover'),uploadBookCover);
router.get('/textbooks', textbooks);
router.patch('/textbooks/:id/publish', publishTextbook);
router.get('/textbooks/:id/pdfs', textbookPdfs);
router.post('/textbooks/:id/pdfs',pdfUpload.single('pdf'),addPdf);
router.post('/pdfs/:id/replace',pdfUpload.single('pdf'),replacePdf);
router.patch('/pdfs/:id', editPdf);
router.get('/emails', emailLogs);
router.post('/emails/:id/retry',retryEmail);
router.get('/reports/borrowings',borrowingReport);
router.get('/reports/summary', reportSummary);
router.post('/announcements', publishAnnouncement);
router.get('/purchases', purchases);
router.get('/peer-listings', peerListings);
router.patch('/peer-listings/:id/review', reviewPeerListing);
router.get('/peer-reports', peerReports);
router.patch('/peer-reports/:id/resolve', resolvePeerReport);
router.delete('/peer-listings/:id', hidePeerListing);
router.get('/activity', activity);
export default router;

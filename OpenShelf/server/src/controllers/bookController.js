import path from 'node:path';
import mongoose from 'mongoose';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { coversRoot } from '../services/adminUploads.js';
import Book from '../models/Book.js';
import Borrowing from '../models/Borrowing.js';
import { expectedReturnsByBook, publicBookView } from '../services/publicBookAvailability.js';

const allowedSorts = {
  newest: { createdAt: -1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
  author: { author: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 }
};

/** Only inspect stored due dates; never fabricate a promised return time. */
async function availabilityFor(books) {
  const soldOut = books.filter((book) => book.isAvailableForBorrow && book.availableCopies < 1);
  if (soldOut.length === 0) return new Map();

  const results = await Borrowing.aggregate([
    {
      $match: {
        book: { $in: soldOut.map((book) => book._id) },
        status: { $in: ['borrowed', 'overdue'] },
        returnedAt: null,
        dueAt: { $type: 'date' }
      }
    },
    { $group: { _id: '$book', dueDates: { $push: '$dueAt' } } }
  ]);
  return expectedReturnsByBook(results);
}

export async function listBooks(req, res, next) {
  try {
    const page = Math.min(1000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.min(48, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const filter = { format: 'physical', isPublished: { $ne: false } };
    const search = String(req.query.search || '').trim().slice(0, 100);
    const genre = String(req.query.genre || '').trim().slice(0, 80);
    const language = String(req.query.language || '').trim().slice(0, 80);
    const availability = String(req.query.availability || '');
    if (genre && genre !== 'All genres') filter.genre = genre;
    if (language) filter.language = language;
    if (availability === 'available') {
      filter.availableCopies = { $gt: 0 };
      filter.isAvailableForBorrow = true;
    }
    if (search) filter.$or = [
      { title: { $regex: escapeRegex(search), $options: 'i' } },
      { author: { $regex: escapeRegex(search), $options: 'i' } },
      { isbn: { $regex: escapeRegex(search), $options: 'i' } }
    ];
    const sort = allowedSorts[req.query.sort] || allowedSorts.newest;
    const [books, total, genres, languages] = await Promise.all([
      Book.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).select('-__v').lean(),
      Book.countDocuments(filter),
      Book.distinct('genre', { format: 'physical', isPublished: { $ne: false } }),
      Book.distinct('language', { format: 'physical', isPublished: { $ne: false } })
    ]);
    const deadlines = await availabilityFor(books);
    res.json({
      success: true,
      data: books.map((book) => publicBookView(book, deadlines.get(String(book._id)))),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      facets: { genres: genres.sort(), languages: languages.sort() }
    });
  } catch (error) { next(error); }
}

export async function getBook(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid book ID.' });
    }
    const book = await Book.findOne({ _id: req.params.id, format: 'physical', isPublished: { $ne: false } }).select('-__v').lean();
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
    const deadlines = await availabilityFor([book]);
    res.json({ success: true, data: publicBookView(book, deadlines.get(String(book._id))) });
  } catch (error) { next(error); }
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }


/** Serve only validated images for published General Books; never browse upload directories. */
export async function serveBookCover(req,res,next) {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) return res.status(404).end();
    const book=await Book.findOne({_id:req.params.id,isPublished:{$ne:false}}).select('coverFileExtension').lean();
    if(!['jpg','png','webp'].includes(book?.coverFileExtension))return res.status(404).end();
    const file=path.join(coversRoot(),`${req.params.id}.${book.coverFileExtension}`);
    const info=await stat(file);
    if(!info.isFile())return res.status(404).end();
    res.set({'Content-Type':{jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[book.coverFileExtension],
      'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Content-Length':String(info.size)});
    return createReadStream(file).pipe(res);
  }catch(error){if(error.code==='ENOENT')return res.status(404).end();next(error);}
}

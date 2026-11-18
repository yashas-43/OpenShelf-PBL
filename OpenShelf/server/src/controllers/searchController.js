import Book from '../models/Book.js';
import StudentTextbook from '../models/StudentTextbook.js';
import PeerBookListing from '../models/PeerBookListing.js';
import { publicBookView } from '../services/publicBookAvailability.js';
import { publicListing } from '../services/peerExchangeRules.js';
import { LEVELS } from '../services/studentPdfManifest.js';
import { escapeSearchText, normalizeSearchOptions } from '../services/searchRules.js';

/**
 * Combined search exposes only PUBLIC catalogue information.
 * It never returns registered-user identities, private contact emails,
 * physical stock counts or unpublished PDF paths.
 */
export async function globalSearch(req, res, next) {
  try {
    const options = normalizeSearchOptions(req.query);
    if (options.q.length < 2) {
      return res.status(400).json({ success: false, message: 'Search using at least two characters.' });
    }
    if (options.level && !LEVELS.includes(options.level)) {
      return res.status(400).json({ success: false, message: 'Unknown study level.' });
    }

    const rx = { $regex: escapeSearchText(options.q), $options: 'i' };
    const generalFilter = {
      format: 'physical', isPublished: { $ne: false },
      $or: [{ title: rx }, { author: rx }, { genre: rx }],
      ...(options.genre ? { genre: options.genre } : {}),
      ...(options.available ? { isAvailableForBorrow: true, availableCopies: { $gt: 0 } } : {})
    };
    const studentFilter = {
      isPublished: true,
      $or: [{ subject: rx }, { title: rx }, { level: rx }],
      ...(options.level ? { level: options.level } : {}),
      ...(options.available ? { isAvailableForBorrow: true, availableCopies: { $gt: 0 } } : {})
    };
    const peerFilter = {
      status: 'available', approvalStatus: 'approved',
      $or: [{ title: rx }, { author: rx }, { category: rx }],
      ...(options.available ? { status: 'available' } : {})
    };

    // The All tab shows previews of up to six matches in each category.
    // Category tabs have their own exact pagination, so no results are skipped.
    const preview = options.type === 'all';
    const limit = preview ? 6 : options.limit;
    const skip = preview ? 0 : (options.page - 1) * limit;
    const kinds = preview ? ['general', 'student', 'peer'] : [options.type];
    const results = {};

    await Promise.all(kinds.map(async (kind) => {
      if (kind === 'general') {
        const [rows, total] = await Promise.all([
          Book.find(generalFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          Book.countDocuments(generalFilter)
        ]);
        results.general = {
          total,
          items: rows.map((row) => ({
            ...publicBookView(row),
            category: 'general'
          }))
        };
      } else if (kind === 'student') {
        const [rows, total] = await Promise.all([
          StudentTextbook.find(studentFilter).sort({ level: 1, subject: 1 })
            .skip(skip).limit(limit).select('level subject title isAvailableForBorrow availableCopies').lean(),
          StudentTextbook.countDocuments(studentFilter)
        ]);
        results.student = {
          total,
          items: rows.map((item) => ({
            id: String(item._id), category: 'student',
            title: item.title, subject: item.subject, level: item.level,
            isAvailable: Boolean(item.isAvailableForBorrow && item.availableCopies > 0)
          }))
        };
      } else if (kind === 'peer') {
        const [rows, total] = await Promise.all([
          PeerBookListing.find(peerFilter).sort({ createdAt: -1 })
            .skip(skip).limit(limit).populate('owner', 'fullName').lean(),
          PeerBookListing.countDocuments(peerFilter)
        ]);
        results.peer = {
          total,
          items: rows.map((row) => ({ ...publicListing(row), category: 'peer' }))
        };
      }
    }));

    return res.json({ success: true, type: options.type, query: options.q,
      data: results,
      pagination: preview ? null : {
        page: options.page,
        limit,
        total: results[options.type]?.total ?? 0,
        pages: Math.ceil((results[options.type]?.total ?? 0) / limit)
      } });
  } catch (error) {
    return next(error);
  }
}

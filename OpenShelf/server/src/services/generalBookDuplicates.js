/**
 * Preview duplicate physical-book catalogue records without changing MongoDB.
 * We only auto-group identical normalized TITLE + AUTHOR combinations.
 * Different authors or editions must be reviewed, not silently merged.
 */
import { bookKey, normalizedText } from './generalCatalogueRules.js';

const idFor = (book) => String(book._id);
const activeFor = (counts, book) => Number(counts.get(idFor(book)) || 0);

/** A predictable identity used by admin forms as well as the duplicate report. */
export function sameGeneralBook(left, right) {
  return Boolean(normalizedText(left?.title) && normalizedText(left?.author)) && bookKey(left) === bookKey(right);
}

/**
 * Return an archive proposal, not database mutations. Preserve all borrowed
 * records and physical counts. A record with live loans must never be archived.
 */
export function planGeneralBookDuplicateArchive(books, activeCounts = new Map()) {
  const published = books.filter((book) => book.format === 'physical' && book.isPublished !== false);
  const groupsByKey = new Map();
  const titleGroups = new Map();

  for (const book of published) {
    const key = bookKey(book);
    groupsByKey.set(key, [...(groupsByKey.get(key) || []), book]);
    const title = normalizedText(book.title);
    titleGroups.set(title, [...(titleGroups.get(title) || []), book]);
  }

  const archive = [];
  const blocked = [];
  const groups = [];

  for (const candidates of groupsByKey.values()) {
    if (candidates.length < 2) continue;
    const ordered = [...candidates].sort((a, b) => idFor(a).localeCompare(idFor(b)));
    const active = ordered.filter((book) => activeFor(activeCounts, book) > 0);
    const tagged = ordered.filter((book) => Boolean(book.sourceBookId));
    const reason = active.length > 1
      ? 'Multiple duplicate records have active loans.'
      : tagged.length > 1
        ? 'Multiple records have source IDs; inspect catalogue identity conflicts.'
        : active.length === 1 && tagged.length === 1 && idFor(active[0]) !== idFor(tagged[0])
          ? 'Active loan belongs to a different record than the approved source ID.'
          : '';

    const keep = active[0] || tagged[0] || ordered[0];
    const extras = ordered.filter((book) => idFor(book) !== idFor(keep));
    const row = {
      title: keep.title,
      author: keep.author,
      keepId: idFor(keep),
      records: ordered.map((book) => ({
        id: idFor(book),
        sourceBookId: book.sourceBookId || null,
        availableCopies: Number(book.availableCopies || 0),
        totalCopies: Number(book.totalCopies || 0),
        activeLoans: activeFor(activeCounts, book)
      })),
      reason: reason || null
    };
    groups.push(row);

    if (reason) {
      blocked.push(row);
      continue;
    }
    // Never hide a loan-bearing record even if an older status slips through.
    if (extras.some((book) => activeFor(activeCounts, book) > 0)) {
      blocked.push({ ...row, reason: 'A duplicate is still referenced by an active loan.' });
      continue;
    }
    archive.push(...extras);
  }

  // Same title with different authors may be genuinely distinct editions.
  const titleOnly = [...titleGroups.values()]
    .filter((items) => new Set(items.map(bookKey)).size > 1)
    .map((items) => ({
      title: items[0].title,
      books: items.map((book) => ({ id: idFor(book), author: book.author }))
    }));

  return { groups, archive, blocked, titleOnly, publishedCount: published.length };
}

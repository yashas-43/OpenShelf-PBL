/**
 * Read-only catalogue validation and deterministic migration planning.
 * No database writes happen in this module. This keeps dry-run and tests safe.
 */
import { GENERAL_GENRES } from '../validators/adminValidation.js';

export const SOURCE_GENRE_TO_APPROVED = Object.freeze({
  Adventure: 'Adventure',
  Autobiography: 'Autobiography',
  Biography: 'Biography',
  Business: 'Business',
  "Children's Books": 'Children’s Books',
  Comics: 'Literature',
  'Crime Fiction': 'Mystery',
  Drama: 'Literature',
  Fantasy: 'Fantasy',
  Fiction: 'Fiction',
  Finance: 'Economics',
  Fitness: 'Health and Wellness',
  'Graphic Novels': 'Literature',
  Health: 'Health and Wellness',
  Horror: 'Horror',
  'Indian Epics and Mythology': 'Religion and Spirituality',
  'Indian History': 'History',
  Mystery: 'Mystery',
  Nature: 'Environment',
  'Personal Development': 'Self-Help',
  Philosophy: 'Philosophy',
  Poetry: 'Poetry',
  Romance: 'Romance',
  Science: 'Science',
  'Science Fiction': 'Science Fiction',
  'Self-help': 'Self-Help',
  Spirituality: 'Religion and Spirituality',
  Technology: 'Technology',
  Thriller: 'Thriller',
  Travel: 'Travel',
  'World History': 'History',
  'Young Adult Fiction': 'Fiction'
});

export const SHARED_COVER_URL = '/openshelf-general-cover.jpg';

/** Normalize titles and authors for matching without modifying the visible spelling. */
export function normalizedText(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

export function bookKey(book) {
  return `${normalizedText(book.title)}\u0000${normalizedText(book.author)}`;
}

/** Preserve original IDs and source genre while using only approved filter labels. */
export function validateCatalogue(source) {
  if (!Array.isArray(source) || source.length !== 326) {
    throw new Error(`Expected the original 326 General Book entries; received ${source?.length ?? 'invalid data'}.`);
  }
  const ids = new Set();
  const identities = new Set();
  return source.map((row) => {
    const id = String(row.book_id || '').trim();
    const recordId = String(row.record_id || '').trim();
    const key = bookKey(row);
    const genre = SOURCE_GENRE_TO_APPROVED[row.genre];
    if (!/^GEN\d{3}$/.test(id) || recordId !== id || ids.has(id)) {
      throw new Error(`Duplicate or invalid source book/record ID: ${id}`);
    }
    if (!row.title?.trim() || !row.author?.trim() || !row.description?.trim() || identities.has(key)) {
      throw new Error(`Missing book details or duplicate title/author: ${id}`);
    }
    if (!genre || !GENERAL_GENRES.includes(genre)) {
      throw new Error(`No approved genre mapping for ${id}: ${row.genre}`);
    }
    ids.add(id);
    identities.add(key);
    return {
      sourceBookId: id,
      sourceRecordId: recordId,
      title: row.title.trim(),
      author: row.author.trim(),
      description: row.description.trim(),
      genre,
      sourceGenre: row.genre,
      language: row.language || 'English',
      isbn: row.isbn || '',
      publisher: row.publisher || '',
      publishedYear: row.publication_year ?? null,
      coverUrl: SHARED_COVER_URL,
      format: 'physical',
      isPublished: true
    };
  });
}

const id = (row) => String(row._id);
const activeFor = (activeCountById, row) => Number(activeCountById.get(id(row)) || 0);

/**
 * Plan one visible catalogue record for each original title/author pair.
 * Existing loan references and inventory values must never be reassigned.
 * When an open loan prevents safely archiving a duplicate, report a blocker.
 */
export function planCatalogueMerge(sourceBooks, existingBooks, activeCountById = new Map()) {
  const byKey = new Map();
  const bySourceId = new Map();
  const used = new Set();
  for (const old of existingBooks) {
    const key = bookKey(old);
    byKey.set(key, [...(byKey.get(key) || []), old]);
    if (old.sourceBookId) {
      const sourceId = old.sourceBookId;
      bySourceId.set(sourceId, [...(bySourceId.get(sourceId) || []), old]);
    }
  }

  const update = [];
  const insert = [];
  const archive = [];
  const blockers = [];

  for (const source of sourceBooks) {
    const candidates = [...(byKey.get(bookKey(source)) || [])];
    const tagged = bySourceId.get(source.sourceBookId) || [];
    if (tagged.some((old) => bookKey(old) !== bookKey(source))) {
      blockers.push(`${source.sourceBookId}: source ID already belongs to a differently named record; review manually.`);
      continue;
    }
    // Count active loans by the record they reference: never move loan ownership.
    const activeCandidates = candidates.filter((old) => activeFor(activeCountById, old) > 0);
    if (activeCandidates.length > 1) {
      blockers.push(`${source.sourceBookId}: active loans span multiple duplicate records; manual consolidation required.`);
      continue;
    }
    const ordered = candidates.sort((a, b) => {
      const rank = (row) => (activeFor(activeCountById, row) > 0 ? 4 : 0)
        + (row.sourceBookId === source.sourceBookId ? 2 : 0)
        + (row.isPublished !== false ? 1 : 0);
      return rank(b) - rank(a) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || id(a).localeCompare(id(b));
    });
    const canonical = ordered[0];
    // Never transfer an existing unique source ID from another physical record.
    // Doing so would conflict with the database index and can obscure loan history.
    if (canonical && tagged.some((old) => id(old) !== id(canonical))) {
      blockers.push(`${source.sourceBookId}: source ID is assigned to another duplicate record; review its loan history.`);
      continue;
    }
    if (!canonical) {
      insert.push(source);
      continue;
    }
    if (canonical.sourceBookId && canonical.sourceBookId !== source.sourceBookId) {
      blockers.push(`${source.sourceBookId}: matched record has a conflicting sourceBookId.`);
      continue;
    }
    if (activeFor(activeCountById, canonical) > Number(canonical.totalCopies || 0)) {
      blockers.push(`${source.sourceBookId}: active loans exceed recorded physical copies.`);
      continue;
    }
    used.add(id(canonical));
    update.push({ record: canonical, source });
    for (const duplicate of ordered.slice(1)) {
      used.add(id(duplicate));
      if (activeFor(activeCountById, duplicate)) {
        blockers.push(`${source.sourceBookId}: duplicate ${id(duplicate)} still has active loans.`);
      } else if (duplicate.isPublished !== false) {
        archive.push({ record: duplicate, reason: 'duplicate' });
      }
    }
  }

  for (const old of existingBooks) {
    if (used.has(id(old))) continue;
    // Source-tagged records of an unsafe group should never be silently hidden.
    if (sourceBooks.some((source) => source.sourceBookId === old.sourceBookId && old.sourceBookId)) continue;
    if (activeFor(activeCountById, old)) {
      blockers.push(`Unlisted record ${id(old)} (${old.title}) has an active physical loan.`);
    } else if (old.isPublished !== false) {
      archive.push({ record: old, reason: 'not-in-approved-326' });
    }
  }

  return { insert, update, archive, blockers: [...new Set(blockers)] };
}

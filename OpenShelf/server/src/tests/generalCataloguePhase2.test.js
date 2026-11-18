import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bookKey,
  planCatalogueMerge,
  SHARED_COVER_URL,
  SOURCE_GENRE_TO_APPROVED,
  validateCatalogue
} from '../services/generalCatalogueRules.js';
import { GENERAL_GENRES } from '../validators/adminValidation.js';

const source = JSON.parse(readFileSync(new URL('../data/generalBooks326.json', import.meta.url), 'utf8'));
const approved = validateCatalogue(source);

const old = (id, row, overrides = {}) => ({
  _id: id,
  title: row.title,
  author: row.author,
  genre: row.genre,
  totalCopies: 3,
  availableCopies: 2,
  isAvailableForBorrow: true,
  isPublished: true,
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides
});

test('exactly 326 original IDs and distinct title/author identities', () => {
  assert.equal(approved.length, 326);
  assert.equal(new Set(approved.map((book) => book.sourceBookId)).size, 326);
  assert.equal(new Set(approved.map(bookKey)).size, 326);
  assert.equal(approved[0].sourceBookId, source[0].book_id);
  assert.equal(approved[0].sourceRecordId, source[0].record_id);
  assert.equal(approved[0].title, source[0].title);
});

test('all source genres map into the 32 approved categories and preserve original labels', () => {
  assert.equal(GENERAL_GENRES.length, 32);
  assert.equal(Object.keys(SOURCE_GENRE_TO_APPROVED).length, 32);
  for (const row of approved) {
    assert.ok(GENERAL_GENRES.includes(row.genre));
    assert.equal(row.coverUrl, SHARED_COVER_URL);
    assert.ok(row.sourceGenre);
  }
  assert.equal(approved.find((x) => x.title === 'Ramayana').genre, 'Religion and Spirituality');
});

test('source validation refuses duplicate title/author or conflicting source IDs', () => {
  const duplicateTitle = [...source];
  duplicateTitle[1] = { ...source[1], title: source[0].title, author: source[0].author };
  assert.throws(() => validateCatalogue(duplicateTitle), /duplicate/i);
  const duplicateId = [...source];
  duplicateId[1] = { ...source[1], book_id: source[0].book_id, record_id: source[0].book_id };
  assert.throws(() => validateCatalogue(duplicateId), /duplicate|invalid/i);
});

test('fresh MongoDB catalogue plans 326 inserts, no archive or blockers', () => {
  const plan = planCatalogueMerge(approved, []);
  assert.equal(plan.insert.length, 326);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.archive.length, 0);
  assert.equal(plan.blockers.length, 0);
});

test('matching old record reused rather than reinserted and duplicate archived', () => {
  const [title] = approved;
  const stored = [
    old('first', title, { title: ` ${title.title.toUpperCase()} `, author: title.author.toUpperCase() }),
    old('second', title)
  ];
  const plan = planCatalogueMerge([title], stored);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.insert.length, 0);
  assert.equal(plan.archive.length, 1);
  assert.equal(plan.archive[0].record._id, 'second');
  assert.equal(plan.blockers.length, 0);
});

test('a loan on one duplicate selects that copy as canonical; other copy archived', () => {
  const [title] = approved;
  const stored = [old('first', title), old('second', title)];
  const plan = planCatalogueMerge([title], stored, new Map([['second', 1]]));
  assert.equal(plan.update[0].record._id, 'second');
  assert.equal(plan.archive[0].record._id, 'first');
  assert.equal(plan.blockers.length, 0);
});

test('multiple duplicate records with open loans block an automatic merge', () => {
  const [title] = approved;
  const plan = planCatalogueMerge([title], [old('a', title), old('b', title)], new Map([['a', 1], ['b', 1]]));
  assert.ok(plan.blockers.some((message) => message.includes('active loans span multiple')));
});

test('unlisted records are archived only without open loans', () => {
  const extra = old('other', { title: 'Unlisted Book', author: 'Another Writer', genre: 'Mystery' });
  const safe = planCatalogueMerge([approved[0]], [extra]);
  assert.equal(safe.archive.length, 1);
  assert.equal(safe.archive[0].reason, 'not-in-approved-326');
  const unsafe = planCatalogueMerge([approved[0]], [extra], new Map([['other', 1]]));
  assert.equal(unsafe.archive.length, 0);
  assert.ok(unsafe.blockers.length > 0);
});

test('repeated import finds existing source IDs and does not insert or archive', () => {
  const saved = approved.map((row, i) => old(String(i + 1), row, { sourceBookId: row.sourceBookId }));
  const plan = planCatalogueMerge(approved, saved);
  assert.equal(plan.insert.length, 0);
  assert.equal(plan.update.length, 326);
  assert.equal(plan.archive.length, 0);
  assert.equal(plan.blockers.length, 0);
});

test('source ID bound to a different book blocks an overwrite', () => {
  const [book] = approved;
  const plan = planCatalogueMerge([book], [old('bad', { title: 'Different', author: 'Someone' }, { sourceBookId: book.sourceBookId })]);
  assert.ok(plan.blockers.some((msg) => msg.includes('differently named')));
});

test('a tagged duplicate with another active canonical loan must block', () => {
  const [book] = approved;
  const tagged = old('tagged', book, { sourceBookId: book.sourceBookId });
  const active = old('active', book);
  const plan = planCatalogueMerge([book], [tagged, active], new Map([['active', 1]]));
  assert.ok(plan.blockers.some((message) => message.includes('assigned to another duplicate')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { planGeneralBookDuplicateArchive, sameGeneralBook } from '../services/generalBookDuplicates.js';

const book = (id, title = 'The Book', author = 'The Author', extra = {}) => ({
  _id: id, title, author, format: 'physical', isPublished: true,
  totalCopies: 3, availableCopies: 3, ...extra
});

test('case/spacing variants are the same book; different authors are not', () => {
  assert.ok(sameGeneralBook(book('a', ' The  Book '), book('b', 'THE BOOK')));
  assert.equal(sameGeneralBook(book('a'), book('b', 'The Book', 'Other Writer')), false);
});

test('one canonical book stays visible; only extra record is archived', () => {
  const result = planGeneralBookDuplicateArchive([
    book('a', 'The Book', 'The Author', { sourceBookId: 'GEN001' }),
    book('b', ' the  book ', 'THE AUTHOR')
  ]);
  assert.equal(result.groups.length, 1);
  assert.equal(result.archive.length, 1);
  assert.equal(result.archive[0]._id, 'b');
});

test('an active loan on a duplicate blocks archiving the source-tagged canonical record', () => {
  const result = planGeneralBookDuplicateArchive([
    book('a', 'The Book', 'The Author', { sourceBookId: 'GEN001' }),
    book('b')
  ], new Map([['b', 1]]));
  assert.equal(result.archive.length, 0);
  assert.equal(result.blocked.length, 1);
});

test('multiple loan-bearing records are never archived', () => {
  const result = planGeneralBookDuplicateArchive([book('a'), book('b')], new Map([['a', 1], ['b', 1]]));
  assert.equal(result.archive.length, 0);
  assert.equal(result.blocked.length, 1);
});

test('title-only collisions with different authors are reported, not archived', () => {
  const result = planGeneralBookDuplicateArchive([book('a'), book('b', 'The Book', 'Other Writer')]);
  assert.equal(result.archive.length, 0);
  assert.equal(result.titleOnly.length, 1);
});

test('hidden/archived records do not appear as new duplicate candidates', () => {
  const result = planGeneralBookDuplicateArchive([book('a'), book('b','The Book','The Author',{isPublished:false})]);
  assert.equal(result.archive.length, 0);
});

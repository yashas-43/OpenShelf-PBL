/** Regression check for the General Books catalogue import on Mongoose. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Book from '../models/Book.js';
import { GENERAL_BOOK_TEXT_OPTIONS } from '../services/generalBookTextIndex.js';

test('Mongoose text-index options are mutable while shared settings stay protected', () => {
  const searchIndex = Book.schema.indexes().find(([, options]) =>
    options.name === GENERAL_BOOK_TEXT_OPTIONS.name
  );
  assert.ok(searchIndex, 'General Books text index should be registered');
  const [fields, options] = searchIndex;
  assert.ok(Object.keys(fields).length > 0);
  assert.ok(Object.isExtensible(options), 'Mongoose must be able to add its background option');
  assert.notStrictEqual(options, GENERAL_BOOK_TEXT_OPTIONS, 'Schema must not reuse frozen constants');
  assert.equal(GENERAL_BOOK_TEXT_OPTIONS.language_override, '_openshelfTextIndexLanguage');
});

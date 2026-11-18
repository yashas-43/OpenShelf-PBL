import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessGeneralBookTextIndex,
  GENERAL_BOOK_TEXT_FIELDS,
  GENERAL_BOOK_TEXT_OPTIONS
} from '../services/generalBookTextIndex.js';

const existing = (options = {}) => ({
  name: 'title_text_author_text_isbn_text_description_text',
  key: { _fts: 'text', _ftsx: 1 },
  weights: { title: 1, author: 1, isbn: 1, description: 1 },
  default_language: 'english',
  language_override: 'language',
  ...options
});

test('new text-index settings do not interpret original book languages as MongoDB stemmer names', () => {
  assert.equal(GENERAL_BOOK_TEXT_OPTIONS.default_language, 'none');
  assert.notEqual(GENERAL_BOOK_TEXT_OPTIONS.language_override, 'language');
  assert.deepEqual(Object.keys(GENERAL_BOOK_TEXT_FIELDS).sort(), ['author', 'description', 'isbn', 'title']);
});

test('legacy index is flagged for explicit repair', () => {
  assert.equal(assessGeneralBookTextIndex([existing()]).status, 'legacy');
});

test('repaired index is safe to leave unchanged', () => {
  assert.equal(assessGeneralBookTextIndex([existing(GENERAL_BOOK_TEXT_OPTIONS)]).status, 'healthy');
});

test('missing text index can be created', () => {
  assert.equal(assessGeneralBookTextIndex([{ name: '_id_', key: { _id: 1 } }]).status, 'missing');
});

test('repair refuses to discard custom weighted indexes or unrelated fields', () => {
  assert.throws(() => assessGeneralBookTextIndex([existing({ weights: { title: 5, author: 1, isbn: 1, description: 1 } })]), /Custom/);
  assert.throws(() => assessGeneralBookTextIndex([existing({ weights: { title: 1, author: 1 } })]), /Unexpected/);
});

test('repair refuses a desired-name conflict', () => {
  assert.throws(() => assessGeneralBookTextIndex([{ name: GENERAL_BOOK_TEXT_OPTIONS.name, key: { foo: 1 } }]), /already used/);
});

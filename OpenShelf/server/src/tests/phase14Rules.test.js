import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_TYPES, escapeSearchText, normalizeSearchOptions } from '../services/searchRules.js';
import { validNotificationLink } from '../services/notificationRules.js';

test('Phase 14 search limits collection types and page sizes', () => {
  assert.deepEqual(SEARCH_TYPES, ['all', 'general', 'student', 'peer']);
  const options = normalizeSearchOptions({ type: 'secret-users', page: '-10', limit: '900', q: '  textbook ' });
  assert.equal(options.type, 'all');
  assert.equal(options.page, 1);
  assert.equal(options.limit, 24);
  assert.equal(options.q, 'textbook');
});

test('Phase 14 global search escapes regex metacharacters', () => {
  const input = 'hello [world] .*(+)';
  const escaped = escapeSearchText(input);
  assert.equal(new RegExp(escaped, 'i').test(input), true);
  assert.equal(new RegExp(escaped).test('hello nonsense'), false);
  assert.equal(escapeSearchText(120), '');
  assert.ok(escapeSearchText('x'.repeat(200)).length <= 100);
});

test('Phase 14 notification links cannot lead outside the website', () => {
  assert.equal(validNotificationLink('#dashboard'), true);
  assert.equal(validNotificationLink('#peer-requests'), true);
  for (const unsafe of ['javascript:alert(1)', 'https://evil.example', '//example.com', '#unknown', '', null]) {
    assert.equal(validNotificationLink(unsafe), false);
  }
});

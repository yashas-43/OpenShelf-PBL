/** Public search accepts only these collection types; users are never searchable. */
export const SEARCH_TYPES = Object.freeze(['all', 'general', 'student', 'peer']);

export function escapeSearchText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSearchOptions(query = {}) {
  const type = SEARCH_TYPES.includes(query.type) ? query.type : 'all';
  const page = Math.max(1, Math.min(1000, Number.parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(24, Number.parseInt(query.limit, 10) || 12));
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const level = typeof query.level === 'string' ? query.level.trim() : '';
  const genre = typeof query.genre === 'string' ? query.genre.trim().slice(0, 80) : '';
  const available = query.available === 'true';
  return { type, page, limit, q, level, genre, available };
}

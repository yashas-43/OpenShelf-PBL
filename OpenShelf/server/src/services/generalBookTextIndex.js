/**
 * Search-index configuration for the multilingual General Books catalogue.
 *
 * MongoDB normally interprets a document's `language` field as a text-stemming
 * override. OpenShelf stores the book's *original* language there (for example,
 * Sanskrit or Kannada), which is not necessarily a MongoDB stemmer language.
 * Use a separate, unused override field and disable stemming so importing books
 * never requires changing their authentic language metadata.
 */
export const GENERAL_BOOK_TEXT_FIELDS = Object.freeze({
  title: 'text',
  author: 'text',
  isbn: 'text',
  description: 'text'
});

export const GENERAL_BOOK_TEXT_OPTIONS = Object.freeze({
  name: 'openshelf_books_search_text',
  default_language: 'none',
  language_override: '_openshelfTextIndexLanguage'
});

const expectedFields = Object.keys(GENERAL_BOOK_TEXT_FIELDS).sort();

/** Return the one MongoDB text index, if any. */
export function getGeneralBookTextIndex(indexes) {
  const textIndexes = indexes.filter((index) =>
    index?.key?._fts === 'text' ||
    Object.values(index?.key || {}).includes('text')
  );

  if (textIndexes.length > 1) {
    throw new Error('Several text indexes were found; review indexes manually before changing them.');
  }

  return textIndexes[0] || null;
}

/**
 * Fail closed when an unfamiliar index exists. This repair must not replace an
 * administrator-created search index covering different fields or weights.
 */
export function assessGeneralBookTextIndex(indexes) {
  const current = getGeneralBookTextIndex(indexes);
  if (!current) {
    const nameCollision = indexes.some((index) => index.name === GENERAL_BOOK_TEXT_OPTIONS.name);
    if (nameCollision) {
      throw new Error('The desired text-index name is already used by a different index.');
    }
    return { status: 'missing', current: null };
  }

  const weighted = current.weights ? Object.keys(current.weights).sort() : [];
  const fields = weighted.length ? weighted : Object.entries(current.key || {})
    .filter(([, kind]) => kind === 'text')
    .map(([name]) => name)
    .sort();

  if (JSON.stringify(fields) !== JSON.stringify(expectedFields)) {
    throw new Error(`Unexpected text-index fields: ${fields.join(', ') || 'unknown'}. Do not replace this index automatically.`);
  }

  if (current.weights && Object.values(current.weights).some((weight) => weight !== 1)) {
    throw new Error('Custom text-search weights detected. Review them before replacing the index.');
  }

  const healthy = current.name === GENERAL_BOOK_TEXT_OPTIONS.name &&
    current.default_language === GENERAL_BOOK_TEXT_OPTIONS.default_language &&
    current.language_override === GENERAL_BOOK_TEXT_OPTIONS.language_override;

  return { status: healthy ? 'healthy' : 'legacy', current };
}

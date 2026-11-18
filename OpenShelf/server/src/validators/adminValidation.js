/** Pure server-side admin input validation; frontend restrictions are never sufficient. */
export const GENERAL_GENRES = Object.freeze([
  'Fiction','Fantasy','Science Fiction','Mystery','Thriller','Horror','Romance','Historical Fiction',
  'Adventure','Biography','Autobiography','History','Science','Technology','Computer Science',
  'Mathematics','Philosophy','Psychology','Self-Help','Business','Economics','Politics','Sociology',
  'Religion and Spirituality','Travel','Health and Wellness','Education','Literature','Poetry',
  'Art and Design','Environment','Children’s Books'
]);

export function adminInputError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function objectIdOrError(value) {
  if (!/^[0-9a-fA-F]{24}$/.test(String(value || ''))) throw adminInputError('Invalid record identifier.');
  return value;
}
export function listOptions(query = {}, maxLimit = 40) {
  const number = (value, fallback) => /^\d+$/.test(String(value ?? '')) ? Number(value) : fallback;
  const page = Math.min(10000, Math.max(1, number(query.page, 1)));
  const limit = Math.min(maxLimit, Math.max(1, number(query.limit, 15)));
  return { page, limit, skip: (page - 1) * limit };
}
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const boundedSearch = (query) => String(query || '').trim().slice(0, 80);

function stringField(value, field, min = 0, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw adminInputError(`${field} must contain ${min}–${max} characters.`);
  }
  return value.trim();
}
function booleanField(value, field) {
  if (typeof value !== 'boolean') throw adminInputError(`${field} must be true or false.`);
  return value;
}
function moneyField(value, field, min = 0, max = 10000000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw adminInputError(`${field} must be a number between ${min} and ${max}.`);
  }
  return value;
}

export function validateBookUpdate(body, { creating = false } = {}) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw adminInputError('Book fields are required.');
  const allowed = ['title','author','genre','description','isbn','coverUrl','language','publisher','publishedYear',
    'price','totalCopies','isAvailableForBorrow','isAvailableForPurchase','isPublished'];
  const fields = {};
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw adminInputError(`${key} cannot be changed through book management.`);
    const value = body[key];
    if (['title','author','genre','description','isbn','coverUrl','language','publisher'].includes(key)) {
      const limits = { title: [1,200], author: [1,120], genre: [1,80], description: [1,5000], isbn: [0,50],
        coverUrl: [0,500], language: [1,80], publisher: [0,200] };
      fields[key] = stringField(value, key, ...limits[key]);
      if (key === 'genre' && !GENERAL_GENRES.includes(fields[key])) throw adminInputError('Select one of the 32 approved General Book genres.');
      if (key === 'coverUrl' && fields[key] && !/^\/api\/books\/[0-9a-fA-F]{24}\/cover$/.test(fields[key])) {
        try {
          const url = new URL(fields[key]);
          if (url.protocol !== 'https:') throw new Error('Not HTTPS');
        } catch { throw adminInputError('Cover image URL must be HTTPS.'); }
      }
    } else if (['isAvailableForBorrow','isAvailableForPurchase','isPublished'].includes(key)) {
      fields[key] = booleanField(value, key);
    } else if (key === 'totalCopies') {
      if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw adminInputError('Total copies must be an integer from 0 to 10000.');
      fields[key] = value;
    } else if (key === 'publishedYear') {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 2100)) throw adminInputError('Published year must be between 0 and 2100, or null.');
      fields[key] = value;
    } else if (key === 'price') fields[key] = moneyField(value, key);
  }
  if (creating && !['title','author','genre','description'].every((key) => fields[key])) {
    throw adminInputError('Title, author, approved genre and description are required.');
  }
  if (!Object.keys(fields).length) throw adminInputError('Provide at least one editable field.');
  return fields;
}

/** Inventory must reflect real active loans; administrators cannot set free stock independently. */
export function inventoryFromActiveLoans(totalCopies, activeLoans) {
  if (!Number.isSafeInteger(totalCopies) || !Number.isSafeInteger(activeLoans) || activeLoans < 0 || totalCopies < activeLoans) {
    throw adminInputError(`Total copies cannot be less than the ${activeLoans} existing active loan(s).`, 409);
  }
  return { totalCopies, availableCopies: totalCopies - activeLoans };
}

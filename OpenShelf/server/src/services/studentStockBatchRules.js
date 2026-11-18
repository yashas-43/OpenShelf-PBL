/**
 * Validate a single administrator stock save covering several Student Textbooks.
 * No stock is changed until every submitted row has passed validation.
 */
export function validateStudentStockBatch(updates) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > 100) {
    throw Object.assign(new Error('Choose between 1 and 100 textbook stock changes.'), { status: 400 });
  }
  const seen = new Set();
  return updates.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw Object.assign(new Error('Invalid stock change.'), { status: 400 });
    }
    const { id, totalCopies, expectedTotalCopies } = entry;
    if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
      throw Object.assign(new Error('Invalid textbook identifier.'), { status: 400 });
    }
    const key = id.toLowerCase();
    if (seen.has(key)) {
      throw Object.assign(new Error('Each textbook can be updated only once per save.'), { status: 400 });
    }
    seen.add(key);
    if (![totalCopies, expectedTotalCopies].every((n) =>
      Number.isSafeInteger(n) && n >= 0 && n <= 10000)) {
      throw Object.assign(new Error('Physical copies must be whole numbers from 0 to 10000.'), { status: 400 });
    }
    return { id, totalCopies, expectedTotalCopies };
  });
}

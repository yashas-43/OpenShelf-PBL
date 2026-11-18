/** Stock migration policy: exactly three owned copies per physical General Book.
 * Active historical requests/loans still hold a copy; they are never erased.
 */
export const STANDARD_PHYSICAL_COPIES = 3;

export function planThreeCopies(books, activeCounts) {
  if (books.length === 0) throw new Error('No physical General Books found; no stock changes made.');
  return books.map((book) => {
    const active = Number(activeCounts.get(String(book._id)) || 0);
    if (!Number.isInteger(active) || active < 0 || active > STANDARD_PHYSICAL_COPIES) {
      throw new Error(`Book ${book._id} (${book.title}) has ${active} active borrowing records. Resolve excess loans before setting stock to 3.`);
    }
    return {
      _id: book._id,
      title: book.title,
      totalCopies: STANDARD_PHYSICAL_COPIES,
      availableCopies: STANDARD_PHYSICAL_COPIES - active,
      changed: book.totalCopies !== STANDARD_PHYSICAL_COPIES
        || book.availableCopies !== STANDARD_PHYSICAL_COPIES - active
    };
  });
}

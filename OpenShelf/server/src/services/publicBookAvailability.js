/** Public catalogue view. Physical inventory numbers and borrower identities are never exposed. */
export function publicBookView(book, deadlineInfo = {}) {
  const { totalCopies, availableCopies, ...publicFields } = book;
  const isBorrowable = Boolean(book.isAvailableForBorrow && Number(availableCopies) > 0);
  return {
    ...publicFields,
    isBorrowable,
    nextExpectedReturnAt: isBorrowable ? null : deadlineInfo.nextExpectedReturnAt || null,
    hasOverdueLoans: !isBorrowable && Boolean(deadlineInfo.hasOverdueLoans)
  };
}

export function expectedReturnsByBook(rows, now = new Date()) {
  const result = new Map();
  for (const row of rows) {
    const dueDates = (row.dueDates || []).map((date) => new Date(date)).filter((date) => Number.isFinite(date.getTime()));
    const future = dueDates.filter((date) => date.getTime() >= now.getTime()).sort((a, b) => a - b);
    result.set(String(row._id), {
      nextExpectedReturnAt: future[0] || null,
      hasOverdueLoans: dueDates.some((date) => date.getTime() < now.getTime())
    });
  }
  return result;
}

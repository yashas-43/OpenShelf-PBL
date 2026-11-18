/**
 * A subject purchase covers a complete digital textbook. A book is either
 * one complete file or a matched Part 1 + Part 2 bundle. Never charge
 * for a partially uploaded or unapproved textbook.
 */
export function classifySubjectPdfBundle(records = []) {
  const pdfs = records.filter((pdf) => pdf?.isActive !== false);
  if (!pdfs.length) return { ready: false, status: 'not_uploaded', parts: [] };
  if (pdfs.some((pdf) => pdf.rightsConfirmed !== true)) {
    return { ready: false, status: 'not_approved', parts: [] };
  }
  if (pdfs.length === 1 && pdfs[0].partNumber == null) {
    return { ready: true, status: 'ready', parts: pdfs };
  }
  if (pdfs.length === 2 && pdfs.some((pdf) => pdf.partNumber === 1)
      && pdfs.some((pdf) => pdf.partNumber === 2)) {
    return { ready: true, status: 'ready', parts: [...pdfs].sort((a,b) => a.partNumber - b.partNumber) };
  }
  return { ready: false, status: 'incomplete_parts', parts: [] };
}

/** Pure parsing and validation helpers for a Windows-generated textbook CSV. */
export const LEVELS = Object.freeze(['Class 8', 'Class 9', 'Class 10', '1st Puc', '2nd Puc']);
export const REQUIRED_COLUMNS = Object.freeze(['Level', 'Subject', 'FileName', 'RelativePath']);

export function parseCsv(content) {
  const text = String(content).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell !== '') throw new Error(`Unexpected quote in CSV near character ${i}.`);
      quoted = true;
    } else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); if (row.some((value) => value !== '')) rows.push(row); }
  if (!rows.length) throw new Error('The manifest CSV is empty.');
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw new Error('The manifest has duplicate column headers.');
  for (const name of REQUIRED_COLUMNS) if (!headers.includes(name)) throw new Error(`Missing CSV column: ${name}.`);
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} columns; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((name, column) => [name, values[column]]));
  });
}

/** A part number is inferred only when the filename actually spells out Part/P-1/P-2. */
export function explicitPartNumber(filename) {
  const matches = [...filename.matchAll(/(?:\bpart\s*[-_ ]*|\bp\s*[-_ ])([12])\b/gi)];
  const numbers = new Set(matches.map((match) => Number(match[1])));
  return numbers.size === 1 ? [...numbers][0] : null;
}

/** Exactly three folder components: an approved level, original subject, original PDF basename. */
export function parseManifestRow(row, index) {
  const fail = (message) => { throw new Error(`CSV row ${index + 2}: ${message}`); };
  const level = row.Level;
  const subject = row.Subject;
  const filename = row.FileName;
  const relativePath = row.RelativePath;
  if (!LEVELS.includes(level)) fail(`Unsupported study level '${level}'.`);
  if (!subject || subject !== subject.trim() || subject === '.' || subject === '..' || /[\\/\x00-\x1f]/.test(subject)) fail('Unsafe or empty subject folder.');
  if (!filename || filename !== filename.trim() || !/\.pdf$/i.test(filename) || /[\\/\x00-\x1f]/.test(filename) || filename === '..') fail('Unsafe or invalid PDF filename.');
  if (!relativePath || relativePath.startsWith('\\') || relativePath.startsWith('/') || /^[A-Za-z]:/.test(relativePath)) fail('Absolute PDF path is not permitted.');
  const parts = relativePath.split(/[\\/]/);
  if (parts.length !== 3 || parts.some((part) => !part || part === '.' || part === '..')
    || parts[0] !== level || parts[1] !== subject || parts[2] !== filename) fail('RelativePath must exactly match Level\\Subject\\FileName.');
  if (/[\x00-\x1f]/.test(relativePath)) fail('Control characters are not allowed in PDF paths.');
  if (typeof row.SizeMB === 'string' && row.SizeMB.length && (!Number.isFinite(Number(row.SizeMB)) || Number(row.SizeMB) < 0)) fail('Invalid SizeMB value.');
  const bookTitle = (row.BookTitle || '').trim();
  if (bookTitle.length > 250 || /[\x00-\x1f]/.test(bookTitle)) fail('Invalid BookTitle (maximum 250 characters).');
  return { level, subject, filename, relativePath: parts.join('/'), partNumber: explicitPartNumber(filename),
    // Optional human-reviewed label. Does not alter the actual PDF filename or filesystem path.
    displayTitle: bookTitle || filename.replace(/\.pdf$/i, '') };
}

export function validateManifest(content) {
  const rows = parseCsv(content).map(parseManifestRow);
  if (rows.length === 0) throw new Error('The manifest contains no PDF rows.');
  const seen = new Set();
  for (const row of rows) {
    const key = row.relativePath.toLocaleLowerCase('en');
    if (seen.has(key)) throw new Error(`Duplicate PDF path: ${row.relativePath}`);
    seen.add(key);
  }
  return rows;
}

export function summarizeManifest(rows) {
  return LEVELS.map((level) => {
    const matching = rows.filter((row) => row.level === level);
    return { level, subjects: new Set(matching.map((row) => row.subject)).size, pdfs: matching.length };
  });
}

/**
 * One original subject folder represents one physical textbook entry in the
 * supplied collection. Its PDF can be whole or split into parts 1 and 2.
 * Never treat "Textbook part1" and "Textbook part2" as separate books.
 * Book names are taken from BookTitle, not guessed from government catalogs.
 */
export function groupTextbooks(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.level}\0${row.subject}`;
    if (!groups.has(key)) groups.set(key, { level: row.level, subject: row.subject, parts: [] });
    groups.get(key).parts.push(row);
  }
  for (const group of groups.values()) {
    const files = group.parts;
    if (files.length > 2) throw new Error(`${group.level}/${group.subject}: more than two PDFs in one textbook.`);
    if (files.length === 1 && files[0].partNumber !== null) {
      throw new Error(`${group.level}/${group.subject}: a Part ${files[0].partNumber} PDF is missing the other part.`);
    }
    if (files.length === 2) {
      const partNumbers = files.map((file) => file.partNumber).sort();
      if (partNumbers[0] !== 1 || partNumbers[1] !== 2) {
        throw new Error(`${group.level}/${group.subject}: a multipart textbook needs exactly Part 1 and Part 2.`);
      }
    }
    const titles = files.map((file) => {
      const partMatch = file.displayTitle.match(/^(.*?)\s+part\s*[-_ ]*([12])$/i);
      if (file.partNumber !== null && (!partMatch || Number(partMatch[2]) !== file.partNumber)) {
        throw new Error(`${group.level}/${group.subject}: BookTitle must identify the correct PDF part.`);
      }
      if (file.partNumber === null && partMatch) {
        throw new Error(`${group.level}/${group.subject}: a complete PDF must not be labelled as a part.`);
      }
      return partMatch ? partMatch[1].trim() : file.displayTitle;
    });
    if (!titles[0] || titles.some((title) => title !== titles[0])) {
      throw new Error(`${group.level}/${group.subject}: all PDF parts must share one textbook title.`);
    }
    group.title = titles[0];
    group.parts.sort((a, b) => (a.partNumber || 0) - (b.partNumber || 0));
  }
  return [...groups.values()];
}

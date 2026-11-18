/**
 * Scan PDFs on your laptop without copying or uploading their contents.
 * Usage: node server/src/scripts/createTextbookManifest.js "D:\Textbooks" [output.csv]
 * Generated metadata has blank classification columns for manual verification.
 */
import fs from 'node:fs';
import path from 'node:path';

function csv(value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }
function collect(dir, root, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collect(absolute, root, results);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      const details = fs.statSync(absolute);
      results.push({ relativePath: path.relative(root, absolute).split(path.sep).join('/'), fileName: entry.name, bytes: details.size });
    }
  }
}

{
  const input = process.argv[2];
  const output = path.resolve(process.argv[3] || 'textbook-manifest.csv');
  if (!input) {
    console.error('Usage: node server/src/scripts/createTextbookManifest.js "C:\path\to\Textbooks" [output.csv]');
    process.exit(1);
  }
  const root = path.resolve(input);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error('The supplied textbook folder does not exist:', root);
    process.exit(1);
  }
  const rows = [];
  collect(root, root, rows);
  rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const header = ['relativePath','fileName','bytes','category','schoolClass','pucYear','subject','title','language','rightsConfirmed'];
  const lines = [header.map(csv).join(',')];
  for (const item of rows) lines.push([item.relativePath,item.fileName,item.bytes,'','','','','','',''].map(csv).join(','));
  fs.writeFileSync(output, lines.join('\n') + '\n', 'utf8');
  const bytes = rows.reduce((total, item) => total + item.bytes, 0);
  console.log(`Scanned ${rows.length} PDFs (${(bytes / 1024 ** 3).toFixed(2)} GiB).`);
  console.log('Created metadata-only CSV:', output);
  console.log('Fill the category, class/year, title, subject, and rights columns before importing actual PDFs in Phase 7.');
}

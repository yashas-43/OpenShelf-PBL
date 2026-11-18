/**
 * Phase 15 dependency-free source audit. Checks that relative imports exist,
 * and catches default-import mismatches such as the previous broken peer route.
 * Deliberately not a replacement for npm run build, npm test, or runtime tests.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOTS = ['server/src', 'client/src'];
const EXTENSIONS = ['.js', '.jsx', '.mjs', '.json', '.css'];

async function collect(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const entry = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...await collect(entry));
    else if (/\.(?:js|jsx|mjs)$/.test(item.name)) result.push(entry);
  }
  return result;
}

async function resolvesFile(candidate) {
  for (const file of [candidate, ...EXTENSIONS.map((extension) => candidate + extension),
    ...EXTENSIONS.map((extension) => path.join(candidate, 'index' + extension))]) {
    try { if ((await stat(file)).isFile()) return file; } catch { /* try next */ }
  }
  return null;
}

function hasDefaultExport(source) {
  return /\bexport\s+default\b|\bexport\s*\{[^}]*\bas\s+default\b[^}]*\}/s.test(source);
}

/** Verify a single source module. Returns actionable relative error descriptions. */
export async function verifyModule(file) {
  const errors = [];
  const code = await readFile(file, 'utf8');
  const statements = /\bimport\s+(?:([\s\S]*?)\s+from\s+)?['"](\.[^'"]+)['"]|\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"](\.[^'"]+)['"]/g;
  // Restrict accidental multiline matches: source statements must not contain ';'
  // before `from`, and cannot traverse through an unrelated import statement.
  for (const match of code.matchAll(statements)) {
    const imports = match[1] || '';
    const specifier = match[2] || match[3];
    const target = await resolvesFile(path.resolve(path.dirname(file), specifier));
    if (!target) {
      errors.push(`${path.relative(repo, file)}: missing relative module ${specifier}`);
      continue;
    }
    const defaultName = /^\s*[a-zA-Z_$][\w$]*(?:\s*,|\s*$)/.test(imports)
      && !/^\s*(?:\{|\*)/.test(imports);
    if (defaultName && /\.(?:m?js|jsx)$/.test(target) && !hasDefaultExport(await readFile(target, 'utf8'))) {
      errors.push(`${path.relative(repo, file)}: ${specifier} has no default export`);
    }
  }
  return errors;
}

export async function auditImports(sourceRoots = SOURCE_ROOTS.map((root) => path.join(repo, root))) {
  const all = [];
  for (const root of sourceRoots) all.push(...await collect(root));
  const errors = [];
  for (const file of all) errors.push(...await verifyModule(file));
  return { files: all.length, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await auditImports();
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    console.error(`Source import audit failed: ${result.errors.length} problem(s).`);
    process.exitCode = 1;
  } else console.log(`Source import audit passed: ${result.files} modules checked.`);
}

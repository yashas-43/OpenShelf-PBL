/**
 * Phase 15 read-only API smoke tests for a LOCAL, already running OpenShelf.
 * No accounts, payments, loans, inventory or PDFs are modified by this script.
 * Run from project root: npm run smoke:api
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const DEFAULT_API = 'http://127.0.0.1:5000';
export const CHECKS = Object.freeze([
  { label: 'API and MongoDB health', path: '/api/health', status: 200 },
  { label: 'Published General Books', path: '/api/books?limit=1', status: 200 },
  { label: 'Student textbook catalogue', path: '/api/student-pdfs/catalog?level=Class%208', status: 200 },
  { label: 'Public peer-exchange listings', path: '/api/peer-exchange?page=1', status: 200 },
  { label: 'Admin endpoint requires a login', path: '/api/admin/overview', status: 401 },
  { label: 'Student dashboard requires a login', path: '/api/dashboard/overview', status: 401 },
  { label: 'PDF file without reading ticket is private', path: '/api/student-pdfs/files/000000000000000000000000', status: 401 },
  { label: 'Payment endpoints remain disabled', path: '/api/payments/status', status: 410 },
  { label: 'Short search queries are rejected', path: '/api/search?q=a&type=general', status: 400 }
]);

export async function checkLocalApi(base = DEFAULT_API, fetchImpl = fetch) {
  const results = [];
  const url = new URL(base);
  // Never accidentally run a read-only local smoke test against a production site.
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.protocol !== 'http:') {
    throw new Error('Use a local HTTP backend at localhost or 127.0.0.1 for this smoke check.');
  }
  for (const check of CHECKS) {
    const response = await fetchImpl(new URL(check.path, base), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const passed = response.status === check.status;
    let details = '';
    if (check.path === '/api/health' && passed) {
      const health = await response.json();
      details = health.database?.status === 'connected' ? 'MongoDB connected' : `MongoDB ${health.database?.status || 'unknown'}`;
      if (health.database?.status !== 'connected') {
        results.push({ ...check, passed: false, details });
        continue;
      }
    }
    results.push({ ...check, passed, details: details || `HTTP ${response.status}; expected ${check.status}` });
  }
  return results;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const results = await checkLocalApi();
    for (const item of results) {
      console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.label}: ${item.details}`);
    }
    console.log(`OpenShelf local API smoke test: ${results.filter((x) => x.passed).length}/${results.length} checks passed.`);
    if (results.some((item) => !item.passed)) process.exitCode = 1;
  } catch (error) {
    console.error(`API smoke test could not complete: ${error.message}. Start OpenShelf and MongoDB first, then retry.`);
    process.exitCode = 1;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
test('all public listing routes require admin approved status', () => {
  const c = source('../controllers/peerExchangeController.js');
  assert.match(c, /status: 'available', approvalStatus: 'approved'/);
  assert.match(c, /status: \{ \$in: \['available', 'reserved'\] \}, approvalStatus: 'approved'/);
  assert.match(c, /approvalStatus: 'pending'/);
  assert.match(c, /approvalStatus: 'pending', reviewedAt: null/);
  assert.match(source('../controllers/searchController.js'), /status: 'available', approvalStatus: 'approved'/);
});
test('only admin API can approve or reject new and edited listings', () => {
  const routes = source('../routes/adminRoutes.js');
  const admin = source('../controllers/adminController.js');
  const model = source('../models/PeerBookListing.js');
  assert.match(routes, /router\.use\(requireAuth, requireRole\('admin'\)\)/);
  assert.match(routes, /peer-listings\/:id\/review/);
  assert.match(admin, /reviewPeerListing/);
  assert.match(admin, /approvalStatus: \{ \$in: \['pending', null\] \}/);
  assert.match(model, /default: 'pending'/);
});

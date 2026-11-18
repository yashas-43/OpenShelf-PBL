import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditImports, verifyModule } from './verifySourceImports.mjs';

async function withFixture(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openshelf-import-audit-'));
  try { await callback(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('source import audit finds previous missing default route-export bug', async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, 'routes.js'), 'export const router = {};\n');
    await writeFile(path.join(dir, 'app.js'), "import router from './routes.js';\n");
    const result = await verifyModule(path.join(dir, 'app.js'));
    assert.equal(result.length, 1);
    assert.match(result[0], /has no default export/);
  });
});

test('source import audit accepts default, named and side-effect imports', async () => {
  await withFixture(async (dir) => {
    await mkdir(path.join(dir, 'helpers'));
    await writeFile(path.join(dir, 'helpers', 'index.js'), 'export default 5; export const item = 6;\n');
    await writeFile(path.join(dir, 'app.js'), "import item, { item as named } from './helpers/index.js';\nimport './helpers/index.js';\n");
    assert.deepEqual(await verifyModule(path.join(dir, 'app.js')), []);
  });
});

test('source import audit identifies a missing local file', async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, 'app.js'), "import './not-present.js';\n");
    assert.match((await verifyModule(path.join(dir, 'app.js')))[0], /missing relative module/);
  });
});

test('full current OpenShelf source has resolvable relative imports', async () => {
  const result = await auditImports();
  assert.ok(result.files >= 140);
  assert.deepEqual(result.errors, []);
});

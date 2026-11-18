import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, checkLocalApi } from './smokeApi.mjs';

test('local smoke requests require no credentials and never write to MongoDB', async () => {
  const paths = [];
  const fakeFetch = async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.method, 'GET');
    const item = CHECKS.find((check) => check.path === `${url.pathname}${url.search}`);
    return {
      status: item.status,
      json: async () => ({ success: true, database: { status: 'connected' } })
    };
  };
  const result = await checkLocalApi('http://127.0.0.1:5000', fakeFetch);
  assert.equal(result.length, CHECKS.length);
  assert.ok(result.every((item) => item.passed));
  assert.ok(paths.every((path) => path.startsWith('/api/')));
});

test('smoke script rejects public or non-local URLs', async () => {
  await assert.rejects(checkLocalApi('https://some-public-service.com'), /local HTTP/);
});

test('health check fails if MongoDB is disconnected', async () => {
  const result = await checkLocalApi('http://localhost:5000', async (url) => ({
    status: CHECKS.find((check) => check.path === `${url.pathname}${url.search}`).status,
    json: async () => ({ database: { status: 'disconnected' } })
  }));
  assert.equal(result[0].passed, false);
});

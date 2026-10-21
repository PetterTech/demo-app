import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const moduleUrl = new URL('../server.mjs', import.meta.url);
async function withServer(env, check) {
  assert.ok(existsSync(moduleUrl), 'server implementation must exist');
  const { createApp } = await import(moduleUrl);
  const server = createApp({ env });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await check(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('only explicit public assets are served, with safe methods and a health endpoint', async () => {
  await withServer({}, async base => {
    for (const path of ['/', '/app.js', '/style.css', '/logo.png', '/montserrat-semibold.ttf', '/healthz']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('content-security-policy').includes("default-src 'self'"));
    }
    for (const path of ['/server.mjs', '/.env', '/package.json', '/..%2fserver.mjs', '/%ZZ']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    const head = await fetch(`${base}/api/runtime`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
});

test('standalone mode is honest and invalid accent values are rejected', async () => {
  await withServer({ DEMO_ACCENT: 'url(https://example.com)', DEMO_VERSION: '2.0', BUILD_COMMIT: 'abc123', DEMO_MESSAGE: 'x'.repeat(500) }, async base => {
    const data = await (await fetch(`${base}/api/runtime`)).json();
    assert.equal(data.platform, 'Standalone container / process');
    assert.equal(data.accent, '#F4D64C');
    assert.equal(data.revision, 'Not provided');
    assert.equal(data.version, '2.0');
    assert.equal(data.commit, 'abc123');
    assert.equal(data.message.length, 256);
  });
});

test('runtime endpoint returns real process data and only explicitly public configuration', async () => {
  await withServer({ CONTAINER_APP_NAME: 'test-app', CONTAINER_APP_REVISION: 'test-app--v2', CONTAINER_APP_REPLICA_NAME: 'replica-a', DEMO_MESSAGE: '<script>bad()</script>', DATABASE_PASSWORD: 'never-expose-this', AZURE_CLIENT_SECRET: 'secret-token' }, async base => {
    const response = await fetch(`${base}/api/runtime`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.app, 'test-app');
    assert.equal(data.revision, 'test-app--v2');
    assert.equal(data.replica, 'replica-a');
    assert.equal(data.platform, 'Azure Container Apps');
    assert.equal(data.runtime, process.version);
    assert.ok(data.processRssBytes > 0);
    assert.ok(data.processUptimeSeconds >= 0);
    assert.equal(data.os, process.platform);
    assert.equal(data.architecture, process.arch);
    assert.ok(data.timestamp);
    assert.equal(data.accent, '#F4D64C');
    assert.equal(data.version, '1.0.0');
    assert.equal(data.commit, null);
    assert.ok(data.containerMemoryLimitBytes === null || data.containerMemoryLimitBytes > 0);
    assert.ok(data.containerMemoryUsageBytes === null || data.containerMemoryUsageBytes > 0);
    assert.equal(data.message, '<script>bad()</script>');
    assert.ok(!JSON.stringify(data).includes('never-expose-this'));
    assert.ok(!JSON.stringify(data).includes('secret-token'));
  });
});

import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
const server = createApp();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.notEqual(process.getuid(), 0, 'must run as non-root');
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(base)).status, 200);
  const data = await (await fetch(`${base}/api/runtime`)).json();
  assert.equal(data.containerMemoryLimitBytes, 256 * 1024 * 1024);
  assert.ok(data.containerMemoryUsageBytes > 0);
  assert.equal(data.platform, 'Standalone container / process');
  assert.equal(data.revision, 'Not provided');
  console.log(JSON.stringify({ passed: true, uid: process.getuid(), runtime: data.runtime, memoryLimitBytes: data.containerMemoryLimitBytes, memoryUsageBytes: data.containerMemoryUsageBytes, app: data.app, architecture: data.architecture }, null, 2));
} finally { await new Promise(resolve => server.close(resolve)); }

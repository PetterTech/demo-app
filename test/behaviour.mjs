import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { createApp } from '../server.mjs';

// Explicit integration fixtures: two real HTTP servers, not real Azure deployments.
const fixtures = [
  { CONTAINER_APP_NAME: 'integration-fixture', CONTAINER_APP_REVISION: 'fixture--v1', CONTAINER_APP_REPLICA_NAME: 'fixture-a', DEMO_MESSAGE: '<img src=x onerror=alert(1)>', DEMO_ACCENT: '#66CCFF' },
  { CONTAINER_APP_NAME: 'integration-fixture', CONTAINER_APP_REVISION: 'fixture--v2', CONTAINER_APP_REPLICA_NAME: 'fixture-b', DEMO_MESSAGE: 'Revision two', DEMO_ACCENT: '#F4D64C' },
];
const servers = fixtures.map(env => createApp({ env }));
for (const server of servers) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let active = 0;
let unavailable = false;
const gateway = http.createServer(async (req, res) => {
  if (unavailable && req.url === '/api/runtime') { res.writeHead(503); res.end(); return; }
  try {
    const upstream = await fetch(`http://127.0.0.1:${servers[active].address().port}${req.url}`);
    res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { res.writeHead(502); res.end(); }
});
await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${gateway.address().port}`);
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'LIVE');
  await page.getByRole('button', { name: 'Auto-refresh: on' }).click();
  assert.equal(await page.locator('#message').innerText(), fixtures[0].DEMO_MESSAGE);
  assert.equal(await page.locator('#message img').count(), 0, 'untrusted configuration renders only as text');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent')), '#66CCFF');
  active = 1;
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#replica').textContent === 'fixture-b');
  assert.equal(await page.locator('#revision').innerText(), 'fixture--v2');
  assert.match(await page.locator('#replica-event').innerText(), /INSTANCE CHANGED/);
  unavailable = true;
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'OFFLINE');
  assert.ok(await page.locator('#error').isVisible());
  assert.ok(await page.locator('body').evaluate(body => body.classList.contains('stale')));
  unavailable = false;
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'LIVE');
  assert.ok(await page.locator('#error').isHidden());
  assert.deepEqual(errors, []);
  console.log('PASS: real HTTP integration fixtures — safe text rendering, accent configuration, revision/replica change, manual refresh, offline/stale state and recovery');
} finally {
  await browser.close();
  await new Promise(resolve => gateway.close(resolve));
  for (const server of servers) await new Promise(resolve => server.close(resolve));
}

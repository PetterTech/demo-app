import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createApp } from '../server.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('artifacts', { recursive: true });
const server = process.env.BASE_URL ? null : createApp();
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: 'artifacts/video', size: { width: 1600, height: 1000 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(base);
  assert.equal(response.status(), 200, 'designed home page must be served');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'LIVE');
  assert.ok(await page.locator('#app-name').innerText());
  assert.ok(await page.locator('#replica').innerText());
  assert.ok(await page.locator('#logo').evaluate(img => img.complete && img.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
  const canvas = page.locator('#network');
  // Read the canvas buffer, not a composited screenshot containing live foreground text.
  const pixels = () => canvas.evaluate(element => element.toDataURL());
  const frame1 = await pixels();
  await page.waitForTimeout(400);
  const frame2 = await pixels();
  assert.notEqual(frame1, frame2, 'background must really move');
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await page.waitForTimeout(100);
  const still1 = await pixels();
  await page.waitForTimeout(350);
  assert.equal(still1, await pixels(), 'paused canvas must stop');
  await page.getByRole('button', { name: 'Resume motion' }).click();
  await page.getByText('Technical details', { exact: true }).click();
  assert.ok(await page.locator('#runtime').isVisible());
  await page.getByText('Technical details', { exact: true }).click();
  const previous = await page.locator('#request-count').innerText();
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await page.waitForFunction(before => document.querySelector('#request-count').textContent !== before, previous);
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
  await page.waitForTimeout(4500);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile must not overflow');
  assert.deepEqual(errors, [], 'no browser errors');
  await context.close();
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const quiet = await reduced.newPage();
  await quiet.goto(base);
  await quiet.waitForFunction(() => document.querySelector('#status')?.textContent === 'LIVE');
  assert.equal(await quiet.getByRole('button', { name: 'Resume motion' }).count(), 1, 'reduced motion defaults to paused');
  await reduced.close();
  console.log('PASS: live runtime UI, real animation, pause/resume, request button, technical details, mobile layout, reduced motion, no JS errors');
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}

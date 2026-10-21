import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL;
assert.ok(base, 'Set BASE_URL to the real running container');
mkdirSync('artifacts/preview-video', { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: 'artifacts/preview-video', size: { width: 1600, height: 1000 } } });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'LIVE');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/PetterTech-container-preview.png', fullPage: true });
  await page.waitForTimeout(10000);
  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  writeFileSync('artifacts/preview-video-path.txt', videoPath);
  console.log('Recorded actual running Docker app:', videoPath);
} finally { await browser.close(); }

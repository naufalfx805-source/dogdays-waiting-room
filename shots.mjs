import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3210';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

// headless: true would pick chrome-headless-shell; use full chromium
const browser = await chromium.launch({ channel: 'chromium' });
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1200 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('h2', { timeout: 20000 });
  await page.waitForTimeout(600);

  await page.screenshot({ path: `${OUT}/full-${scheme}.png`, fullPage: true });

  // section crops for the writeup
  const shots = {
    hero: 'header',
    colours: 'figure:nth-of-type(1)',
  };
  for (const [name, sel] of Object.entries(shots)) {
    const el = await page.$(sel);
    if (el) await el.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
  }

  const h = await page.evaluate(() => document.body.scrollHeight);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`${scheme}: height=${h}px horizontal-overflow=${overflow} console-errors=${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log('   !', e.slice(0, 160)));
  await page.close();
}

// mobile check
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto(BASE, { waitUntil: 'networkidle' });
await m.waitForSelector('h2', { timeout: 20000 });
const mo = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
await m.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });
console.log('mobile 390px: horizontal-overflow=', mo);
await browser.close();

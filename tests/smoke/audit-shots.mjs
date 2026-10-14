/**
 * A temporary audit harness: photograph the shipped interface at the shapes it ships on, and print
 * the numbers that the frames are judged by. Not a test — nothing here asserts. It exists so a
 * human (or an agent) can look at the product instead of at a stale JPEG.
 *
 *   node tests/smoke/audit-shots.mjs http://127.0.0.1:4179/puffly/ /tmp/puffly-audit
 */
import { mkdir } from 'node:fs/promises';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const OUT = process.argv[3] ?? '/tmp/puffly-audit';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];
const ENGINE = process.env['PUFFLY_BROWSER'] ?? 'chromium';

const playwright = await import(PLAYWRIGHT_SPEC);
const browserType = playwright[ENGINE];
const browser = await browserType.launch(
  CHROME !== undefined ? { executablePath: CHROME } : ENGINE === 'chromium' ? { channel: 'chromium' } : {},
);
await mkdir(OUT, { recursive: true });

const SHAPES = [
  { name: 'phone-portrait', width: 393, height: 852, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
  { name: 'wide', width: 1680, height: 900, touch: false },
];

const affordanceOf = (page) =>
  page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
const waitLit = async (page, withinMs = 6000) => {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const a = await affordanceOf(page);
    if (a === 'puff' || a === 'flick') return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(120);
  }
};

/** The pill renders with `opacity: 0` in the 3D tier (the scene draws it), so a real click through
 *  Playwright's visibility gate is not available; the suite presses it by its box, and so do we. */
async function pressPill(page) {
  const box = await page.locator('.pill').boundingBox();
  if (box === null) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

async function wakeChrome(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await page.locator('.pill').boundingBox();
    if (box !== null && box.width > 1 && box.height > 1) {
      const awake = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return el !== null && el.closest('.pill') !== null;
        },
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      if (awake) return;
    }
    await page.locator('canvas').click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(150);
  }
}

for (const shape of SHAPES) {
  const context = await browser.newContext({
    viewport: { width: shape.width, height: shape.height },
    deviceScaleFactor: 2,
    hasTouch: shape.touch,
    isMobile: shape.touch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page.waitForSelector('.stage', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${shape.name}-idle.png` });

  // Drive a real break: pick the rod up, light it, take a few draws.
  await wakeChrome(page);
  let lit = false;
  for (let step = 0; step < 8 && !lit; step += 1) {
    await pressPill(page);
    await page.waitForTimeout(700);
    lit = await waitLit(page, 1500);
  }
  for (let i = 0; i < 5; i += 1) {
    await pressPill(page);
    await page.waitForTimeout(420);
  }
  await page.screenshot({ path: `${OUT}/${shape.name}-break.png` });

  // The chrome folded away, and the scene with nothing over it.
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${shape.name}-rested.png` });

  const read = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const hud = document.querySelector('.hud');
    const rail = document.querySelector('nav.rail');
    const pillEl = document.querySelector('.pill');
    const cta = document.querySelector('.cta');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const canvas = document.querySelector('canvas');
    return {
      phase: stage?.dataset.phase,
      canvas: box(canvas),
      hud: box(hud),
      rail: box(rail),
      pill: box(pillEl),
      cta: box(cta),
      desk: box(document.querySelector('.desk')),
      sheets: [...document.querySelectorAll('.sheet')].map((s) => ({
        id: s.dataset.sheet,
        open: s.dataset.open,
        box: box(s),
      })),
      scene3d: document.documentElement.className,
    };
  });
  console.log(`\n=== ${shape.name} ${shape.width}x${shape.height} lit=${lit} ===`);
  console.log(JSON.stringify(read, null, 1));
  if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 6));
  await context.close();
}

await browser.close();
console.log(`\nwrote frames to ${OUT}`);

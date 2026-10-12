/**
 * Photograph the sheets the player actually reads — achievements among them — at the shapes the
 * product ships on. Not a test; this exists so the interface can be judged by looking at it.
 *
 *   node tests/smoke/sheet-shots.mjs http://127.0.0.1:4179/puffly/ /tmp/puffly-sheets
 */
import { mkdir } from 'node:fs/promises';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const OUT = process.argv[3] ?? '/tmp/puffly-sheets';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch(
  CHROME !== undefined ? { executablePath: CHROME } : { channel: 'chromium' },
);
await mkdir(OUT, { recursive: true });

const SHAPES = [
  { name: 'phone', width: 393, height: 852, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
];

for (const shape of SHAPES) {
  const context = await browser.newContext({
    viewport: { width: shape.width, height: shape.height },
    deviceScaleFactor: 2,
    hasTouch: shape.touch,
  });
  const page = await context.newPage();
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page.waitForSelector('.stage');
  await page.waitForTimeout(1800);

  // Every sheet, opened by its own handle. On a wide window the desk column's buttons are the
  // handles; on a phone the bottom rail is.
  const handles = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-hook], .entry, nav.rail button')) {
      const hook = el.dataset.hook ?? el.dataset.entry ?? el.textContent?.trim() ?? '';
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) {
        out.push({ hook: String(hook).slice(0, 24), x: r.x + r.width / 2, y: r.y + r.height / 2 });
      }
    }
    return out;
  });
  console.log(`\n=== ${shape.name} handles: ${handles.map((h) => h.hook).join(' | ')}`);

  for (const h of handles.slice(0, 14)) {
    await page.mouse.click(h.x, h.y);
    await page.waitForTimeout(600);
    const open = await page.evaluate(() =>
      [...document.querySelectorAll('.sheet')]
        .filter((s) => s.dataset.open === 'true')
        .map((s) => s.dataset.sheet),
    );
    if (open.length === 0) continue;
    const name = `${shape.name}-${open.join('-')}`;
    await page.screenshot({ path: `${OUT}/${name}.png` });
    // Scroll the open sheet down, so long content is photographed rather than only its top.
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('.sheet')].find((x) => x.dataset.open === 'true');
      if (s) s.scrollTop = s.scrollHeight;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-bottom.png` });
    console.log(`  wrote ${name}.png`);
    // Close it again.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await context.close();
}
await browser.close();
console.log(`\nwrote sheets to ${OUT}`);

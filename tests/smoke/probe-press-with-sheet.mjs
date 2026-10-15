// Does an open panel stop the pill from igniting? A clean page ignites with either press route
// (`probe-press-route.mjs`), yet the suite's lighting block fails to ignite after four attempts on the
// same starved page. The block runs after ~60 checks, several of which leave a panel up. This is the
// cheapest version of "run the block's prefix": pick the rod up, open a sheet, press the pill, read the
// state — and the same page without the sheet as the control.
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4183/puffly/';
const FLAGS = (process.env.PUFFLY_CHROME_ARGS || '').split(' ').filter(Boolean);

const trial = async (withSheet) => {
  const browser = await chromium.launch(FLAGS.length ? { args: FLAGS } : {});
  const page = await (
    await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  const out = { withSheet, note: [] };
  try {
    await page.goto(URL_ARG, { waitUntil: 'load' });
    await page.waitForSelector('.stage[data-aim]', { timeout: 30000 });
    await page.waitForTimeout(2500);
    const aim = await page.evaluate(() => {
      const raw = document.querySelector('.stage')?.dataset.aim ?? '';
      const b = document.querySelector('.stage').getBoundingClientRect();
      const f = {};
      for (const part of raw.split(' ')) {
        const i = part.indexOf(':');
        if (i > 0) {
          const [x, y] = part.slice(i + 1).split(',').map(Number);
          if (Number.isFinite(x)) f[part.slice(0, i)] = { x: b.left + x * b.width, y: b.top + y * b.height };
        }
      }
      return f;
    });
    if (aim.pack) {
      await page.touchscreen.tap(aim.pack.x, aim.pack.y);
      await page.waitForTimeout(1500);
    }
    out.beforeSheet = await page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
    if (withSheet) {
      const rail = await page.locator('.hud [data-hook="category"]').boundingBox();
      out.note.push(rail === null ? 'handle-null' : 'handle-tapped');
      if (rail !== null) {
        await page.touchscreen.tap(rail.x + rail.width / 2, rail.y + rail.height / 2);
        await page.waitForTimeout(1500);
      }
    }
    out.sheetsOpen = await page.locator('.sheet[data-open="true"]').count();
    const box = await page.locator('.pill').boundingBox();
    out.pillBox = box === null ? null : [Math.round(box.x), Math.round(box.y)];
    if (box !== null) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(30);
      await page.mouse.up();
    }
    await page.waitForTimeout(3500);
    out.after = await page.evaluate(() => ({
      affordance: document.querySelector('.stage')?.dataset.affordance ?? '',
      phase: document.querySelector('.stage')?.dataset.phase ?? '',
      frames: window.__pufflyScene?.frames ?? -1,
    }));
    out.sheetsAfter = await page.locator('.sheet[data-open="true"]').count();
  } catch (error) {
    out.error = String(error).slice(0, 160);
  }
  await browser.close();
  return out;
};

const control = await trial(false);
const withSheet = await trial(true);
console.log(JSON.stringify({ control, withSheet }, null, 1));

// With a sheet open, what is on top of the stage? The suite's dismissal check reports
// `elementFromPoint(197,180)` is not `.hit` and the sheet's own `.close` centre is covered too — one
// layer, two points. This walks a grid, prints the top-most element chain, then hides the candidates
// one at a time and re-reads the same two points so the owner is named rather than guessed.
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4183/puffly/';
const browser = await chromium.launch(
  process.env.PUFFLY_CHROME_ARGS ? { args: process.env.PUFFLY_CHROME_ARGS.split(' ').filter(Boolean) } : {},
);
const page = await (
  await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
).newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForSelector('.stage[data-aim]', { timeout: 30000 });
await page.waitForTimeout(2500);

const chainAt = (x, y) =>
  page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      const out = [];
      let n = el;
      for (let i = 0; n && i < 5; i++) {
        out.push(
          `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${
            n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/)[0] : ''
          }${getComputedStyle(n).visibility === 'hidden' ? '[hidden]' : ''}${
            getComputedStyle(n).pointerEvents === 'none' ? '[pe:none]' : ''
          }`,
        );
        n = n.parentElement;
      }
      return out.join(' < ') || 'nothing';
    },
    [x, y],
  );

const openShelf = async () => {
  const handle = page.locator('.rail [data-tab="shelf"]');
  for (let i = 0; i < 3; i++) {
    const box = await handle.boundingBox().catch(() => null);
    if (box !== null) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    }
    const opened = await page
      .waitForSelector('.sheet[data-open="true"]', { state: 'attached', timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (opened) break;
    await page.locator('canvas').first().click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true }).catch(() => {});
  }
  await page.waitForTimeout(1200);
};

await openShelf();
const state = await page.evaluate(() => {
  const sheet = document.querySelector('.sheet[data-open="true"]');
  const close = document.querySelector('.sheet[data-open="true"] .close');
  const canvas = document.querySelector('canvas')?.getBoundingClientRect();
  const r = sheet?.getBoundingClientRect();
  const cr = close?.getBoundingClientRect();
  return {
    open: sheet !== null,
    sheetTop: r ? Math.round(r.top) : null,
    closeBox: cr ? [Math.round(cr.x), Math.round(cr.y), Math.round(cr.width)] : null,
    canvasTop: canvas ? Math.round(canvas.y) : null,
    canvases: [...document.querySelectorAll('canvas')].map(
      (c) => `${c.className || 'anon'}:${Math.round(c.getBoundingClientRect().top)}h${Math.round(c.getBoundingClientRect().height)}`,
    ),
  };
});
const aimY = state.sheetTop !== null ? state.sheetTop - 24 : 180;
const closePt = state.closeBox ? [state.closeBox[0] + state.closeBox[2] / 2, state.closeBox[1] + 8] : null;

const report = { state, grid: {}, candidates: [] };
for (const [px, py] of [
  [197, aimY],
  [197, 120],
  [60, 300],
  ...(closePt ? [closePt] : []),
]) {
  report.grid[`${px},${py}`] = await chainAt(px, py);
}

// Hide one layer at a time and re-read the aim point: whoever's removal uncovers `.hit` owns it.
for (const sel of ['.sheet', '.scrim', '.hud', '.rail', '.cta', '.hint', 'canvas.scene3d', 'canvas']) {
  const before = await chainAt(197, aimY);
  const changed = await page.evaluate((selector) => {
    const nodes = [...document.querySelectorAll(selector)];
    if (nodes.length === 0) return 'absent';
    nodes.forEach((n) => {
      n.dataset.prevPe = n.style.pointerEvents;
      n.style.pointerEvents = 'none';
    });
    return `n=${String(nodes.length)}`;
  }, sel);
  const after = await chainAt(197, aimY);
  report.candidates.push({ sel, changed, before, after, uncovered: after !== before });
  await page.evaluate((selector) => {
    [...document.querySelectorAll(selector)].forEach((n) => {
      n.style.pointerEvents = n.dataset.prevPe ?? '';
    });
  }, sel);
}
console.log(JSON.stringify(report, null, 1));
await browser.close();

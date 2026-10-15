// Is the plume's internal structure bimodal on a healthy page? The suite's own ruler, copied verbatim
// from `touch-device.mjs:631` (`cloudShape`) so the numbers are comparable with the check's readings.
// Question it answers: `the breath has light and dark inside it` reddened once at 2x with spread 0.214
// against a documented 0.66-1.03. Either the ladder spends per-disc structure mid-breath, or the
// exhale's painting regressed. Six+ samples of the same build separate "sometimes flat" from "always
// flat".
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4183/puffly/';

const cloudShape = async (page) => {
  const band = async () => {
    const shot = (await page.screenshot()).toString('base64');
    return page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(
        0,
        Math.round(img.height * 0.25),
        img.width,
        Math.round(img.height * 0.35),
      );
      const step = 4;
      const lum = [];
      for (let row = 0; row < image.height; row += step) {
        for (let col = 0; col < image.width; col += step) {
          const i = (row * image.width + col) * 4;
          lum.push(0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]);
        }
      }
      return lum;
    }, shot);
  };
  const setCloud = (wanted) =>
    page.evaluate((visible) => {
      const ctx = window.__pufflyScene.context;
      const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
      let hit = null;
      scene.traverse((o) => {
        if (o.name === 'smoke') hit = o;
      });
      if (hit === null) return 0;
      hit.visible = visible;
      return hit.count;
    }, wanted);
  const instances = await setCloud(false);
  const off = await band();
  const on = await band();
  await setCloud(true);
  const delta = on.map((value, i) => value - (off[i] ?? value));
  const lifted = delta.map((value) => value > 4);
  const cloudPx = lifted.filter(Boolean).length;
  const mean = cloudPx ? delta.reduce((a, v, i) => (lifted[i] ? a + v : a), 0) / cloudPx : 0;
  const variance = cloudPx
    ? delta.reduce((a, v, i) => (lifted[i] ? a + (v - mean) ** 2 : a), 0) / cloudPx
    : 0;
  return {
    instances,
    cloudPx,
    share: +(cloudPx / delta.length).toFixed(4),
    spread: mean ? +(Math.sqrt(variance) / mean).toFixed(3) : 0,
  };
};

const browser = await chromium.launch();
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

// Pick the rod up and light it through the pill, the phone's own gesture path.
const aimOf = () =>
  page.evaluate(() => {
    const raw = document.querySelector('.stage')?.dataset.aim ?? '';
    const box = document.querySelector('.stage')?.getBoundingClientRect();
    const found = {};
    for (const part of raw.split(' ')) {
      const i = part.indexOf(':');
      if (i > 0) {
        const [fx, fy] = part.slice(i + 1).split(',').map(Number);
        if (Number.isFinite(fx))
          found[part.slice(0, i)] = { x: box.left + fx * box.width, y: box.top + fy * box.height };
      }
    }
    return found;
  });
const aim = await aimOf();
if (aim.pack) await page.touchscreen.tap(aim.pack.x, aim.pack.y);
await page.waitForTimeout(1200);
await page.locator('.pill').click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2500);

const rows = [];
for (let trial = 0; trial < 8; trial++) {
  // A HELD draw, not a tap: the first version of this probe clicked, which feeds the cloud 16-36
  // discs where the check's own failing reading carried 295 — an experiment that measured a breath that
  // never happened. Hold past the middle tier, release, then sample through the exhale.
  const pill = await page.locator('.pill').boundingBox();
  if (pill !== null) {
    await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
  }
  await page.waitForTimeout(700);
  for (let look = 0; look < 3; look++) {
    const shape = await cloudShape(page);
    const ratio = await page.evaluate(() => {
      const list = [...document.querySelectorAll('canvas')];
      const c = document.querySelector('canvas.scene3d') ?? list[0];
      return {
        ratio: c && c.clientWidth ? +(c.width / c.clientWidth).toFixed(2) : 0,
        all: list.map((k) => `${k.className || 'anon'}:${k.width}x${k.height}`).join(','),
      };
    });
    const frames = await page.evaluate(() => window.__pufflyScene?.frames ?? -1);
    rows.push({ trial, look, ...shape, ratio: ratio.ratio, canvases: ratio.all, frames });
    await page.waitForTimeout(220);
  }
}
const spreads = rows.filter((r) => r.share >= 0.01).map((r) => r.spread);
console.log(
  JSON.stringify(
    {
      n: rows.length,
      ratios: [...new Set(rows.map((r) => r.ratio))],
      spreads,
      min: Math.min(...spreads),
      max: Math.max(...spreads),
      belowHalf: spreads.filter((v) => v < 0.5).length,
      rows,
    },
    null,
    1,
  ),
);
await browser.close();

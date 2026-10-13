/**
 * Measures the pixels contributed by the live smoke mesh alone. Turn only the InstancedMesh off for
 * one screenshot, back on for another, then difference them. This answers a question the old
 * `luminance > 90` rule cannot: the smoke sprites are additive, so the low-alpha edge of a puff may
 * be visible even when the output pixel is far below 90. For each actual live particle, the GPU draws
 * one `softDisc` sprite; this measures the pixel footprint those discs produce rather than a guessed
 * sprite radius.
 *
 * Usage: `PUFFLY_CHROME=... node tests/smoke/probe-smoke-pixels.mjs http://127.0.0.1:4179/puffly/`
 */
const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const CHROME = process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const playwright = await import('playwright');
const browser = await playwright.chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForSelector('.stage');
await page.waitForTimeout(1200);

const pillBox = () => page.locator('.pill').boundingBox();
const wake = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const box = await pillBox();
    if (box !== null && box.width > 1) {
      const hittable = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('.pill') !== null,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      if (hittable) return;
    }
    await page.locator('canvas').click({ position: { x: 20, y: 20 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(120);
  }
  throw new Error('pill never became hittable');
};
const press = async () => {
  const box = await pillBox();
  if (box === null) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
};

await wake();
let lit = false;
for (let i = 0; i < 8; i += 1) {
  await press();
  await page.waitForTimeout(700);
  const affordance = await page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
  if (affordance === 'puff' || affordance === 'flick') {
    lit = true;
    break;
  }
}
if (!lit) throw new Error('rod did not reach a drawable state');
for (let i = 0; i < 5; i += 1) {
  await press();
  await page.waitForTimeout(420);
}
await page.waitForTimeout(100);

const toggleSmoke = async (visible) => page.evaluate((wanted) => {
  const ctx = window.__pufflyScene.context;
  const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
  let smoke = null;
  scene.traverse((node) => { if (node.name === 'smoke') smoke = node; });
  if (smoke === null) return { count: 0, bounds: null };
  smoke.visible = wanted;
  const canvas = document.querySelector('canvas');
  const canvasRect = canvas.getBoundingClientRect();
  smoke.updateMatrixWorld(true);
  const sm = smoke.matrixWorld.elements;
  const im = smoke.instanceMatrix.array;
  const minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let left = minX, top = minY, right = maxX, bottom = maxY;
  const cssWidth = canvasRect.width;
  const cssHeight = canvasRect.height;
  const stageHeight = 4;
  const stageWidth = stageHeight * (cssWidth / cssHeight);
  const add = (x, y, z) => {
    const wx = sm[0] * x + sm[4] * y + sm[8] * z + sm[12];
    const wy = sm[1] * x + sm[5] * y + sm[9] * z + sm[13];
    const sx = (wx / stageWidth + 0.5) * cssWidth;
    const sy = (0.5 - wy / stageHeight) * cssHeight;
    left = Math.min(left, sx); right = Math.max(right, sx);
    top = Math.min(top, sy); bottom = Math.max(bottom, sy);
  };
  for (let i = 0; i < smoke.count; i += 1) {
    const o = i * 16;
    const xs = [-0.5, 0.5], ys = [-0.5, 0.5];
    for (const x of xs) for (const y of ys) {
      const lx = im[o] * x + im[o + 4] * y + im[o + 12];
      const ly = im[o + 1] * x + im[o + 5] * y + im[o + 13];
      const lz = im[o + 2] * x + im[o + 6] * y + im[o + 14];
      add(lx, ly, lz);
    }
  }
  return { count: smoke.count, bounds: [left, top, right, bottom], canvas: [cssWidth, cssHeight] };
}, visible);

const read = async () => (await page.screenshot()).toString('base64');
const { count, bounds } = await toggleSmoke(false);
await page.waitForTimeout(40);
const off = await read();
await toggleSmoke(true);
await page.waitForTimeout(40);
const on = await read();

const result = await page.evaluate(async ([off64, on64, box]) => {
  async function pixels(b64) {
    const image = new Image();
    image.src = 'data:image/png;base64,' + b64;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return { w: image.width, h: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
  }
  const a = await pixels(off64);
  const b = await pixels(on64);
  const scaleX = a.w / box.canvas[0];
  const scaleY = a.h / box.canvas[1];
  const minX = Math.max(0, Math.floor(box.bounds[0] * scaleX) - 8);
  const maxX = Math.min(a.w, Math.ceil(box.bounds[2] * scaleX) + 8);
  const minY = Math.max(0, Math.floor(box.bounds[1] * scaleY) - 8);
  const maxY = Math.min(a.h, Math.ceil(box.bounds[3] * scaleY) + 8);
  const thresholds = [1, 2, 4, 8];
  const profile = thresholds.map((threshold) => ({ threshold, rows: [] }));
  for (let y = minY; y < maxY; y += 1) {
    const row = new Map(thresholds.map((t) => [t, 0]));
    for (let x = minX; x < maxX; x += 1) {
      const i = (y * a.w + x) * 4;
      const delta =
        0.299 * (b.data[i] - a.data[i]) +
        0.587 * (b.data[i + 1] - a.data[i + 1]) +
        0.114 * (b.data[i + 2] - a.data[i + 2]);
      for (const t of thresholds) if (delta >= t) row.set(t, row.get(t) + 1);
    }
    for (const p of profile) p.rows.push(row.get(p.threshold));
  }
  return {
    dimensions: [a.w, a.h],
    bbox: [minX, minY, maxX, maxY],
    profile: profile.map((p) => {
      const bins = [];
      const rowsPerBin = Math.max(1, Math.floor(p.rows.length / 36));
      for (let i = 0; i < p.rows.length; i += rowsPerBin) {
        bins.push(
          Math.round(
            p.rows.slice(i, i + rowsPerBin).reduce((s, v) => s + v, 0) /
              Math.min(rowsPerBin, p.rows.length - i),
          ),
        );
      }
      const max = Math.max(...bins, 1);
      const runs = [];
      let current = 0;
      for (const n of bins) {
        if (n === 0) current++;
        else if (current) {
          runs.push(current);
          current = 0;
        }
      }
      if (current) runs.push(current);
      return {
        threshold: p.threshold,
        bins,
        zeroRuns: runs,
        max,
        occupied: p.rows.filter((v) => v > 0).length / Math.max(1, p.rows.length),
      };
    }),
  };
}, [off, on, { bounds, canvas: [393, 852] }]);

console.log(
  `live smoke pixel-difference probe: ${count} instances; bbox ${result.bbox}; PNG ${result.dimensions}`,
);
for (const p of result.profile) {
  const bars = p.bins.map((n) => n === 0 ? ' ' : n < 3 ? '·' : n < 8 ? ':' : n < 16 ? '*' : '#').join('');
  console.log(
    `  ΔL>=${String(p.threshold).padEnd(2)} occupied=${(p.occupied * 100).toFixed(1)}%  bins=${bars}  longest zero run=${Math.max(0, ...p.zeroRuns)} bins`,
  );
}
await context.close();
await browser.close();
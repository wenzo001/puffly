/**
 * Probe the live smoke column: read the 'smoke' InstancedMesh instance matrices during a break and
 * print the vertical distribution of puffs. Decides whether the rendered bead look is a clumping of
 * bursts (flow field) or a gap between dim layers (alpha).
 *
 *   node tests/smoke/probe-smoke-dist.mjs http://127.0.0.1:4179/puffly/
 */
const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch(
  CHROME !== undefined ? { executablePath: CHROME } : { channel: 'chromium' },
);
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
const page = await context.newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForSelector('.stage');
await page.waitForTimeout(1500);

const affordanceOf = () =>
  page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
const pressPill = async () => {
  const box = await page.locator('.pill').boundingBox();
  if (box === null) return;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const wake = async () => {
  for (let i = 0; i < 4; i += 1) {
    const box = await page.locator('.pill').boundingBox();
    if (box !== null && box.width > 1) {
      const ok = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('.pill') !== null,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      if (ok) return;
    }
    await page.locator('canvas').click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(150);
  }
};

await wake();
for (let i = 0; i < 8; i += 1) {
  await pressPill();
  await page.waitForTimeout(700);
  const a = await affordanceOf();
  if (a === 'puff' || a === 'flick') break;
}
for (let i = 0; i < 5; i += 1) {
  await pressPill();
  await page.waitForTimeout(400);
}

const dist = await page.evaluate(() => {
  const ctx = window.__pufflyScene.context;
  const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
  let smoke = null;
  scene.traverse((o) => {
    if (o.name === 'smoke') smoke = o;
  });
  if (!smoke) return { error: 'no smoke mesh' };
  const count = smoke.count;
  const matrix = smoke.instanceMatrix.array;
  const colour = smoke.instanceColor === null ? null : smoke.instanceColor.array;
  const items = [];
  // Read each instance's translation (matrix is 16 floats per instance, column-major).
  for (let i = 0; i < count; i += 1) {
    const o = i * 16;
    const x = matrix[o + 12];
    const y = matrix[o + 13];
    // scale x is the drawn diameter; radius = half.
    const d = matrix[o + 0];
    let mag = 0;
    if (colour !== null) {
      const c = (i * 3);
      mag = Math.sqrt(colour[c] * colour[c] + colour[c + 1] * colour[c + 1] + colour[c + 2] * colour[c + 2]);
    }
    items.push({ x, y, r: Math.abs(d) / 2, mag });
  }
  const ys = items.map((it) => it.y);
  const xs = items.map((it) => it.x);
  ys.sort((a, b) => a - b);
  xs.sort((a, b) => a - b);
  // Histogram of y into 20 bins from min to max.
  const ymin = ys[0];
  const ymax = ys[ys.length - 1];
  const nbins = 20;
  const bins = new Array(nbins).fill(0);
  for (const y of ys) {
    const idx = Math.min(nbins - 1, Math.floor(((y - ymin) / Math.max(1e-6, ymax - ymin)) * nbins));
    bins[idx] += 1;
  }
  const mags = items.map((it) => it.mag).sort((a, b) => a - b);
  const radii = items.map((it) => it.r).sort((a, b) => a - b);
  const quantile = (values, q) => values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0;
  const rows = bins.map((n, i) => {
    const y0 = ymin + ((ymax - ymin) * i) / nbins;
    const y1 = ymin + ((ymax - ymin) * (i + 1)) / nbins;
    const atY = items.filter((it) => it.y >= y0 && (i === nbins - 1 ? it.y <= y1 : it.y < y1));
    const rowMag = atY.map((it) => it.mag).sort((a, b) => a - b);
    const rowRadius = atY.map((it) => it.r).sort((a, b) => a - b);
    return {
      n,
      mag50: quantile(rowMag, 0.5),
      mag90: quantile(rowMag, 0.9),
      r50: quantile(rowRadius, 0.5),
    };
  });
  return {
    count,
    ymin: +ymin.toFixed(3),
    ymax: +ymax.toFixed(3),
    yspan: +(ymax - ymin).toFixed(3),
    xmin: +xs[0].toFixed(3),
    xmax: +xs[xs.length - 1].toFixed(3),
    bins,
    mags: { p10: quantile(mags, 0.1), p50: quantile(mags, 0.5), p90: quantile(mags, 0.9) },
    radii: { p10: quantile(radii, 0.1), p50: quantile(radii, 0.5), p90: quantile(radii, 0.9) },
    rows,
  };
});

console.log('\nsmoke instance distribution (world units, y up):');
if (dist.error) {
  console.log('  ' + dist.error);
} else {
  console.log(`  count=${dist.count} yspan=${dist.yspan} (${dist.ymin}..${dist.ymax}) xspan=${(dist.xmax - dist.xmin).toFixed(3)}`);
  const maxBin = Math.max(...dist.bins);
  dist.bins.forEach((b, i) => {
    const bar = '#'.repeat(Math.round((b / maxBin) * 50));
    const row = dist.rows[i];
    const visibleFrac = (c) => (c > 0.05 ? Math.max(0, 1 - Math.pow(0.05 / c, 1 / 2.2)) : 0);
    const alphaCoverage = row ? visibleFrac(row.mag50) : 0;
    console.log(
      `    [${(i * 5).toString().padStart(2)}] ${String(b).padStart(4)} ${bar}  ` +
        `medα=${(row?.mag50 ?? 0).toFixed(3)} medR=${(row?.r50 ?? 0).toFixed(4)} ` +
        `visibleR=${(alphaCoverage * (row?.r50 ?? 0)).toFixed(4)}`,
    );
  });
  console.log(`  centre alpha percentiles (linear instance colour): ${JSON.stringify(dist.mags)}`);
  console.log(`  logical radius percentiles: ${JSON.stringify(dist.radii)}`);
}

await context.close();
await browser.close();

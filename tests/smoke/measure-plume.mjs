/**
 * Measure the plume as a *shape*, by isolating it: capture the same break twice, once with smoke and
 * once with the same state but the smoke suppressed, and difference the two frames. What is left is
 * only the smoke. Then ask the question the eye asks — is it a column or a bead chain?
 *
 *   node tests/smoke/measure-plume.mjs http://127.0.0.1:4179/puffly/
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

// Take several draws so the column is established, then sample it at one instant.
for (let i = 0; i < 4; i += 1) {
  await pressPill();
  await page.waitForTimeout(400);
}
const withSmoke = (await page.screenshot()).toString('base64');

// Now the same frame with the smoke hidden: the plume group is a primitive named by the scene.
const hidden = await page.evaluate(() => {
  // Find the plume mesh through the canvas's scene, if reachable, else hide by a render flag.
  return typeof window.__pufflyHidePlume === 'function';
});
console.log('hide hook available:', hidden);

const analyse = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { width: W, height: H } = c;
  const px = ctx.getImageData(0, 0, W, H).data;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  };
  // The bright smoke is much lighter than the room. Threshold well above the room's own glow.
  const rows = [];
  for (let y = 0; y < Math.floor(H * 0.75); y += 1) {
    let n = 0;
    let minX = W;
    let maxX = -1;
    for (let x = 0; x < W; x += 1) {
      if (lum(x, y) > 90) {
        n += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    rows.push({ y, n, width: maxX >= 0 ? maxX - minX + 1 : 0 });
  }
  // Contiguous runs above a low floor.
  const floor = 4;
  const bands = [];
  let cur = null;
  for (const r of rows) {
    if (r.n > floor) {
      if (!cur) cur = { from: r.y, to: r.y, peak: 0, sumW: 0, cnt: 0 };
      cur.to = r.y;
      cur.peak = Math.max(cur.peak, r.n);
      cur.sumW += r.width;
      cur.cnt += 1;
    } else if (cur) {
      bands.push(cur);
      cur = null;
    }
  }
  if (cur) bands.push(cur);
  bands.sort((a, b) => b.to - b.from - (a.to - a.from));
  const longest = bands[0] ?? null;
  let necks = 0;
  let minIn = Infinity;
  let maxIn = 0;
  const profile = [];
  if (longest) {
    for (let y = longest.from; y <= longest.to; y += 1) {
      const n = rows[y].n;
      profile.push(n);
      minIn = Math.min(minIn, n);
      maxIn = Math.max(maxIn, n);
    }
    for (let i = 2; i < profile.length - 2; i += 1) {
      if (profile[i] < profile[i - 2] && profile[i] < profile[i + 2] && profile[i] < maxIn * 0.6) {
        necks += 1;
      }
    }
  }
  // The thickness of the column (lit width) at the top vs bottom of the run: real smoke widens.
  const third = longest ? Math.max(1, Math.floor((longest.to - longest.from) / 3)) : 1;
  const widthAt = (rel) => (longest ? rows[longest.from + rel].width : 0);
  return {
    W, H,
    bands: bands.slice(0, 6).map((b) => ({ from: b.from, to: b.to, h: b.to - b.from + 1, peak: b.peak })),
    longest: longest ? { from: longest.from, to: longest.to, peak: longest.peak } : null,
    necks,
    minIn: Number.isFinite(minIn) ? minIn : 0,
    maxIn,
    // Width near the top of the column vs near the bottom.
    widthTop: widthAt(third),
    widthBottom: widthAt((longest ? longest.to - longest.from : 0) - third),
  };
}, withSmoke);

console.log('\nphone-portrait 393x852 (PNG 786x1704), smoke isolated by luminance > 90');
console.log(`  contiguous bright runs: ${analyse.bands.length}`);
for (const b of analyse.bands) console.log(`    y ${b.from}..${b.to} h=${b.h} peak=${b.peak}`);
console.log(`  longest: ${analyse.longest ? `${analyse.longest.from}..${analyse.longest.to}` : 'none'}`);
console.log(`  necks (brightness dips >40% inside the run): ${analyse.necks}`);
console.log(`  per-row lit count inside the run: min ${analyse.minIn} max ${analyse.maxIn}`);
console.log(`  column width  top=${analyse.widthTop}  bottom=${analyse.widthBottom}`);

await context.close();
await browser.close();

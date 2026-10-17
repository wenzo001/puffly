/**
 * Which gesture puts a flame in the frame, and how long the screenshot can take to catch it.
 *
 * The device suite's new fire reading went red on four checks while the scene's own state machine
 * said `phase=light` the whole way through — so the state and the pixels disagreed, and one of the
 * two is lying about what was drawn. This measures the two gesture routes the app actually offers:
 *
 *   press and hold on the rod itself (`pressSurface` at the body anchor, the route the new check uses);
 *   tap the rod, then tap the lighter (the route the rail/flame block in the suite uses, and the one
 *     the shipped `3D: the ignition's flame…` check drives).
 *
 * Each step prints the state the page publishes (`phase`, `affordance`, `lip.visible`, `particles`)
 * next to the hottest warm pixel in the frame and the frame counter, so a stalled render loop, a
 * gesture that never reached the engine, and a flame that simply does not live as long as one
 * screenshot take, are three different readings and not one guess.
 *
 *   node tests/smoke/probe-fire-window.mjs http://localhost:5175/
 */

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const playwright = await import(process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright');
const CHROME = process.env['PUFFLY_CHROME'];
const browser = await playwright.chromium.launch(
  CHROME === undefined ? { channel: 'chromium' } : { executablePath: CHROME },
);

const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-Hans-CN',
});
const page = await context.newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const state = () =>
  page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const p = window.__pufflyScene;
    return {
      phase: stage?.dataset.phase ?? '',
      affordance: stage?.dataset.affordance ?? '',
      frames: p?.frames ?? -1,
      particles: p?.particles ?? -1,
      lip: p?.lip?.visible ?? null,
      puffReady: p?.puffReady ?? null,
    };
  });

async function propsOf() {
  const raw = await page.evaluate(() => document.querySelector('.stage')?.dataset.aim ?? '');
  const props = {};
  for (const part of raw.split(' ')) {
    const [name, pair] = part.split(':');
    const [x, y] = (pair ?? '').split(',').map(Number);
    if (name !== undefined && Number.isFinite(x) && Number.isFinite(y)) props[name] = { x, y };
  }
  return props;
}

const canvasPoint = (nx, ny) =>
  page.evaluate(
    ([x, y]) => {
      const box = document.querySelector('canvas').getBoundingClientRect();
      return { x: box.left + box.width * x, y: box.top + box.height * y };
    },
    [nx, ny],
  );

const pressSurface = (at, down) =>
  page.evaluate(
    ([x, y, isDown]) => {
      document.querySelector('.hit')?.dispatchEvent(
        new PointerEvent(isDown ? 'pointerdown' : 'pointerup', {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    [at.x, at.y, down],
  );

/** The hottest warm pixel anywhere in the frame, plus the count above a floor — no anchor box, so
 *  nothing about where the rod is assumed. Its position is the answer. */
const hottest = async () => {
  const shot = (await page.screenshot()).toString('base64');
  const took = Date.now();
  const out = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let best = -1;
    let at = [0, 0];
    let above120 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      if (r - data[i + 2] < 12) continue;
      if (r > 120) above120 += 1;
      if (r > best) {
        best = r;
        const k = i / 4;
        at = [k % img.width, Math.floor(k / img.width)];
      }
    }
    return { best, at, above120, size: [img.width, img.height] };
  }, shot);
  return { ...out, ms: Date.now() - took };
};

const props0 = await propsOf();
const bodyAt = await canvasPoint(props0.body.x, props0.body.y);
const lampAt = await canvasPoint(props0.lighter.x, props0.lighter.y);
console.log(
  `anchors: body=${JSON.stringify(props0.body)} → css ${JSON.stringify(bodyAt)} | ` +
    `lighter=${JSON.stringify(props0.lighter)} → css ${JSON.stringify(lampAt)}`,
);
console.log(`idle    ${JSON.stringify(await state())} hottest=${JSON.stringify(await hottest())}`);

console.log('\nroute A — press and hold the rod itself:');
await pressSurface(bodyAt, true);
for (let step = 0; step < 6; step += 1) {
  const h = await hottest();
  console.log(`  A${String(step)} ${JSON.stringify(await state())} hot=${JSON.stringify(h)}`);
  await page.waitForTimeout(150);
}
await pressSurface(bodyAt, false);
await page.waitForTimeout(900);

console.log('\nroute B — tap the rod, then tap the lighter:');
await page.touchscreen.tap(bodyAt.x, bodyAt.y);
await page.waitForTimeout(220);
console.log(`  after rod tap   ${JSON.stringify(await state())}`);
for (let step = 0; step < 6; step += 1) {
  await page.touchscreen.tap(lampAt.x, lampAt.y);
  const h = await hottest();
  console.log(`  B${String(step)} ${JSON.stringify(await state())} hot=${JSON.stringify(h)}`);
  await page.waitForTimeout(150);
}

console.log('\nroute C — the pill, the way the shipped flame check walks it:');

/** The same anchored search the device check uses, so the two readings are comparable. */
const fireSide = async () => {
  const props = await propsOf();
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ b64, body, ember }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const pad = 30 * (img.width / window.innerWidth);
      const xs = [body.x * img.width, ember.x * img.width];
      const ys = [body.y * img.height, ember.y * img.height];
      const x0 = Math.max(0, Math.round(Math.min(...xs) - pad));
      const x1 = Math.min(img.width, Math.round(Math.max(...xs) + pad));
      const y0 = Math.max(0, Math.round(Math.min(...ys) - pad));
      const y1 = Math.min(img.height, Math.round(Math.max(...ys) + pad));
      const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let best = -1;
      let at = [0, 0];
      let above = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        if (r - data[i + 2] < 12) continue;
        if (r > 120) above += 1;
        if (r > best) {
          best = r;
          const k = i / 4;
          at = [x0 + (k % (x1 - x0)), y0 + Math.floor(k / (x1 - x0))];
        }
      }
      return {
        best,
        at,
        above,
        bodyX: Math.round(xs[0]),
        emberX: Math.round(xs[1]),
        agree: at[0] > xs[0] === xs[1] > xs[0],
      };
    },
    { b64: shot, body: props.body, ember: props.ember },
  );
};

const setFlip = (on) =>
  page.evaluate((enabled) => {
    const c = document.querySelector('canvas');
    if (c === null) return false;
    c.style.transform = enabled ? 'scaleX(-1)' : '';
    return true;
  }, on);

for (let attempt = 0; attempt < 4; attempt += 1) {
  await page
    .locator('.pill')
    .click({ timeout: 4000 })
    .catch(() => {});
  const puff = await page
    .waitForFunction(
      () => (document.querySelector('.stage')?.dataset.affordance ?? '') === 'puff',
      null,
      { timeout: 6000, polling: 150 },
    )
    .then(() => true)
    .catch(() => false);
  console.log(`  C${String(attempt)} pill click → affordance=${JSON.stringify(await state())}`);
  if (!puff) continue;
  const fire = await fireSide();
  await setFlip(true);
  const mirror = await fireSide();
  await setFlip(false);
  const restored = await fireSide();
  console.log(`    fire    ${JSON.stringify(fire)}`);
  console.log(`    mirrored ${JSON.stringify(mirror)}`);
  console.log(`    restored ${JSON.stringify(restored)}`);
  break;
}

await browser.close();

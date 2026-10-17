/**
 * What is actually inside the box the right-to-left rod check used to measure?
 *
 * The device check `right-to-left: the burning end stays on the same side, in the state and on the
 * canvas` compared the drawn rod's centroid between Chinese and Arabic. Measured 2026-10-16 on the
 * normal path it read `x 224.8 → 214.5` against a budget of 5.7 px, and in the same line
 * `n 25616 → 26979`: 5.3% more pixels matched the rod's colour key after a language switch. A rod
 * that has not moved does not gain pixels. Something else in the box is being keyed, and the red
 * cannot be attributed until that something is named. (It was: the box keys the room. The clause is
 * gone from the suite, replaced by `fireSide` — which is why this probe is left here rather than
 * deleted: it is the evidence for that removal.)
 *
 * Two candidates were reachable without touching the product:
 *
 *   the breath. The box is a 140 × 34 region centred on the rod's own body anchor, which is where a
 *     cloud starts. Turned off and on at the same instant (`cloudShape`'s proven handle: the node
 *     named `smoke`), it moves the keyed centroid by 0.05–0.1 px at idle, on this machine, as
 *     measured 2026-10-17 — the plume is not the mechanism.
 *
 *   the word. In `scene3d-text` the scene paints the gesture's verb itself (global.css puts the DOM
 *     hint's `text-fill-color` at transparent and `placeHintInk` draws the run from that element's
 *     rect), so the composited frame carries word ink next to the rod. A language switch *must*
 *     change that ink — a Chinese 点 and an Arabic word are different shapes at different widths —
 *     and it is the one thing in the box that a language switch is designed to change.
 *
 * So the keyed pixels are split by geometry, in one pass over one screenshot: those under the hint's
 * own rect (inflated) and those outside it. Each locale is read twice, 520 ms apart, so every
 * cross-locale gap is reported against the gap the same rod produces in the same language over the
 * same span. That control is what makes the claim falsifiable: if removing the word's region brings
 * the two locales together to within the control, the check has been reading the vocabulary, not the
 * rod. If it does not, the app is the thing to look at.
 *
 *   node tests/smoke/probe-rtl-plume.mjs http://localhost:5175/
 *
 * Exits 3 when the app is not serving, the smoke node cannot be found, or the language never
 * switches — a probe that measures one language twice is worse than no probe.
 */

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];
const { request: httpGet } = await import('node:http');

const serving = await new Promise((done) => {
  const req = httpGet(URL_ARG, { timeout: 8000 }, (response) => {
    response.resume();
    done(response.statusCode ?? 0);
  });
  req.on('error', () => done('no answer'));
  req.on('timeout', () => {
    req.destroy();
    done('timed out');
  });
  req.end();
});
if (typeof serving !== 'number' || serving >= 400) {
  console.error(`nothing usable is serving ${URL_ARG} (got ${String(serving)}). Not run.`);
  process.exit(3);
}

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch(
  CHROME === undefined ? { channel: 'chromium' } : { executablePath: CHROME },
);

const fail = async (message) => {
  console.error(message);
  await browser.close();
  process.exit(3);
};

/** The props the shell mirrors onto `.stage[data-aim]`, in fractions of the canvas. */
async function propsOf(page) {
  const raw = await page.evaluate(() => document.querySelector('.stage')?.dataset.aim ?? '');
  const props = {};
  for (const part of raw.split(' ')) {
    const [name, pair] = part.split(':');
    const [x, y] = (pair ?? '').split(',').map(Number);
    if (name !== undefined && Number.isFinite(x) && Number.isFinite(y)) props[name] = { x, y };
  }
  return props;
}

/** Where the word strip is, in CSS px, and how much of it is ink that a person can see. */
const hintRect = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.hint');
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const painted =
      r.width > 0 &&
      r.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      Number(style.opacity) > 0.05;
    return { x: r.x, y: r.y, w: r.width, h: r.height, painted, opacity: style.opacity };
  });

/** Turn the cloud itself off or on, and report how many instances it was carrying. */
const setCloud = (page, wanted) =>
  page.evaluate((visible) => {
    const ctx = window.__pufflyScene?.context;
    if (!ctx) return null;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let hit = null;
    scene.traverse((o) => {
      if (o.name === 'smoke') hit = o;
    });
    if (hit === null) return null;
    hit.visible = visible;
    return hit.count;
  }, wanted);

/**
 * The check's box and the check's colour key, with the keyed set split by the word's rect.
 *
 * `word` is in CSS px because that is how the DOM reports it; the conversion to device pixels uses
 * the same factor the box itself is converted with, so the two are in one coordinate space by
 * construction.
 */
const rodBox = async (page, word) => {
  const anchors = await propsOf(page);
  if (anchors.body === undefined) return null;
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ b64, props, wordRect }) => {
      const anchor = props.body;
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const scale = img.width / window.innerWidth;
      const bw = 140 * scale;
      const bh = 34 * (img.height / window.innerHeight);
      const cx = anchor.x * img.width;
      const cy = anchor.y * img.height;
      const x0 = Math.max(0, Math.round(cx - bw / 2));
      const y0 = Math.max(0, Math.round(cy - bh / 2));
      const w = Math.min(Math.round(bw), img.width - x0);
      const h = Math.min(Math.round(bh), img.height - y0);
      const wx = wordRect === null ? -1 : Math.round(wordRect.x * scale);
      const wy = wordRect === null ? -1 : Math.round(wordRect.y * scale);
      const ww = wordRect === null ? 0 : Math.round(wordRect.w * scale);
      const wh = wordRect === null ? 0 : Math.round(wordRect.h * scale);
      const image = ctx.getImageData(x0, y0, w, h).data;
      const profile = new Array(12).fill(0);
      // The same count by row. A rod is a short diagonal: it concentrates in a few columns and a
      // few rows. A strip of pack crossing the window concentrates in rows only, and that is what
      // the check would actually be averaging.
      const rowProfile = new Array(12).fill(0);
      let n = 0;
      let sumX = 0;
      let nWord = 0;
      let sumXWord = 0;
      let nOut = 0;
      let sumXOut = 0;
      // The band-pass's two neighbours. If the keyed set grows and shrinks because pixels cross a
      // luminance threshold rather than because geometry moved, the crossing shows up here: the set
      // leaving through the top (brighter than 150) or the bottom (darker than 55) of the band.
      let nBright = 0;
      let nDark = 0;
      let sumR = 0;
      let sumAll = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const r = image[i];
          const b = image[i + 2];
          sumR += r;
          sumAll += 1;
          if (!(r >= 55 && r <= 150 && r - b >= 8)) {
            if (r > 150 && r - b >= 8) nBright += 1;
            else if (r < 55 && r - b >= 8) nDark += 1;
            continue;
          }
          const inWord =
            ww > 0 &&
            x0 + x >= wx &&
            x0 + x < wx + ww &&
            y0 + y >= wy &&
            y0 + y < wy + wh;
          n += 1;
          sumX += x;
          profile[Math.min(11, Math.floor((x / w) * 12))] += 1;
          rowProfile[Math.min(11, Math.floor((y / h) * 12))] += 1;
          if (inWord) {
            nWord += 1;
            sumXWord += x;
          } else {
            nOut += 1;
            sumXOut += x;
          }
        }
      }
      // What is actually at each published anchor, sampled where the page says the prop is. The
      // check is named for the burning end, so the first question is whether the burning end is in
      // its window at all — answered by the colour under the ember's own point, not by a hunch
      // about what a cigarette looks like.
      const spots = {};
      for (const [name, point] of Object.entries(props)) {
        if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
        const px = Math.round(point.x * img.width);
        const py = Math.round(point.y * img.height);
        const side = 9;
        const half = Math.floor(side / 2);
        const clipX = Math.max(0, Math.min(img.width - side, px - half));
        const clipY = Math.max(0, Math.min(img.height - side, py - half));
        const near = ctx.getImageData(clipX, clipY, side, side).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let keyed = 0;
        let bright = 0;
        for (let k = 0; k < near.length; k += 4) {
          r += near[k];
          g += near[k + 1];
          b += near[k + 2];
          if (near[k] >= 55 && near[k] <= 150 && near[k] - near[k + 2] >= 8) keyed += 1;
          if (near[k] > 150 && near[k] - near[k + 2] >= 8) bright += 1;
        }
        const cells = side * side;
        spots[name] = {
          at: [px, py],
          rgb: [Math.round(r / cells), Math.round(g / cells), Math.round(b / cells)],
          keyedShare: +(keyed / cells).toFixed(2),
          brightShare: +(bright / cells).toFixed(2),
          inBox: px >= x0 && px < x0 + w && py >= y0 && py < y0 + h,
        };
      }
      return {
        n,
        meanX: n ? sumX / n : 0,
        nWord,
        meanXWord: nWord ? sumXWord / nWord : 0,
        nOut,
        meanXOut: nOut ? sumXOut / nOut : 0,
        nBright,
        nDark,
        meanR: sumAll ? sumR / sumAll : 0,
        rows: rowProfile,
        spots,
        box: [x0, y0, w, h],
        wordBox: ww > 0 ? [wx, wy, ww, wh] : null,
        profile,
      };
    },
    { b64: shot, props: anchors, wordRect: word },
  );
};

/**
 * One state, read three ways.
 *
 * `on` is what the shipped check sees. `off` is the same frame with the cloud hidden, so the
 * difference is the breath's own contribution at this instant. Both carry the word split because it
 * is computed from the same pixels at no extra cost.
 */
async function readState(page) {
  const word = await hintRect(page);
  const on = await rodBox(page, word);
  if (on === null) await fail('the stage never published a body anchor; nothing to measure.');
  const instances = await setCloud(page, false);
  if (instances === null) await fail('the scene has no node named "smoke"; the plume cannot be split.');
  const off = await rodBox(page, word);
  await setCloud(page, true);
  return { word, on, off, instances };
}

const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-Hans-CN',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(URL_ARG, { waitUntil: 'load' });

const wakeDeadline = Date.now() + 15_000;
for (;;) {
  const affordance = await page.evaluate(
    () => document.querySelector('.stage')?.dataset.affordance ?? '',
  );
  if (affordance !== '' && affordance !== 'none') break;
  if (Date.now() > wakeDeadline) await fail('the page never published a gesture; nothing to measure.');
  await page.waitForTimeout(150);
}

/**
 * Eight back-to-back reads with nothing asked of the page — no language switch, no draw, no toggle.
 *
 * The shipped check budgets for "what the burn moves the centroid in one window", estimated from a
 * single control pair, and the number it produced (2.7 px) was a quarter of what the same rod
 * reports between two reads taken in one language. If the quantity is not a drift but an oscillation
 * — pixels crossing a luminance band as the light breathes — then no tolerance measured from one
 * sample pair can bound it, and the check is not strict, it is a coin toss.
 */
const pulse = async (page, times = 8) => {
  const word = await hintRect(page);
  const series = [];
  for (let i =0; i < times; i += 1) {
    const r = await rodBox(page, word);
    if (r !== null) series.push(r);
    await page.waitForTimeout(120);
  }
  return series;
};

const range = (rows, pick, digits = 0) => {
  if (rows.length === 0) return 'nothing';
  const values = rows.map(pick);
  const spread = Math.max(...values) - Math.min(...values);
  return `${values[0].toFixed(digits)}→${values[values.length - 1].toFixed(digits)} (spread ${spread.toFixed(digits)})`;
};

/**
 * Take the rod out of the frame and ask the box whether anything happened.
 *
 * This is the instrument's own mutation test. The colour key's band and the rgb readings say the
 * rod's body ink (r 42) sits *below* the key's floor (55) and the ember (r 56) sits just outside the
 * window — if that is right, deleting every `rod*` mesh leaves the numbers alone, and then the
 * canvas half of the shipped check cannot be about the rod at all. If the numbers collapse instead,
 * my reading of the samples is wrong and the box does hold the rod. Only one of those is true, and
 * it is not settled by argument.
 */
const setRod = (page, wanted) =>
  page.evaluate((visible) => {
    const ctx = window.__pufflyScene?.context;
    if (!ctx) return { touched: -1, names: [] };
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let touched = 0;
    const names = [];
    scene.traverse((o) => {
      if (typeof o.name === 'string' && o.name.startsWith('rod')) {
        o.visible = visible;
        touched += 1;
        names.push(o.name);
      }
    });
    return { touched, names };
  }, wanted);

const rodMutation = await (async () => {
  // Paired, and alternating, for the same reason the cloud read is: the box swings by more than the
  // rod is worth between any two consecutive screenshots, so a single with/without pair measures the
  // room, not the rod. That is exactly the mistake the shipped check makes.
  const withRod = [];
  const withoutRod = [];
  let names = [];
  for (let i = 0; i < 4; i += 1) {
    const a = await rodBox(page, null);
    if (a !== null) withRod.push(a);
    const off = await setRod(page, false);
    names = off.names;
    await page.waitForTimeout(200);
    const b = await rodBox(page, null);
    if (b !== null) withoutRod.push(b);
    await setRod(page, true);
    await page.waitForTimeout(200);
  }
  const c = await rodBox(page, null);
  if (c !== null) withRod.push(c);
  const mean = (rows, pick) => (rows.length ? rows.reduce((acc, r) => acc + pick(r), 0) / rows.length : 0);
  return {
    names,
    withN: mean(withRod, (r) => r.n),
    withoutN: mean(withoutRod, (r) => r.n),
    withX: mean(withRod, (r) => r.meanX),
    withoutX: mean(withoutRod, (r) => r.meanX),
    // The box's own noise, measured on the rod-present reads alone.
    spreadN: Math.max(...withRod.map((r) => r.n)) - Math.min(...withRod.map((r) => r.n)),
    spreadX: Math.max(...withRod.map((r) => r.meanX)) - Math.min(...withRod.map((r) => r.meanX)),
  };
})();

/**
 * Where the drawn flame actually is, while it is lit.
 *
 * The idle frame gives a pixel ruler nothing to hold: the ember's own ink is rgb(55,50,42) and the
 * background under the same box averages red 55.2 — the burning end is not brighter than the room.
 * The one second the scene is `phase=light` is different, and that is the only window in which
 * "which side of the drawn rod carries the fire" can be answered from pixels rather than from the
 * state's own numbers. This measures whether that answer is separable at all, before a check is
 * written that claims it.
 */
const brightest = async (page, aim) => {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ b64, props }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const points = [props.body, props.ember].filter((p) => typeof p?.x === 'number');
      if (points.length === 0) return null;
      const xs = points.map((p) => p.x * img.width);
      const ys = points.map((p) => p.y * img.height);
      const pad = 30 * (img.width / window.innerWidth);
      const x0 = Math.max(0, Math.round(Math.min(...xs) - pad));
      const x1 = Math.min(img.width, Math.round(Math.max(...xs) + pad));
      const y0 = Math.max(0, Math.round(Math.min(...ys) - pad));
      const y1 = Math.min(img.height, Math.round(Math.max(...ys) + pad));
      const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let best = -1;
      let bx = 0;
      let by = 0;
      let warm = 0;
      for (let i = 0; i < region.length; i += 4) {
        const r = region[i];
        if (r - region[i + 2] < 12) continue;
        if (r > best) {
          best = r;
          const k = i / 4;
          bx = x0 + (k % (x1 - x0));
          by = y0 + Math.floor(k / (x1 - x0));
        }
        if (r > 120) warm += 1;
      }
      const bodyX = xs[0];
      const emberX = xs.length > 1 ? xs[1] : xs[0];
      return {
        rect: [x0, y0, x1 - x0, y1 - y0],
        brightestR: best,
        at: [bx, by],
        warmPx: warm,
        bodyX: Math.round(bodyX),
        emberX: Math.round(emberX),
        // Which side of the drawn body the fire is found on, in the frame, and whether that agrees
        // with where the state says the burning end is.
        sideFound: bx > bodyX ? 'right' : 'left',
        sideState: emberX > bodyX ? 'right' : 'left',
        agree: (bx > bodyX) === (emberX > bodyX),
        distFromEmber: Math.round(Math.hypot(bx - emberX, by - Math.round(ys[1] ?? by))),
      };
    },
    { b64: shot, props: aim },
  );
};

const pressAt = (page, at, down) =>
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

const canvasPoint = (page, nx, ny) =>
  page.evaluate(
    ([x, y]) => {
      const box = document.querySelector('canvas').getBoundingClientRect();
      return { x: box.left + box.width * x, y: box.top + box.height * y };
    },
    [nx, ny],
  );

/**
 * Light the rod and read the frame while the flame is alive, then mirror the picture and read it
 * again. The second half is the ruler's own counter-example: a check that claims to see which side
 * the fire is on has to change its answer when the fire is put on the other side. If the mirrored
 * read still "agrees", the clause is a coin toss wearing a name — which is what the reading above
 * found in the shipped check.
 */
const litSamples = async (page) => {
  const aim = await propsOf(page);
  if (aim.body === undefined || aim.ember === undefined) return { aim, samples: [], unlit: null };
  const at = await canvasPoint(page, aim.body.x, aim.body.y);
  const unlit = await brightest(page, aim);
  await pressAt(page, at, true);
  const samples = [];
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(140);
    const phase = await page.evaluate(() => document.querySelector('.stage')?.dataset.phase ?? '');
    samples.push({ phase, read: await brightest(page, aim) });
  }
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (c) c.style.transform = 'scaleX(-1)';
  });
  await page.waitForTimeout(220);
  const mirrored = await brightest(page, aim);
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (c) c.style.transform = '';
  });
  await page.waitForTimeout(220);
  const restored = await brightest(page, aim);
  await pressAt(page, at, false);
  await page.waitForTimeout(700);
  return { aim, samples, unlit, mirrored, restored };
};

await page.emulateMedia({ reducedMotion: 'no-preference' });
const pulseNormal = await pulse(page);
await page.emulateMedia({ reducedMotion: 'reduce' });
const pulseReduced = await pulse(page);
await page.emulateMedia({ reducedMotion: 'no-preference' });

const zhA = await readState(page);
await page.waitForTimeout(520);
const zhB = await readState(page);

/** The same route the device check takes: rail, sheet, language, close. Bounded everywhere. */
const wake = async (target) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = await page
      .locator(target)
      .isVisible()
      .catch(() => false);
    if (shown) return;
    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true })
      .catch(() => {});
    await page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (el === null) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        },
        target,
        { timeout: 2500, polling: 100 },
      )
      .catch(() => {});
  }
};

await wake('.rail [data-tab="settings"]');
await page
  .locator('.rail [data-tab="settings"]')
  .tap({ timeout: 3000 })
  .catch(() => {});
await page.waitForTimeout(500);
await wake('.sheet[data-open="true"] [data-language="ar"]');
const switched = await page
  .locator('.sheet[data-open="true"] [data-language="ar"]')
  .tap({ timeout: 3000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(520);
const doc = await page.evaluate(() => ({
  lang: document.documentElement.lang,
  dir: document.documentElement.dir,
}));
await page
  .locator('.sheet[data-open="true"] .close')
  .tap({ timeout: 3000 })
  .catch(() => {});
await page.waitForTimeout(420);
if (!switched || doc.dir !== 'rtl') {
  await fail(
    `the language never switched (tapped=${String(switched)}, ${doc.lang}/${doc.dir}) — ` +
      'the rows below would be one language measured twice.',
  );
}

const arA = await readState(page);
await page.waitForTimeout(520);
const arB = await readState(page);
// Last, because lighting the rod moves the thing every reading above is about.
const lit = await litSamples(page);
await browser.close();

const fmt = (r) =>
  `n=${String(r.on.n).padStart(6)} x=${r.on.meanX.toFixed(1).padStart(6)} | ` +
  `word n=${String(r.on.nWord).padStart(5)} x=${r.on.meanXWord.toFixed(1).padStart(6)} | ` +
  `out  n=${String(r.on.nOut).padStart(6)} x=${r.on.meanXOut.toFixed(1).padStart(6)} | ` +
  `cloud adds ${String(Math.round(r.on.n - r.off.n)).padStart(5)}, pulls ` +
    `${(r.on.meanX - r.off.meanX).toFixed(2)} px`;

const m = rodMutation;
const deltaN = Math.abs(m.withN - m.withoutN);
const deltaX = Math.abs(m.withX - m.withoutX);
console.log(
  `\ndeleting the rod from the frame — ${String(m.names.length)} meshes (${m.names.join(', ')}), ` +
    `paired and alternating five times:\n` +
    `  keyed pixels: with rod ${m.withN.toFixed(0)} vs without ${m.withoutN.toFixed(0)} → the rod is ` +
    `worth ${deltaN.toFixed(0)} of them (${((deltaN / m.withN) * 100).toFixed(1)}%)\n` +
    `  centroid: with rod ${m.withX.toFixed(1)} vs without ${m.withoutX.toFixed(1)} → ${deltaX.toFixed(1)} px\n` +
    `  the box's own noise on the rod-present reads alone: n ±${m.spreadN.toFixed(0)}, ` +
    `x ±${m.spreadX.toFixed(1)} px\n` +
    `  verdict: ${
      deltaN <= m.spreadN && deltaX <= m.spreadX
        ? 'the rod deleted from the scene changes the box by less than the box changes between two ' +
          'reads of an untouched page. This half of the check cannot see the rod, so it cannot ' +
          'decide a mirror claim in any language.'
        : 'the box does respond to the rod more than to its own noise, so the shipped reading has ' +
          'signal and only the tolerance was wrong.'
    }`,
);

console.log('\nthe same box, eight reads 120 ms apart, nothing asked of the page:');console.log(
  `  normal motion  n ${range(pulseNormal, (r) => r.n)}  x ${range(pulseNormal, (r) => r.meanX, 1)} px  ` +
    `band+ ${range(pulseNormal, (r) => r.nBright)}  band- ${range(pulseNormal, (r) => r.nDark)}  ` +
    `mean red ${range(pulseNormal, (r) => r.meanR, 1)}`,
);
console.log(
  `  reduced motion n ${range(pulseReduced, (r) => r.n)}  x ${range(pulseReduced, (r) => r.meanX, 1)} px  ` +
    `band+ ${range(pulseReduced, (r) => r.nBright)}  band- ${range(pulseReduced, (r) => r.nDark)}  ` +
    `mean red ${range(pulseReduced, (r) => r.meanR, 1)}`,
);
console.log(
  `  per read (n@x): normal ${pulseNormal.map((r) => `${Math.round(r.n)}@${r.meanX.toFixed(1)}`).join(' ')}\n` +
    `                reduced ${pulseReduced.map((r) => `${Math.round(r.n)}@${r.meanX.toFixed(1)}`).join(' ')}`,
);

console.log('\nthe check box, split by the word strip that is painted into the same frame:');
console.log(
  `  zh #1  ${fmt(zhA)}   hint=${JSON.stringify(zhA.word)} box=${JSON.stringify(zhA.on.box)}`,
);
console.log(`  zh #2  ${fmt(zhB)}`);
console.log(
  `  ar #1  ${fmt(arA)}   hint=${JSON.stringify(arA.word)} box=${JSON.stringify(arA.on.box)}`,
);
console.log(`  ar #2  ${fmt(arB)}`);

console.log(
  "\nwhile the rod is held, where the frame's hottest warm pixel is (can a pixel ruler see the fire?):",
);
const oneLine = (tag, s) =>
  s === null
    ? `  ${tag.padEnd(9)} nothing measured`
    : `  ${tag.padEnd(9)} brightest r=${String(s.brightestR).padStart(3)} at ${JSON.stringify(s.at)} | ` +
      `body x=${String(s.bodyX)} ember x=${String(s.emberX)} | found on the ${s.sideFound}, ` +
      `state says ${s.sideState} → agree=${String(s.agree)}, ${String(s.warmPx)} px above r=120`;
console.log(oneLine('unlit', lit.unlit));
lit.samples.forEach((s, i) => console.log(oneLine(`lit${String(i)}`, s.read) + ` (phase=${s.phase})`));
console.log(oneLine('mirrored', lit.mirrored));
console.log(oneLine('restored', lit.restored));
if (lit.mirrored !== null && lit.samples.length > 0) {
  const litAgree = lit.samples.every((s) => s.read !== null && s.read.agree);
  console.log(
    `  the ruler ${litAgree ? 'sees the fire on the state\u2019s side when nothing is injected' : 'does NOT consistently see the fire'}; ` +
      `under an injected mirror of the composited picture it reads agree=${String(lit.mirrored.agree)} — ` +
      `${!lit.mirrored.agree && litAgree ? 'it changes its answer when the thing it names moves. That is a ruler.' : 'it does not change its answer, so neither would a check built on it.'}`,
  );
}

const gap = (a, b, pick) => Math.abs(pick(a) - pick(b));
console.log('\nthe keyed set by row (top → bottom), and what sits under each published anchor:');
for (const [label, r] of [
  ['zh', zhB],
  ['ar', arA],
]) {
  console.log(`  ${label} rows: ${r.on.rows.join(' ')}   box=${JSON.stringify(r.on.box)}`);
  for (const name of Object.keys(r.on.spots).sort()) {
    const s = r.on.spots[name];
    console.log(
      `  ${label} ${name.padEnd(9)} at ${JSON.stringify(s.at)} rgb=${JSON.stringify(s.rgb)} ` +
        `keyed=${String(s.keyedShare).padStart(4)} bright=${String(s.brightShare).padStart(4)} ` +
        `inBox=${String(s.inBox)}`,
    );
  }
}

const controlZh = gap(zhA, zhB, (r) => r.on.meanX);
const controlAr = gap(arA, arB, (r) => r.on.meanX);
const control = Math.max(controlZh, controlAr, 0.2);
const crossSwitch = gap(zhB, arA, (r) => r.on.meanX);
const wordInk = zhA.on.nWord + zhB.on.nWord + arA.on.nWord + arB.on.nWord;
console.log('\ngaps, each against what the same rod produces over the same span in one language:');
console.log(
  `  control zh #1 → zh #2 (520 ms, no switch): ${controlZh.toFixed(2)} px`,
);
console.log(`  control ar #1 → ar #2: ${controlAr.toFixed(2)} px`);
console.log(
  `  across the language switch zh #2 → ar #1: ${crossSwitch.toFixed(2)} px ` +
    `(word-free ${gap(zhB, arA, (r) => r.on.meanXOut).toFixed(2)} px)`,
);
console.log(
  `  word ink keyed inside the box: ${String(wordInk)} px across all four reads — ` +
    (wordInk === 0
      ? 'none. The hint rect lies outside the box, so the vocabulary hypothesis is dead and the split above is vacuous.'
      : 'some of the box is the scene drawing the verb.'),
);
console.log(
  `\n  verdict: a language switch moves the check's centroid ${crossSwitch.toFixed(1)} px while ` +
    `${control.toFixed(1)} px is what the same rod in the same language reports over a single 520 ms ` +
    `gap — ` +
    (crossSwitch <= control
      ? 'the switch is indistinguishable from time passing. The red is the ruler: a centroid of a ' +
        'luminance band, sampled twice, on a frame that is animated. Nothing about the mirror claim ' +
        'is decided by it.'
      : `the switch is ${(crossSwitch / control).toFixed(1)}× the same-language control, so ` +
        'it is a real difference and the app has to explain it.'),
);
console.log(
  `  column profile of the keyed set (12 buckets, box left → right):\n` +
    `    zh ${zhB.on.profile.join(' ')}\n    ar ${arA.on.profile.join(' ')}`,
);
if (errors.length > 0) console.log(`\npage errors: ${errors.join(' | ')}`);

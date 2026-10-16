// CI's device job reports `openSheet(shelf) never opened` with `handle:"onscreen"`,
// `hitIsHandle:true` and `events:[]` — the press is aimed correctly and the button saw nothing. Two
// different failures wear that reading: the input never got delivered, or it was delivered to a node
// the probe is not listening on. `tapAt` swallows the error (`.catch(() => false)`), so a press that
// Playwright refused to make is invisible in the report.
//
// This asks the question with a positive control on the same node, and three routes:
//   A. locator.tap()  — what openSheet uses on a touch context (waits for the element to be stable)
//   B. touchscreen.tap(x, y) — raw coordinates, no actionability wait
//   C. mouse.click(x, y)     — the desktop route
// Each reports what the button's own listeners recorded, whether the sheet attached, and whether the
// node the probe is attached to is still the node in the document.
//
//   PUFFLY_CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu" \
//     node tests/smoke/probe-sheet-route.mjs http://127.0.0.1:4173/puffly/

import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4173/puffly/';
const SEL = '.hud [data-hook="category"]';
const ARGS = (process.env.PUFFLY_CHROME_ARGS ?? '').split(' ').filter(Boolean);

const browser = await chromium.launch(ARGS.length > 0 ? { channel: 'chromium', args: ARGS } : { channel: 'chromium' });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
/**
 * CI's runner has no GPU and runs the page at ~13 fps; this Mac reaches ~26 under the same flags,
 * which is fast enough to hide the whole family. `PUFFLY_CPU_THROTTLE` closes the gap on purpose so
 * the refusal can be seen locally instead of guessed at.
 */
const THROTTLE = Number(process.env.PUFFLY_CPU_THROTTLE ?? 0);
if (THROTTLE > 0) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}
await page.goto(URL_ARG, { waitUntil: 'load' });
await page
  .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 30000 })
  .catch(() => {});

/** Close what a previous route opened: three routes on one page share state otherwise, and the
 * second reading would be a toggle, not a press. (Measured that way on the first run of this file.) */
async function reset() {
  const open = await page.locator('.sheet[data-open="true"] .close').count().catch(() => 0);
  if (open > 0) await page.locator('.sheet[data-open="true"] .close').first().click().catch(() => {});
  await page.waitForTimeout(400);
}

async function arm() {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return;
    const w = window;
    w.__probeLog = [];
    w.__probeNode = el;
    for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart']) {
      el.addEventListener(type, () => w.__probeLog.push(type), { capture: true });
    }
  }, SEL);
}

async function read(label, extra = {}) {
  const out = await page.evaluate(
    ([sel, name]) => {
      const w = window;
      const live = document.querySelector(sel);
      return {
        route: name,
        log: w.__probeLog ?? 'no-probe',
        sameNode: live !== null && w.__probeNode === live,
        rect: live
          ? [
              Math.round(live.getBoundingClientRect().x),
              Math.round(live.getBoundingClientRect().y),
              Math.round(live.getBoundingClientRect().width),
              Math.round(live.getBoundingClientRect().height),
            ]
          : null,
        openAny: document.querySelectorAll('.sheet[data-open="true"]').length,
        frames: w.__pufflyScene?.frames ?? -1,
      };
    },
    [SEL, label],
  );
  console.log(JSON.stringify({ ...out, ...extra }));
  return out;
}

// Positive control: the listener must record a dispatch on the very node it sits on, or nothing below
// means anything.
await arm();
const control = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (el === null) return 'absent';
  window.__probeLog = [];
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  return window.__probeLog.slice();
}, SEL);
console.log(JSON.stringify({ route: 'control: synthetic dispatch', log: control }));

const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const at = window.performance.now();
      let n = 0;
      const tick = () => {
        n += 1;
        if (performance.now() - at < 1000) window.requestAnimationFrame(tick);
        else resolve(n);
      };
      window.requestAnimationFrame(tick);
    }),
);
console.log(JSON.stringify({ measuredFps: fps, throttle: THROTTLE }));

// A. the route openSheet actually uses on a touch context.
await reset();
await arm();
let err = null;
try {
  await page.locator(SEL).tap({ timeout: 2500 });
} catch (error) {
  err = String(error.message).split('\n')[0].slice(0, 120);
}
await read('A locator.tap', { thrown: err });

// B. the same coordinates, no actionability wait.
await reset();
await arm();
const box = await page.locator(SEL).boundingBox().catch(() => null);
if (box === null) {
  console.log(JSON.stringify({ route: 'B', error: 'no box' }));
} else {
  await page.evaluate(() => {
    window.__probeLog = [];
  });
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1200);
  await read('B touchscreen.tap');
}

// C. the desktop route.
await reset();
await arm();
await page.evaluate(() => {
  window.__probeLog = [];
});
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(1200);
await read('C mouse.click');

await browser.close();

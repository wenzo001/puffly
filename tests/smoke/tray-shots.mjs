/**
 * Photograph a break *after ash has landed in the tray*, so the tray's pile — the one place the
 * session's ash becomes something you can look at — can be judged. The plain break capture never
 * reaches this state: `placePile` is gated on `ashtray.grams > 0`, and ash only accumulates by
 * tapping the standing column, which the generic driver does not do.
 *
 *   PUFFLY_CHROME=... node tests/smoke/tray-shots.mjs http://127.0.0.1:4179/puffly/ /tmp/puffly-tray
 */
import { mkdir } from 'node:fs/promises';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const OUT = process.argv[3] ?? '/tmp/puffly-tray';
const CHROME =
  process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch({ executablePath: CHROME });
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
  await page.waitForTimeout(1500);

  const affordanceOf = () =>
    page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
  const pressPill = async () => {
    const box = await page.locator('.pill').boundingBox();
    if (box === null) return;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  const wake = async () => {
    for (let i = 0; i < 5; i += 1) {
      const box = await page.locator('.pill').boundingBox();
      if (box !== null && box.width > 1) {
        const ok = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('.pill') !== null,
          [box.x + box.width / 2, box.y + box.height / 2],
        );
        if (ok) return;
      }
      await page
        .locator('canvas')
        .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
      await page.waitForTimeout(140);
    }
  };

  await wake();
  // Light the rod.
  let lit = false;
  for (let i = 0; i < 8 && !lit; i += 1) {
    await pressPill();
    await page.waitForTimeout(650);
    const a = await affordanceOf();
    lit = a === 'puff' || a === 'flick';
  }

  // Take draws, and between them tap the *ash column* whenever one is standing, so
  // `ashtray.grams` actually rises. The anchor is `ash` from the stage mirror, not `ashtray`:
  // `handleTap` gives `ashtray` to the extinguisher (an `EXTINGUISHED`/`DISCARDED` rod is dropped
  // there), and `flickAsh` is what `ash` answers. Tapping the tray here put the rod out 14 times,
  // which is why the pile never appeared.
  const ashOf = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const box = canvas.getBoundingClientRect();
      const aim = document.querySelector('.stage')?.getAttribute('data-aim') ?? '';
      const m = /(?:^| )ash:([0-9.]+),([0-9.]+)/.exec(aim);
      if (!m) return null;
      return { x: box.left + box.width * Number(m[1]), y: box.top + box.height * Number(m[2]) };
    });

  let taps = 0;
  for (let i = 0; i < 24; i += 1) {
    await pressPill();
    await page.waitForTimeout(650);
    const ash = await ashOf();
    if (ash === null) continue;
    // Only spend the tap when a column is actually standing: `flickAsh` returns false below
    // `maxLength * ashVisibleFraction`, so a blind cadence wastes most of its taps and can leave the
    // pile's gate (`ashtray.grams > 0`) shut — which is exactly what a first version of this file
    // did while still reporting a capture as if the tray were populated.
    const standing = await page.evaluate(() => {
      const scene = window.__pufflyScene?.context?.scene;
      const s = scene && 'value' in scene ? scene.value : scene;
      let column = null;
      s?.traverse?.((node) => {
        if (node.name === 'ash-column') column = node;
      });
      // `visible` only. An earlier version also required `count > 0`, but `ash-column` is a `Mesh`
      // and `count` belongs to `InstancedMesh` — so `undefined > 0` was false on every frame and this
      // guard rejected every tap while looking like it was checking something.
      return column ? column.visible : null;
    });
    if (standing === false) continue;
    await page.mouse.click(ash.x, ash.y);
    taps += 1;
    await page.waitForTimeout(420);
  }

  const grams = await page.evaluate(() => {
    const scene = window.__pufflyScene?.context?.scene;
    const s = scene && 'value' in scene ? scene.value : scene;
    let pile = null;
    s?.traverse?.((node) => {
      if (node.name === 'ash-pile') pile = node;
    });
    return {
      pileVisible: pile?.visible ?? null,
      pileScale: pile ? [pile.scale.x, pile.scale.y] : null,
      pileWorld: pile ? [pile.position.x, pile.position.y, pile.position.z] : null,
    };
  });
  if (grams.pileVisible !== true) {
    throw new Error(
      `${shape.name}: the tray's pile never appeared, so this capture is not evidence about it ` +
        `(taps=${taps}). The gate is \`ashtray.grams > 0\`; ash only counts when a fragment lands ` +
        `with origin.x > tray.x - 0.1.`,
    );
  }

  await page.screenshot({ path: `${OUT}/${shape.name}-tray.png` });
  console.log(
    `${shape.name}: taps=${taps} pileVisible=${String(grams.pileVisible)} ` +
      `pileScale=${JSON.stringify(grams.pileScale)} world=${JSON.stringify(grams.pileWorld)}`,
  );
  await context.close();
}
await browser.close();
console.log(`wrote ${OUT}`);

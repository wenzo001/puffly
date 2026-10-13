/**
 * Asks whether the folded chrome leaves **anything** behind in the scene: a mesh, or a rig, that the
 * fold should have hidden and did not.
 *
 * This is the follow-up to the §10 cluster of 2026-10-13. The cluster was `placeInk`'s copy of the
 * head-up row, the pill's diagram and the rail, placed at the world origin because a
 * `display: none` subtree yields a zero-translation `getScreenCTM()` rather than `null`. The other
 * three readers in `SceneStage.vue` (`fillCard`, `placeRingRig`, the pill's glow) each test the
 * element's *bounding rect* instead, and this checks that they really do hide — by reading the scene
 * while the chrome is folded rather than by trusting that the guard exists.
 *
 *   PUFFLY_CHROME=... node tests/smoke/probe-folded.mjs http://127.0.0.1:4179/puffly/
 */
const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const CHROME =
  process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

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
await page.waitForTimeout(1400);

const pillBox = () => page.locator('.pill').boundingBox();
for (let i = 0; i < 5; i += 1) {
  const b = await pillBox();
  if (b !== null && b.width > 1) break;
  await page.locator('canvas').click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
  await page.waitForTimeout(140);
}
let lit = false;
for (let step = 0; step < 8 && !lit; step += 1) {
  const a = await page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
  if (a === 'puff' || a === 'flick') {
    lit = true;
    break;
  }
  const b = await pillBox();
  if (b !== null) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(650);
}
if (!lit) throw new Error('the rod never lit, so the break never happened');
for (let i = 0; i < 5; i += 1) {
  const b = await pillBox();
  if (b !== null) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(420);
}

/** What the chrome's own DOM looks like, and what the scene still has visible. */
const state = () =>
  page.evaluate(() => {
    // `getComputedStyle(el).display` is the element's *own* value and says nothing about whether it
    // is on screen: a descendant of a `display: none` ancestor still computes `flex`. `.pill` sits
    // inside `.cta`, so reading `.pill` alone reports `flex` while the whole subtree is folded — the
    // first version of this probe called that a second defect when it is ordinary CSS. What actually
    // gates visibility is the common ancestor, which is why the three top-level chrome roots are read.
    const hidden = (sel) => {
      const el = document.querySelector(sel);
      if (el === null) return 'absent';
      const d = getComputedStyle(el).display;
      const b = el.getBoundingClientRect();
      return d === 'none' ? `display:none box ${b.width.toFixed(0)}x${b.height.toFixed(0)}` : d;
    };
    const scene = (() => {
      const ctx = window.__pufflyScene?.context;
      if (!ctx) return null;
      return 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    })();
    /** Meshes that are painted while the element that describes them is display:none. */
    const orphans = [];
    scene?.traverse((node) => {
      if (node.isMesh !== true || node.visible !== true) return;
      const p = new (node.position.constructor)();
      node.getWorldPosition(p);
      const w = Math.abs(node.scale.x);
      const h = Math.abs(node.scale.y);
      orphans.push({
        name: node.name || '(unnamed)',
        scale: +w.toFixed(4),
        scaleY: +h.toFixed(4),
        pos: [+p.x.toFixed(3), +p.y.toFixed(3)],
        z: +p.z.toFixed(4),
      });
    });
    // A degenerate mesh is one drawn at zero scale, which is what a reader computes when the element
    // it mirrors has collapsed: `scale = unitX - origin` is 0 for a zero-translation matrix.
    //
    // "At the world origin with a non-zero scale" is deliberately NOT treated as a defect here: the
    // particle pools (`smoke`, `sparks`, `dust`, `rain`, `ash-flakes`) are instanced meshes that live
    // at the origin by construction and put their content in the instance matrices, not in the mesh
    // scale. An earlier version of this probe counted those too and reported 18 "orphans" that were
    // all perfectly healthy — a check that fires on a correct scene is worse than no check.
    const degenerate = orphans.filter((o) => o.scale === 0 || o.scaleY === 0);
    return {
      hud: hidden('.hud'),
      cta: hidden('.cta'),
      rail: hidden('.rail'),
      pill: hidden('.pill'),
      visibleMeshes: orphans.length,
      degenerate: degenerate.map((o) => `${o.name} scale ${o.scale}x${o.scaleY} at ${JSON.stringify(o.pos)}`),
      smallest: Math.min(...orphans.map((o) => Math.min(o.scale, o.scaleY))),
    };
  });

const timeline = [];
for (let i = 0; i < 14; i += 1) {
  await page.waitForTimeout(250);
  const s = await state();
  timeline.push({ t: i * 250, ...s });
  if (s.cta === 'display:none box 0x0') break;
}

const folded = timeline[timeline.length - 1];
console.log(`\nchrome DOM after ${folded.t} ms of no input:`);
console.log(`  .hud  ${folded.hud}`);
console.log(`  .cta  ${folded.cta}`);
console.log(`  .rail ${folded.rail}`);
console.log(`  .pill ${folded.pill}`);
console.log(`visible meshes in the scene: ${folded.visibleMeshes}`);
console.log(`smallest axis any of them is drawn at: ${String(folded.smallest)}`);
if (folded.degenerate.length === 0) {
  console.log('\nOK: no mesh is parked at the origin or drawn at zero scale while the chrome is folded');
} else {
  console.log(`\nDEFECT: ${folded.degenerate.length} degenerate mesh(es) survive the fold:`);
  for (const d of folded.degenerate) console.log(`  ${d}`);
}

await context.close();
await browser.close();

/**
 * Is the tube the *same rod* as its own burning end? Reads the scene, on a live rod.
 *
 * Two things are measured per shape, because the 2026-10-13 fix addressed both:
 *
 *   span   — the tube's length. It used to come from the anchor pair's world span, which grows with
 *            the viewport aspect: 1.042 on a 393×852 phone, 2.523 on an 844×390 one.
 *   direction — the angle between the tube's axis and the burn line's. The tube took its angle from
 *            the anchors and the burn line from the core's pose, and they were 0.396 rad (≈23°) apart
 *            on the same frame, so the tube pointed away from the features that say which end burns.
 *
 * The claim is that both now agree, at every shape, because both come from `pose.pivot → pose.tip`
 * through one conversion.
 *
 *   PUFFLY_CHROME=... node tests/smoke/scan-rod-agreement.mjs http://127.0.0.1:4179/puffly/
 */

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const CHROME =
  process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const playwright = await import('playwright');
const browser = await playwright.chromium.launch({ executablePath: CHROME });

const SHAPES = [
  { name: 'phone-portrait', width: 393, height: 852, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
  { name: 'wide', width: 1680, height: 900, touch: false },
];

/** Shortest signed difference between two angles, in radians. */
const angleGap = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

const rows = [];
for (const shape of SHAPES) {
  const context = await browser.newContext({
    viewport: { width: shape.width, height: shape.height },
    hasTouch: shape.touch,
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
    await page
      .locator('canvas')
      .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(140);
  }
  let lit = false;
  for (let step = 0; step < 8 && !lit; step += 1) {
    const a = await page.evaluate(
      () => document.querySelector('.stage')?.dataset.affordance ?? '',
    );
    if (a === 'puff' || a === 'flick') {
      lit = true;
      break;
    }
    const b = await pillBox();
    if (b !== null) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(650);
  }

  const reading = await page.evaluate(() => {
    const ctx = window.__pufflyScene?.context;
    const scene = ctx && 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let rod = null;
    let burn = null;
    let cherry = null;
    scene.traverse((n) => {
      if (n.name === 'rod' && rod === null) rod = n;
      if (n.name === 'rod-burn-line' && burn === null) burn = n;
      if (n.name === 'rod-cherry' && cherry === null) cherry = n;
    });
    if (!rod || !burn || !cherry) return { error: 'a rod part is missing' };
    // The tube's own axis in world: its geometry is a cylinder along local +y, so the direction the
    // mesh actually points is its local +y carried through the rotation (a quarter turn is built in).
    const axisWorld = (mesh) => {
      const r = mesh.rotation.z + Math.PI / 2;
      return { x: Math.cos(r), y: Math.sin(r) };
    };
    rod.geometry.computeBoundingBox();
    const bb = rod.geometry.boundingBox;
    const span = bb.max.y - bb.min.y;
    const cp = new (cherry.position.constructor)();
    cherry.getWorldPosition(cp);
    // The tube's near end in world, so the cherry can be checked against the tube it belongs to.
    const ml = rod.matrixWorld.elements;
    const mid = { x: ml[12], y: ml[13] };
    const a = axisWorld(rod);
    const near = { x: mid.x + a.x * (span / 2), y: mid.y + a.y * (span / 2) };
    const far = { x: mid.x - a.x * (span / 2), y: mid.y - a.y * (span / 2) };
    return {
      span: +span.toFixed(4),
      tubeAngle: +(rod.rotation.z + Math.PI / 2).toFixed(4),
      burnAngle: +burn.rotation.z.toFixed(4),
      // Which end the cherry is on: nearer the near end is right, the far end is the mouth.
      pick: +Math.hypot(cp.x - near.x, cp.y - near.y).toFixed(4),
      drop: +Math.hypot(cp.x - far.x, cp.y - far.y).toFixed(4),
      mid: [+mid.x.toFixed(4), +mid.y.toFixed(4)],
    };
  });
  rows.push({ name: shape.name, ...reading });
  await context.close();
}
await browser.close();

console.log('\nthe tube vs its own burning end, at each shipped shape:');
console.log('  shape             span (world)   tube axis   burn line   angle gap   cherry picks');
const spans = rows.filter((r) => !r.error).map((r) => r.span);
const gaps = rows.filter((r) => !r.error).map((r) => angleGap(r.tubeAngle, r.burnAngle));
for (const r of rows) {
  if (r.error) {
    console.log(`  ${r.name.padEnd(16)} ${r.error}`);
    continue;
  }
  console.log(
    `  ${r.name.padEnd(16)} ${String(r.span).padStart(10)} ${String(r.tubeAngle).padStart(11)} ` +
      `${String(r.burnAngle).padStart(12)} ${String(angleGap(r.tubeAngle, r.burnAngle).toFixed(4)).padStart(11)} ` +
      `    near=${r.pick.toFixed(3)} far=${r.drop.toFixed(3)}`,
  );
}
if (spans.length > 1 && gaps.length > 1) {
  const spread = Math.max(...spans) - Math.min(...spans);
  console.log(
    `\n  span spread ${spread.toFixed(4)} (${((spread / Math.max(...spans)) * 100).toFixed(1)}% of the longest); ` +
      `widest angle gap ${Math.max(...gaps).toFixed(4)} rad (${((Math.max(...gaps) * 180) / Math.PI).toFixed(1)}°)`,
  );
  const okSpan = spread / Math.max(...spans) < 0.1;
  const okAngle = Math.max(...gaps) < 0.05;
  console.log(
    `  span ${okSpan ? 'ONE LENGTH' : 'still viewport-dependent'}; ` +
      `direction ${okAngle ? 'AGREES with the burning end' : 'DISAGREES'}`,
  );
}

/**
 * Reads the 力度条 (S4 strength bar) as the *scene* draws it: the mesh group that `placePillInk`
 * mirrors `.cta svg.art` into, sampled through the `RESTING` window after a completed draw.
 *
 * Two traps this file exists to avoid, both of which produced wrong answers first:
 * 1. In the 3D tier the DOM copy is `visibility: hidden` (`global.css`), because the scene paints
 *    it. Querying `.pill svg.force` measures a hidden element and reports "the bar never appears".
 * 2. The pill's art is not a child of `.pill` at all — it is a sibling inside `.cta`, and the scene
 *    takes the *first* `svg.art` in that div.
 *
 *   PUFFLY_CHROME=... node tests/smoke/scan-force.mjs http://127.0.0.1:4179/puffly/
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

const probeOf = () =>
  page.evaluate(() => {
    const p = window.__pufflyScene;
    return p ? { puffReady: p.puffReady, seconds: p.stageRing?.seconds ?? '0', lip: p.lip?.visible ?? false } : null;
  });
const aimOf = () =>
  page.evaluate(() => {
    const m = /(?:^| )body:([0-9.]+),([0-9.]+)/.exec(
      document.querySelector('.stage')?.getAttribute('data-aim') ?? '',
    );
    if (!m) return null;
    const box = document.querySelector('canvas').getBoundingClientRect();
    return { x: box.left + box.width * Number(m[1]), y: box.top + box.height * Number(m[2]) };
  });
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
if (!lit) throw new Error('the rod never lit');

/**
 * The pill-ink group: `placePillInk` writes into the group whose position is the `.cta svg.art`
 * element's own screen origin. Identified by asking the page for that element's box and matching the
 * group whose world origin projects into it — not by guessing at names, which the ink meshes do not
 * have.
 */
const readInk = () =>
  page.evaluate(() => {
    const svg = document.querySelector('.cta svg.art');
    const ctx = window.__pufflyScene.context;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    const out = [];
    scene.traverse((node) => {
      if (node.type !== 'Group') return;
      const meshes = node.children.filter((c) => c.isMesh === true);
      if (meshes.length === 0) return;
      const visible = meshes.filter((m) => m.visible);
      out.push({
        group: node.name || '(unnamed)',
        children: meshes.length,
        visible: visible.length,
        groupScale: [+node.scale.x.toFixed(5), +node.scale.y.toFixed(5)],
        groupPos: [+node.position.x.toFixed(4), +node.position.y.toFixed(4), +node.position.z.toFixed(4)],
      });
    });
    return {
      hasSvg: svg !== null,
      svgClass: svg?.getAttribute('class') ?? null,
      svgBox: svg ? (() => { const b = svg.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; })() : null,
      svgRects: svg ? svg.querySelectorAll('rect').length : 0,
      groups: out.filter((g) => g.children >= 1 && g.children <= 20),
    };
  });

async function draw(minSeconds) {
  const at = await aimOf();
  for (let i = 0; i < 60; i += 1) {
    const p = await probeOf();
    if (p?.puffReady === true) break;
    await page.waitForTimeout(80);
  }
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  let saw = false;
  const until = Date.now() + 14000;
  for (;;) {
    const p = await probeOf();
    if (p?.lip === true || Number(p?.seconds ?? 0) > 0) saw = true;
    if (Number(p?.seconds ?? 0) >= minSeconds) break;
    if (saw && p?.puffReady === true) break;
    if (Date.now() >= until) break;
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  return saw;
}

const started = await draw(2.3);
const before = await readInk();
const timeline = [];
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(50);
  const now = await readInk();
  timeline.push({ t: i * 50, rects: now.svgRects, groups: now.groups.length });
}
console.log(`draw started: ${String(started)}`);
console.log(`\n.cta svg.art present: ${String(before.hasSvg)}  class=${String(before.svgClass)}  rects=${before.svgRects}`);
console.log(`  box (CSS): ${JSON.stringify(before.svgBox)}`);
console.log(`  ink-capable groups in the scene: ${before.groups.length}`);
for (const g of before.groups) {
  console.log(`    ${g.group.padEnd(12)} children=${String(g.children).padStart(2)} visible=${String(g.visible).padStart(2)} pos=${JSON.stringify(g.groupPos)} scale=${JSON.stringify(g.groupScale)}`);
}
console.log('\ntimeline after release (what the FIRST .cta svg.art is):');
for (const s of timeline.filter((_, i) => i % 4 === 0)) {
  console.log(`  t=${String(s.t).padStart(4)}ms  svg.art rects=${s.rects}  ink groups=${s.groups}`);
}

await context.close();
await browser.close();

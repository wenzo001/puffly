// On a software-rendered page, after the state says the rod is lit: what is actually under the
// lighter, and what does the scene think the flame is?
import { chromium } from 'playwright';

const URL = process.env.PUFFLY_URL || 'http://127.0.0.1:4173/puffly/';
// The same handle the suite uses, so this probe can stand on the CI page rather than a healthy one.
const browser = await chromium.launch(
  process.env.PUFFLY_CHROME_ARGS
    ? { args: process.env.PUFFLY_CHROME_ARGS.split(' ').filter(Boolean) }
    : {},
);
const page = await (
  await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('.stage[data-aim]', { timeout: 30000 });

const dump = () =>
  page.evaluate(`(() => {
    const ctx = window.__pufflyScene.context;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    const out = { nodes: [], twoPxMeshes: 0, states: {}, probe: {} };
    scene.traverse((o) => {
      const w = o.material?.map?.image?.width;
      if (o.isMesh && w === 2) out.twoPxMeshes += 1;
      if (o.name) {
        out.nodes.push({
          name: o.name,
          type: o.type,
          visible: o.visible,
          rotX: o.rotation ? +o.rotation.x.toFixed(3) : null,
          scale: o.scale ? [+o.scale.x.toFixed(3), +o.scale.y.toFixed(3)] : null,
          texW: w ?? null,
        });
      }
    });
    const p = window.__pufflyScene;
    out.probe = { frames: p.frames, backend: p.backend, particles: p.particles };
    // The flame is the mesh whose texture is 2 px wide (the same handle the suite reads it by); the
    // cap is the lighter-lid group's rotation. Record both explicitly instead of only counting them.
    scene.traverse((o) => {
      if (o.isMesh && o.material?.map?.image?.width === 2 && o.visible) out.flameVisible = true;
      if (o.name === 'lighter-lid') out.lid = +o.rotation.x.toFixed(3);
    });
    const st = document.querySelector('.stage');
    out.states = {
      phase: st?.dataset.phase,
      affordance: st?.dataset.affordance,
      pill: document.querySelector('.cta')?.dataset.affordance,
    };
    return out;
  })()`);

const before = await dump();
// Pick the rod up, then ask for the lighter, then press the pill — the phone's own gesture path.
const aim = await page.evaluate(() => {
  const raw = document.querySelector('.stage')?.dataset.aim ?? '';
  const box = document.querySelector('.stage')?.getBoundingClientRect();
  const found = {};
  for (const part of raw.split(' ')) {
    const i = part.indexOf(':');
    if (i > 0) {
      const [k, v] = [part.slice(0, i), part.slice(i + 1)];
      const [fx, fy] = v.split(',').map(Number);
      if (Number.isFinite(fx) && Number.isFinite(fy)) found[k] = { x: box.left + fx * box.width, y: box.top + fy * box.height };
    }
  }
  return found;
});
if (aim.pack ?? aim.rod) {
  const t = aim.pack ?? aim.rod;
  await page.touchscreen.tap(t.x, t.y);
}
await page.waitForTimeout(1500);
const lit1 = await dump();
await page.locator('.pill').click({ timeout: 5000 }).catch(() => {});
// The cap's throw and the flame's arrival are one short window; sampling it at 250 ms is what tells
// "the animation never ran" apart from "it ran and shut again before I looked".
const trace = [];
for (let i = 0; i < 32; i++) {
  const d = await dump();
  trace.push({
    f: d.probe.frames,
    phase: d.states.phase,
    lid: d.lid ?? null,
    flame: d.flameVisible === true,
  });
  await page.waitForTimeout(250);
}
console.log('trace', JSON.stringify(trace.filter((t, i) => i % 2 === 0)));
await page.waitForTimeout(4000);
const lit2 = await dump();
await page.waitForTimeout(6000);
const lit3 = await dump();

const summarise = (d) => ({
  frames: d.probe.frames,
  backend: d.probe.backend,
  particles: d.probe.particles,
  ...d.states,
  twoPxMeshes: d.twoPxMeshes,
  lighterNodes: d.nodes.filter((n) => /(^|[^a-z])(flame|lighter|lid|cap|chimney|ember)([^a-z]|$)/i.test(n.name)).slice(0, 14),
});
console.log('aim keys', JSON.stringify(Object.keys(aim)));
console.log('before', JSON.stringify(summarise(before), null, 1));
console.log('after tap', JSON.stringify(summarise(lit1), null, 1));
console.log('+pill 4s', JSON.stringify(summarise(lit2), null, 1));
console.log('+pill 10s', JSON.stringify(summarise(lit3), null, 1));
await browser.close();

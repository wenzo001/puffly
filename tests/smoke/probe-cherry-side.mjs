/**
 * Can "which end of the drawn rod carries the fire" be decided deterministically, without racing a
 * screenshot against a one-second flame?
 *
 * The pixel version of that check was measured and is being retired: on 2026-10-17 the same claim read
 * `r=138 / warmPx 7,508` in one run, `r=108 / warmPx 0` in the next (three pill presses in, the flame
 * already out, the pose moved so the state itself said `left`), against an idle frame's `r=71 / 0`. The
 * fire's ink is real but the window is not — a screenshot is a single moment, and the moment has to
 * coincide with the flame, the pose, and the arm all at once.
 *
 * So: read the mesh the renderer is about to draw, and project it. `data-aim`'s ember comes from the
 * core state (`usePuffly.ts` publishes `summary.aim`, not the scene graph), so comparing the projected
 * cherry against the published anchor is a seam test rather than a tautology.
 *
 * This probe answers three questions, in order:
 *   1. where do `rod`, `rod-cherry`, `rod-char`, `rod-tip-ash`, `rod-burn-line` sit on screen, and do
 *      they agree with the published `body`/`ember` anchors;
 *   2. which injection moves the drawn cherry to the other side of the rod's own centre — mirroring its
 *      parent group, or negating its offset along the tube's axis; a clause is only worth shipping if
 *      one of them does;
 *   3. how steady the reading is across frames (a projection that jitters 0.0001 is a gate; one that
 *      changes sign between frames is another screenshot in disguise).
 *
 *   node tests/smoke/probe-cherry-side.mjs http://localhost:5175/
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
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForTimeout(1400);

const NAMES = ['rod', 'rod-cherry', 'rod-char', 'rod-tip-ash', 'rod-burn-line'];

/**
 * Project every named rod part, plus the published anchors, into CSS pixels of the canvas.
 *
 * `kind` says which injection is available: the parent's node type, and whether the cherry's offset
 * along the parent's local axes is the thing that puts it at an end.
 */
const sideReading = () =>
  page.evaluate((names) => {
    const ctx = window.__pufflyScene?.context;
    if (!ctx) return { error: 'no scene' };
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    const camera = ctx.camera?.activeCamera?.value ?? ctx.camera;
    if (!camera) return { error: 'no camera' };
    const canvas = document.querySelector('canvas');
    const box = canvas.getBoundingClientRect();

    const found = {};
    scene.traverse((o) => {
      if (names.includes(o.name)) found[o.name] = o;
    });
    const project = (o) => {
      const p = o.getWorldPosition(o.position.clone());
      p.project(camera);
      return { x: (p.x * 0.5 + 0.5) * box.width + box.left, y: (-p.y * 0.5 + 0.5) * box.height + box.top };
    };
    const raw = document.querySelector('.stage')?.dataset.aim ?? '';
    const anchors = {};
    for (const part of raw.split(' ')) {
      const [name, pair] = part.split(':');
      const [x, y] = (pair ?? '').split(',').map(Number);
      if (Number.isFinite(x)) anchors[name] = { x: box.left + box.width * x, y: box.top + box.height * y };
    }
    const describe = (o) =>
      o === undefined
        ? null
        : {
            at: project(o),
            parent: `${o.parent?.type ?? '?'}${o.parent?.name ? `#${o.parent.name}` : ''}`,
            local: [+o.position.x.toFixed(4), +o.position.y.toFixed(4), +o.position.z.toFixed(4)],
            parentScale: o.parent ? [+o.parent.scale.x.toFixed(3), +o.parent.scale.y.toFixed(3)] : null,
          };
    return {
      anchors,
      rod: describe(found.rod),
      cherry: describe(found['rod-cherry']),
      char: describe(found['rod-char']),
      tipAsh: describe(found['rod-tip-ash']),
      burnLine: describe(found['rod-burn-line']),
    };
  }, NAMES);

const applyInjection = (mode, on) =>
  page.evaluate(
    ({ mode: how, enabled }) => {
      const ctx = window.__pufflyScene?.context;
      const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
      let cherry = null;
      scene.traverse((o) => {
        if (o.name === 'rod-cherry') cherry = o;
      });
      if (cherry === null) return 'no cherry';
      if (how === 'parentScale') {
        if (!cherry.parent) return 'no parent';
        cherry.parent.scale.x = enabled ? -Math.abs(cherry.parent.scale.x) : Math.abs(cherry.parent.scale.x);
        cherry.parent.updateMatrixWorld(true);
        return `parent.scale.x=${cherry.parent.scale.x}`;
      }
      if (how === 'localX') {
        if (enabled) {
          cherry.userData.__sx = -cherry.position.x;
          cherry.position.x = cherry.userData.__sx;
        } else {
          cherry.position.x = -cherry.userData.__sx;
        }
        cherry.updateMatrixWorld(true);
        return `position.x=${cherry.position.x.toFixed(4)}`;
      }
      return 'unknown mode';
    },
    { mode, on },
  );

const walkToPuff = async () => {
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
    if (puff) return true;
  }
  return false;
};

const base = await sideReading();
console.log('\nat rest, projected into CSS px of the canvas:');
console.log(
  `  anchors body=${JSON.stringify(base.anchors?.body)} ember=${JSON.stringify(base.anchors?.ember)}`,
);
for (const key of ['rod', 'cherry', 'char', 'tipAsh', 'burnLine']) {
  const r = base[key];
  console.log(
    `  ${key.padEnd(9)} ${r === null ? 'ABSENT' : `at=${JSON.stringify([Math.round(r.at.x), Math.round(r.at.y)])} local=${JSON.stringify(r.local)} parent=${r.parent}`}`,
  );
}

const lit = await walkToPuff();
console.log(`\nwalking to a lit rod via the pill: ${String(lit)}`);
const litRead = await sideReading();
console.log(
  `  body=${JSON.stringify([Math.round(litRead.anchors.body.x), Math.round(litRead.anchors.body.y)])} ` +
    `ember=${JSON.stringify([Math.round(litRead.anchors.ember.x), Math.round(litRead.anchors.ember.y)])} ` +
    `cherry=${JSON.stringify([Math.round(litRead.cherry?.at.x ?? -1), Math.round(litRead.cherry?.at.y ?? -1)])} ` +
    `rodCentre=${JSON.stringify([Math.round(litRead.rod?.at.x ?? -1), Math.round(litRead.rod?.at.y ?? -1)])}`,
);
if (litRead.cherry && litRead.rod) {
  console.log(
    `  drawn side (cherry vs rod centre): ${litRead.cherry.at.x > litRead.rod.at.x ? 'right' : 'left'} | ` +
      `state side (ember vs body): ${litRead.anchors.ember.x > litRead.anchors.body.x ? 'right' : 'left'} | ` +
      `cherry vs ember anchor dx=${(litRead.cherry.at.x - litRead.anchors.ember.x).toFixed(2)} px`,
  );
}

console.log('\nstability across five reads with nothing injected:');
for (let i = 0; i < 5; i += 1) {
  const r = await sideReading();
  console.log(
    `  ${String(i)} cherry.x=${r.cherry?.at.x.toFixed(3) ?? 'x'} rod.x=${r.rod?.at.x.toFixed(3) ?? 'x'} ` +
      `ember.x=${r.anchors?.ember.x.toFixed(3) ?? 'x'}`,
  );
  await page.waitForTimeout(140);
}

for (const mode of ['parentScale', 'localX']) {
  const before = await sideReading();
  const applied = await applyInjection(mode, true);
  const after = await sideReading();
  await applyInjection(mode, false);
  const undone = await sideReading();
  const sideOf = (r) => (r.cherry && r.rod ? (r.cherry.at.x > r.rod.at.x ? 'right' : 'left') : '?');
  console.log(`\ninjection ${mode} (${String(applied)}):`);
  console.log(
    `  before side=${sideOf(before)} cherry.x=${before.cherry?.at.x.toFixed(2)} | ` +
      `after side=${sideOf(after)} cherry.x=${after.cherry?.at.x.toFixed(2)} | ` +
      `undone side=${sideOf(undone)} cherry.x=${undone.cherry?.at.x.toFixed(2)}`,
  );
  console.log(
    `  → ${sideOf(before) !== sideOf(after) ? 'FLIPS the drawn side (usable counter-example)' : 'does not flip it'}` +
      `${sideOf(undone) === sideOf(before) ? '，且撤销后回到原位' : '，⚠ 撤销后没回到原位（会污染后面所有读数）'}`,
  );
}

await browser.close();
if (errors.length > 0) console.log(`\npage errors: ${errors.slice(0, 3).join(' | ')}`);

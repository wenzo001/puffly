/**
 * Reads the tray rig's actual scene-graph state: the tray disc, the ash pile, the rim and the halo,
 * each with its world position, scale, rotation and visibility, plus the anchor the pile was placed
 * from. This is how "the pile is drawn in the tray" stops being a guess about pixels.
 *
 *   PUFFLY_CHROME=... node tests/smoke/probe-tray.mjs http://127.0.0.1:4179/puffly/
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
const pressPill = async () => {
  const box = await pillBox();
  if (box === null) return;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const wake = async () => {
  for (let i = 0; i < 5; i += 1) {
    const box = await pillBox();
    if (box !== null && box.width > 1) {
      const ok = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('.pill') !== null,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      if (ok) return;
    }
    await page.locator('canvas').click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(140);
  }
};
await wake();

// Light the rod, then knock ash in so the pile is actually placed.
let lit = false;
for (let i = 0; i < 8 && !lit; i += 1) {
  await pressPill();
  await page.waitForTimeout(650);
  const a = await page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
  lit = a === 'puff' || a === 'flick';
}
const ashOf = () =>
  page.evaluate(() => {
    const box = document.querySelector('canvas').getBoundingClientRect();
    const aim = document.querySelector('.stage')?.getAttribute('data-aim') ?? '';
    const m = /(?:^| )ash:([0-9.]+),([0-9.]+)/.exec(aim);
    if (!m) return null;
    return { x: box.left + box.width * Number(m[1]), y: box.top + box.height * Number(m[2]) };
  });
// Knock ash in whenever the *mirror* says the rod is carrying any, rather than on a fixed cadence:
// `flickAsh` returns false when `ash.length < maxLength * ashVisibleFraction`, so a blind timer
// spends most of its taps on nothing. The mirror's `ash` key tracks the burning end, and the column
// has to grow before it can be flicked, so this waits on the same thing the gesture does.
let flicks = 0;
for (let round = 0; round < 26; round += 1) {
  await pressPill();
  await page.waitForTimeout(520);
  const ash = await ashOf();
  if (ash === null) continue;
  // Ask the scene whether a column is standing before spending the tap: `cigarette.ash.length`
  // reaches the mesh as the `ash-column` instance data, and the scene names that mesh.
  const standing = await page.evaluate(() => {
    const ctx = window.__pufflyScene.context;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let column = null;
    scene.traverse((node) => {
      if (node.name === 'ash-column') column = node;
    });
    return column ? column.visible && column.count > 0 : null;
  });
  if (standing === false) continue;
  await page.mouse.click(ash.x, ash.y);
  flicks += 1;
  await page.waitForTimeout(420);
}
console.log('flicks attempted at a standing column:', flicks);

// The tray's gram figure on the HUD is formatted from `state.ashtray.grams` — the same field
// `placePile` gates on — so the DOM is the honest way to ask whether the pile's window is open.
const gramsText = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('*')];
  const hit = nodes.find((el) => /^\d+(?:\.\d+)?\s*g$/.test((el.textContent ?? '').trim()));
  return hit ? hit.textContent.trim() : null;
});
console.log('HUD tray figure:', gramsText);

const report = await page.evaluate(() => {
  const ctx = window.__pufflyScene.context;
  const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
  const wanted = new Set(['tray', 'tray-rim', 'tray-halo', 'ash-pile']);
  const found = {};
  scene.traverse((node) => {
    if (!wanted.has(node.name)) return;
    const wp = new (node.position.constructor)();
    node.getWorldPosition(wp);
    found[node.name] = {
      visible: node.visible,
      world: [+wp.x.toFixed(4), +wp.y.toFixed(4), +wp.z.toFixed(4)],
      scale: [+node.scale.x.toFixed(4), +node.scale.y.toFixed(4)],
      rotationZ: +node.rotation.z.toFixed(4),
      parent: node.parent?.name || '(unnamed)',
      parentPos: [
        +node.parent.position.x.toFixed(4),
        +node.parent.position.y.toFixed(4),
        +node.parent.position.z.toFixed(4),
      ],
      materialColor: node.material?.color ? '#' + node.material.color.getHexString() : null,
      mapSize: node.material?.map?.image
        ? [node.material.map.image.width, node.material.map.image.height]
        : null,
    };
  });
  const aim = document.querySelector('.stage')?.getAttribute('data-aim') ?? '';
  return { aim, found };
});

console.log('\nstage data-aim:', report.aim);
for (const [name, info] of Object.entries(report.found)) {
  console.log(`\n${name}`);
  console.log(`  parent=${info.parent} parentPos=${JSON.stringify(info.parentPos)}`);
  console.log(`  world=${JSON.stringify(info.world)} scale=${JSON.stringify(info.scale)} rotZ=${info.rotationZ}`);
  console.log(`  visible=${info.visible} colour=${info.materialColor} map=${JSON.stringify(info.mapSize)}`);
}
// The claim: the pile's centre must sit at or below the tray's, and inside its radius.
const tray = report.found['tray'];
const pile = report.found['ash-pile'];
if (tray && pile) {
  const dx = pile.world[0] - tray.world[0];
  const dy = pile.world[1] - tray.world[1];
  console.log(`\npile relative to the tray centre: dx=${dx.toFixed(4)} dy=${dy.toFixed(4)}`);
  console.log(`  dy < 0 means the pile sits BELOW the tray centre (the near lip): ${dy < 0}`);
  console.log(`  pile half-height=${(pile.scale[1] / 2).toFixed(4)}; pile bottom edge dy=${(dy - pile.scale[1] / 2).toFixed(4)}`);
}

await context.close();
await browser.close();

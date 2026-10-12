/**
 * Read the live 3D scene graph: list every mesh with its world position, scale and colour. This is
 * how a claim about "what is drawn" gets checked without guessing from the source.
 *
 *   node tests/smoke/probe-scene-graph.mjs http://127.0.0.1:4179/puffly/
 */
const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch(
  CHROME !== undefined ? { executablePath: CHROME } : { channel: 'chromium' },
);
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForSelector('.stage');
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  // TresJS attaches its renderer/scene somewhere on the canvas element. Find any object that looks
  // like a THREE.Scene by walking the canvas's own properties.
  const canvas = document.querySelector('canvas');
  const seen = new Set();
  let scene = null;
  const visit = (obj, depth) => {
    if (obj === null || typeof obj !== 'object' || depth > 3 || seen.has(obj)) return;
    seen.add(obj);
    if (obj.isScene) {
      scene = obj;
      return;
    }
    for (const key of Object.keys(obj)) {
      if (key === 'parent' || key === 'children') continue;
      try {
        visit(obj[key], depth + 1);
      } catch {
        /* getters can throw */
      }
    }
  };
  visit(canvas, 0);
  if (scene === null) {
    // Fall back: TresJS may store the app on the canvas under a symbol-ish key.
    return { found: false, keys: Object.keys(canvas ?? {}).slice(0, 40) };
  }

  const rows = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const wp = { x: 0, y: 0, z: 0 };
    o.getWorldPosition({ ...wp, set(x, y, z) { wp.x = x; wp.y = y; wp.z = z; }, x: 0, y: 0, z: 0 });
    rows.push({
      name: o.name || '(unnamed)',
      type: o.isInstancedMesh ? `InstancedMesh(${o.count})` : 'Mesh',
      geo: o.geometry?.type ?? '?',
      visible: o.visible,
      colour: m?.color ? `#${m.color.getHexString()}` : '-',
      opacity: m?.opacity,
      pos: [wp.x.toFixed(3), wp.y.toFixed(3), wp.z.toFixed(3)],
      scale: [o.scale.x.toFixed(3), o.scale.y.toFixed(3), o.scale.z.toFixed(3)],
    });
  });
  return { found: true, rows };
});

if (!out.found) {
  console.log('scene not reachable from the canvas. canvas keys:', out.keys);
} else {
  console.log(`meshes in the scene: ${out.rows.length}\n`);
  const named = out.rows.filter((r) => r.name !== '(unnamed)');
  const unnamed = out.rows.filter((r) => r.name === '(unnamed)');
  for (const r of named) {
    console.log(
      `${r.name.padEnd(16)} ${r.type.padEnd(18)} ${r.geo.padEnd(18)} vis=${String(r.visible).padEnd(5)} ${String(r.colour).padEnd(8)} op=${r.opacity ?? '-'}  pos=${r.pos.join(',')}  scale=${r.scale.join(',')}`,
    );
  }
  console.log(`\n+ ${unnamed.length} unnamed meshes (the room's backdrop quads and details):`);
  for (const r of unnamed.slice(0, 30)) {
    console.log(
      `  ${r.type.padEnd(18)} ${r.geo.padEnd(18)} ${String(r.colour).padEnd(8)} op=${r.opacity ?? '-'}  pos=${r.pos.join(',')}  scale=${r.scale.join(',')}`,
    );
  }
}
await browser.close();

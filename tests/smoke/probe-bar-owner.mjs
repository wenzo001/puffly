// Which scene object owns the two bright bands on the wall (~x 232..250, y 258..470 in CSS px).
import { chromium } from 'playwright';

const URL = process.env.PUFFLY_URL || 'http://127.0.0.1:4173/puffly/';
const browser = await chromium.launch();
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
await page.waitForTimeout(3000);

const out = await page.evaluate(() => {
  const probe = window.__pufflyScene;
  const ctx = probe?.context;
  if (!ctx) return { error: 'no context' };
  const scene = ctx.scene?.isObject3D ? ctx.scene : (ctx.scene?.value ?? ctx.scene);
  const cam = ctx.camera?.activeCamera?.value ?? ctx.camera;
  if (!scene || !cam) return { error: 'no scene/camera' };

  const mul = (a, b) => {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  };
  const wp = (m, x, y, z) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  scene.updateMatrixWorld(true);
  cam.updateMatrixWorld(true);
  if (cam.matrixWorldInverse) cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const viewProj = mul(cam.projectionMatrix.elements, cam.matrixWorldInverse.elements);
  const toPx = (p) => {
    const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
    const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
    const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
    return [
      +((x / w + 1) / 2 * cssW).toFixed(1),
      +((1 - y / w) / 2 * cssH).toFixed(1),
    ];
  };

  const rows = [];
  const walk = (node, depth) => {
    if (node.visible === false) return;
    if (node.isMesh || node.isInstancedMesh) {
      const pos = node.geometry?.attributes?.position;
      let sx = 0;
      let sy = 0;
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          sx = Math.max(sx, Math.abs(pos.getX(i)));
          sy = Math.max(sy, Math.abs(pos.getY(i)));
        }
      }
      node.updateWorldMatrix(true, false);
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const n = node.isInstancedMesh ? node.count : 1;
      for (let inst = 0; inst < n; inst++) {
        let base = node.matrixWorld.elements.slice();
        if (node.isInstancedMesh && node.instanceMatrix) {
          base = mul(base, Array.from(node.instanceMatrix.array.slice(inst * 16, inst * 16 + 16)));
        }
        const c1 = toPx(wp(base, -sx, -sy, 0));
        const c2 = toPx(wp(base, sx, sy, 0));
        const m0 = mats[0];
        rows.push({
          depth,
          type: node.type,
          name: node.name || '',
          inst,
          x0: Math.min(c1[0], c2[0]),
          y0: Math.min(c1[1], c2[1]),
          x1: Math.max(c1[0], c2[0]),
          y1: Math.max(c1[1], c2[1]),
          colour: m0?.color
            ? `rgb(${Math.round(m0.color.r * 255)},${Math.round(m0.color.g * 255)},${Math.round(m0.color.b * 255)})`
            : null,
          opacity: m0?.opacity ?? null,
        });
      }
    }
    for (const child of node.children || []) walk(child, depth + 1);
  };
  walk(scene, 0);

  const hits = (bx0, by0, bx1, by1) =>
    rows
      .filter(
        (r) =>
          r.x1 > bx0 && r.x0 < bx1 && r.y1 > by0 && r.y0 < by1 && (r.x1 - r.x0) * (r.y1 - r.y0) > 200,
      )
      .map((r) => ({
        ...r,
        w: +(r.x1 - r.x0).toFixed(1),
        h: +(r.y1 - r.y0).toFixed(1),
      }))
      .filter((r) => r.w < 140)
      .slice(0, 24);

  return {
    total: rows.length,
    barA: hits(226, 250, 256, 380),
    barB: hits(226, 360, 256, 478),
  };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();

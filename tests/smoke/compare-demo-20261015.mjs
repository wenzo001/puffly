/**
 * The design source and the shipped build, measured at the same places.
 *   node tests/smoke/compare-demo-20261015.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const DEMO = 'file:///Users/wendongfu/WorkBuddy/2026-10-05-16-33-37/SmokeRitual-UI-Demo.html';
const APP = 'http://127.0.0.1:4173/puffly/';
const OUT = '/tmp/puffly-compare';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

/** Stats for device-px boxes, computed in-page so only the summary crosses. */
function stats(pg, boxes) {
  return (buf) =>
    pg.evaluate(
      (data) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            const out = [];
            for (const [x0, y0, x1, y1] of data.boxes) {
              const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
              let n = 0;
              const acc = [0, 0, 0];
              let maxL = 0;
              for (let i = 0; i < d.length; i += 4) {
                acc[0] += d[i];
                acc[1] += d[i + 1];
                acc[2] += d[i + 2];
                const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                if (v > maxL) maxL = v;
                n += 1;
              }
              const m = acc.map((v) => v / n);
              out.push({
                mean: m.map((v) => Math.round(v)),
                L: +(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]).toFixed(1),
                maxL: +maxL.toFixed(1),
              });
            }
            resolve(out);
          };
          img.src = `data:image/png;base64,${data.b64}`;
        }),
      { b64: buf.toString('base64'), boxes },
    );
}
const bx = (x, y, w, h) => [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)];

// ---------------------------------------------------------------- the Demo
{
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.goto(DEMO, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const geo = await page.evaluate(() => {
    const stage = document.querySelector('.screen .stage') ?? document.querySelector('.stage');
    const r = stage.getBoundingClientRect();
    const kids = [...stage.querySelectorAll('.obj')].map((k) => {
      const b = k.getBoundingClientRect();
      return {
        x: +(b.left - r.left).toFixed(1),
        y: +(b.top - r.top).toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        bg: (k.getAttribute('style') || '').slice(0, 74),
      };
    });
    return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, kids, stageBg: getComputedStyle(stage).background.slice(0, 160) };
  });
  console.log('DEMO_STAGE_BOX', JSON.stringify(geo.box));
  geo.kids.forEach((k, i) => console.log(`  obj[${i}] ${k.x},${k.y} ${k.w}x${k.h}  ${k.bg}`));
  // The demo is one long page of screens; bring the chosen stage into the viewport first.
  await page.evaluate((y) => window.scrollTo(0, y - 40), geo.box.y);
  await page.waitForTimeout(400);
  const vis = await page.evaluate(() => {
    const st = document.querySelector('.screen .stage') ?? document.querySelector('.stage');
    const r = st.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const clip = { x: Math.max(0, vis.x), y: Math.max(0, vis.y), width: vis.w, height: Math.min(vis.h, 900 - Math.max(0, vis.y)) };
  const shotBuf = await page.screenshot({ path: `${OUT}/demo-S1.png`, clip });
  console.log('DEMO_VISIBLE_STAGE', JSON.stringify(vis), 'clip', JSON.stringify(clip));
  // The pack is the 118×118 plate; its surround is the wall a band outside it.
  const pack = geo.kids.find((k) => k.w > 100 && k.h > 100);
  const tray = geo.kids.find((k) => k.w > 150 && k.h > 150);
  const lighter = geo.kids.find((k) => Math.abs(k.w - 52) < 6 && k.h > 90);
  const rod = geo.kids.find((k) => Math.abs(k.w - 168) < 8 && Math.abs(k.h - 34) < 8);
  const boxes = [];
  const labels = [];
  for (const [name, k] of [['pack', pack], ['tray', tray], ['lighter', lighter], ['rod', rod]]) {
    if (!k) continue;
    boxes.push(bx(k.x, k.y, k.w, k.h));
    labels.push(name);
    boxes.push(bx(k.x - 14, k.y - 14, k.w + 28, 12));
    labels.push(`${name}_above_band`);
  }
  const oy = vis.y;
  const shifted = boxes.map(([x0, y0, x1, y1]) => [x0 + vis.x, y0 + oy, x1 + vis.x, y1 + oy]);
  const out = await stats(page, shifted)(shotBuf);
  labels.forEach((l, i) => console.log(`DEMO ${l}`.padEnd(22), JSON.stringify(out[i])));
  if (rod) console.log(`DEMO rod ratio h/w = ${(rod.h / rod.w).toFixed(4)}  (${rod.w}x${rod.h})`);
  await page.close();
}

// ---------------------------------------------------------------- the build
{
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-aim]', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const a = await page.evaluate(() => {
    const out = {};
    document.querySelector('.stage').getAttribute('data-aim').trim().split(/\s+/).forEach((p) => {
      const [k, v] = p.split(':');
      out[k] = v.split(',').map(Number);
    });
    return out;
  });
  const D = 2;
  const px = (f, s) => [f[0] * 393 * D - (s * D) / 2, f[1] * 852 * D - (s * D) / 2, f[0] * 393 * D + (s * D) / 2, f[1] * 852 * D + (s * D) / 2];
  const shot = await page.screenshot({ path: `${OUT}/app-idle.png` });
  const labels = ['lighter', 'lighter_ring', 'pack', 'pack_ring', 'ashtray', 'ashtray_ring', 'wall_mid'];
  const boxes = [
    bx(...px(a.lighter, 30)),
    bx(a.lighter[0] * 393 * D - 46, a.lighter[1] * 852 * D - 46, 92, 12),
    bx(...px(a.pack, 46)),
    bx(a.pack[0] * 393 * D - 60, a.pack[1] * 852 * D - 60, 120, 12),
    bx(...px(a.ashtray, 70)),
    bx(a.ashtray[0] * 393 * D - 90, a.ashtray[1] * 852 * D - 90, 180, 12),
    bx(...px([0.5, 0.25], 40)),
  ];
  const out = await stats(page, boxes)(shot);
  labels.forEach((l, i) => console.log(`APP ${l}`.padEnd(22), JSON.stringify(out[i])));
  await page.close();
}

await browser.close();
console.log('done');

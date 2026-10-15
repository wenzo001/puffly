/**
 * Does the panel still bleed above its own scroll口, and does the bottom of a long list flicker?
 * Both readings are pixels, not DOM rects: in the 3D tier the DOM clips correctly and it is the
 * scene's mirror that draws what the eye sees.
 *   node tests/smoke/verify-sheet-20261015.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'http://127.0.0.1:4173/puffly/';
const OUT = '/tmp/puffly-sheet';
mkdirSync(OUT, { recursive: true });
const W = 393;
const H = 852;
const D = 2;

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: D, isMobile: true, hasTouch: true })
).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 140)));

function stats(boxes) {
  return (buf) =>
    page.evaluate(
      (data) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            resolve(
              data.boxes.map(([x0, y0, x1, y1]) => {
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
                return {
                  mean: m.map((v) => Math.round(v)),
                  L: +(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]).toFixed(1),
                  maxL: +maxL.toFixed(1),
                };
              }),
            );
          };
          img.src = `data:image/png;base64,${data.b64}`;
        }),
      { b64: buf.toString('base64'), boxes },
    );
}
const bx = (x, y, w, h) => [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)];

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.stage[data-aim]', { timeout: 30000 });
await page.waitForTimeout(2500);

async function open(text) {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      (x.getAttribute('aria-label') || x.textContent || '').trim().toLowerCase().includes(t),
    );
    if (!b) return false;
    b.click();
    return true;
  }, text);
  await page.waitForTimeout(1400);
  const g = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.sheet')].find((x) => x.getAttribute('data-open') === 'true');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, scrollHeight: s.scrollHeight, clientHeight: s.clientHeight };
  });
  return { ok, g };
}

const settings = await open('settings');
console.log('SETTINGS', JSON.stringify(settings));
if (settings.g) {
  const top = settings.g.top;
  for (const off of [120, 380, 520]) {
    await page.evaluate((o) => {
      const s = [...document.querySelectorAll('.sheet')].find((x) => x.getAttribute('data-open') === 'true');
      s.scrollTop = o;
    }, off);
    await page.waitForTimeout(450);
    const shot = await page.screenshot();
    writeFileSync(`${OUT}/settings-${off}.png`, shot);
    // A band just above the panel's top edge, against a reference band high on the wall.
    const r = await stats([
      bx(0, (top - 26) * D, W * D, 24 * D),
      bx(0, 60 * D, W * D, 24 * D),
      bx(0, top * D + 2, W * D, 24 * D),
    ])(shot);
    const delta = Math.abs(r[0].L - r[1].L);
    console.log(
      `  scroll@${off} above_edge_L=${r[0].L} ${r[0].mean.join(',')} | wall_ref_L=${r[1].L} | inside_L=${r[2].L} | bleed_delta=${delta.toFixed(1)} ${delta > 6 ? '<-- LEAK' : ''}`,
    );
  }
}

const shelf = await open('ashtray');
console.log('SHELF', JSON.stringify(shelf));
if (shelf.g) {
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.sheet')].find((x) => x.getAttribute('data-open') === 'true');
    s.scrollTop = s.scrollHeight;
  });
  await page.waitForTimeout(600);
  const sig = [];
  for (let i = 0; i < 10; i += 1) {
    const shot = await page.screenshot();
    if (i === 0) writeFileSync(`${OUT}/shelf-bottom.png`, shot);
    const r = await stats([bx(0, 0, W * D, H * D)])(shot);
    sig.push(r[0].L);
    await page.waitForTimeout(100);
  }
  const spread = Math.max(...sig) - Math.min(...sig);
  console.log('SHELF_BOTTOM whole-frame L per 100ms:', sig.join(' '), `spread=${spread.toFixed(2)}`, spread > 1.5 ? '<-- FLICKER' : '');
}

// A held draw, for the white-out report.
await page.evaluate(() => {
  document
    .querySelectorAll('.sheet')
    .forEach((s) => s.setAttribute('data-open', 'false'));
});
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.press('Space');
await page.waitForTimeout(1400);
const pre = await page.screenshot();
writeFileSync(`${OUT}/pre-hold.png`, pre);
console.log('PRE_HOLD', JSON.stringify((await stats([bx(0, 0, W * D, H * D)])(pre))[0]));
await page.keyboard.down('Space');
for (let i = 0; i < 6; i += 1) {
  const shot = await page.screenshot();
  writeFileSync(`${OUT}/hold-${i}.png`, shot);
  const r = await stats([
    bx(0, 0, W * D, H * D),
    bx(0.3 * W * D, 0.15 * H * D, 0.4 * W * D, 0.35 * H * D),
  ])(shot);
  console.log(`HOLD ${i} whole_L=${r[0].L} ${r[0].mean.join(',')} | plume_L=${r[1].L} ${r[1].mean.join(',')}`);
  await page.waitForTimeout(160);
}
await page.keyboard.up('Space');
await browser.close();
console.log('done');

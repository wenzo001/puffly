// Why does `the clock's ink lands at the DOM font's own size` now read 22 inked rows where it used
// to read 12? The box it scans is a hard-coded pixel rect, so this probe separates the two things
// that could have moved: the clock's own ink, and something else bright sliding into that rect.
// Both readings come from ONE page — the smaller `.cat` is applied by injected style, not by a
// rebuild, so the scene, the seed channel and the bloom are the same pixels either way except for
// the chrome's own geometry.
//
//   node tests/smoke/probe-cat-ink.mjs http://127.0.0.1:4173/puffly/

import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4173/puffly/';
const BOX = [100, 16, 55, 24];

const browser = await chromium.launch({
  args: (process.env.PUFFLY_CHROME_ARGS ?? '').split(' ').filter(Boolean),
});
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
const page = await context.newPage();
await page.goto(`${URL_ARG}?scene=3d`, { waitUntil: 'load' });
await page
  .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 30, null, { timeout: 20000 })
  .catch(() => {});
await page.waitForTimeout(600);

async function reading(label) {
  const shot = await page.screenshot();
  const out = await page.evaluate(
    async ({ b64, box }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(box[0], box[1], box[2], box[3]).data;
      const inked = new Set();
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const level = Math.max(d[i], d[i + 1], d[i + 2]);
        max = Math.max(max, level);
        if (level > 120) inked.add(Math.floor(i / 4 / box[2]));
      }
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const ringEl = document.querySelector('.hud .ring');
      const rr = ringEl === null ? null : ringEl.getBoundingClientRect();
      const ringCentre = rr === null ? undefined : [rr.x + rr.width / 2, rr.y + rr.height / 2];
      const at = document.elementFromPoint(box[0] + box[2] / 2, box[1] + box[3] / 2);
      const owner = (x, y) => {
        const el = document.elementFromPoint(Math.round(x), Math.round(y));
        return el === null ? 'none' : `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40);
      };
      const catEl = document.querySelector('.hud .cat');
      const cr = catEl === null ? null : catEl.getBoundingClientRect();
      const cx = cr === null ? -1 : cr.x + cr.width / 2;
      const cy = cr === null ? -1 : cr.y + cr.height / 2;
      const who = {
        // 20 px off centre along each axis: outside the 34 px circle, inside a 44 px square.
        above: owner(cx, cy - 20),
        left: owner(cx - 20, cy),
        right: owner(cx + 20, cy),
        below: owner(cx, cy + 20),
        // And the ring must still own its own centre.
        ring: owner(ringCentre === undefined ? -1 : ringCentre[0], ringCentre === undefined ? -1 : ringCentre[1]),
      };
      return {
        rows: inked.size,
        max,
        clock: rect('.hud .num'),
        cat: rect('.hud .cat'),
        ring: rect('.hud .ring'),
        head: rect('.hud'),
        shotSize: { w: img.width, h: img.height },
        // Which element actually owns the centre of the hard-coded box — the box is only about the
        // clock for as long as nothing else is painted there.
        boxOwner: at === null ? 'none' : `${at.tagName.toLowerCase()}.${at.className}`.slice(0, 60),
        who,
      };
    },
    { b64: shot.toString('base64'), box: BOX },
  );
  console.log(label, JSON.stringify(out));
}

await reading('as shipped (34 face + 44 reach) ');

await page.addStyleTag({ content: '.hud .cat { width: 34px !important; height: 34px !important; }' });
await page.waitForTimeout(400);
await reading('face forced back to 34      ');

await browser.close();

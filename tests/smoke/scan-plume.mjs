/**
 * Measure the plume on a captured frame: is it a continuous column or a beaded rope?
 *
 * For the region where smoke is, walk down a column and record, per row, how much lit smoke there
 * is. A continuous plume gives a smooth profile; a beaded one gives alternating bright/dark bands
 * with high variance and repeated local minima.
 *
 *   node tests/smoke/scan-plume.mjs /tmp/puffly-audit/phone-portrait-break.png
 */
import { readFile } from 'node:fs/promises';

const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];
const files = process.argv.slice(2);

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch(
  CHROME !== undefined ? { executablePath: CHROME } : { channel: 'chromium' },
);
const page = await browser.newPage();

for (const file of files) {
  const b64 = (await readFile(file)).toString('base64');
  const out = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { width: W, height: H } = c;
    const px = ctx.getImageData(0, 0, W, H).data;

    // "Smoke" is a pixel that is greyish (r~g~b) and clearly brighter than the dark room.
    const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const greyish = (i) => {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      return mx - mn < 42; // not the orange cherry / warm pool
    };

    // Per-row count of smoke pixels, and their centroid, over the upper 70% of the frame.
    const rows = [];
    const limit = Math.floor(H * 0.72);
    for (let y = 0; y < limit; y += 1) {
      let n = 0;
      let sumX = 0;
      let minX = W;
      let maxX = -1;
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;
        if (greyish(i) && lum(i) > 46) {
          n += 1;
          sumX += x;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      rows.push({ y, n, centroid: n ? sumX / n : 0, width: maxX >= 0 ? maxX - minX + 1 : 0 });
    }

    // Bands: contiguous runs of rows that have any smoke.
    const bands = [];
    let cur = null;
    for (const r of rows) {
      if (r.n > 2) {
        if (cur === null) cur = { from: r.y, to: r.y, peak: 0, minIn: Infinity };
        cur.to = r.y;
        cur.peak = Math.max(cur.peak, r.n);
        cur.minIn = Math.min(cur.minIn, r.n);
      } else if (cur !== null) {
        bands.push(cur);
        cur = null;
      }
    }
    if (cur !== null) bands.push(cur);

    // Local minima inside the longest band = the beads' necks.
    const longest = bands.slice().sort((a, b) => b.to - b.from - (a.to - a.from))[0];
    let necks = 0;
    let widest = 0;
    let narrowest = Infinity;
    if (longest) {
      for (let y = longest.from + 2; y < longest.to - 2; y += 1) {
        const a = rows[y - 2].n;
        const b0 = rows[y].n;
        const c2 = rows[y + 2].n;
        if (b0 < a && b0 < c2 && b0 < longest.peak * 0.72) necks += 1;
      }
      for (let y = longest.from; y <= longest.to; y += 1) {
        widest = Math.max(widest, rows[y].width);
        if (rows[y].width > 0) narrowest = Math.min(narrowest, rows[y].width);
      }
    }

    return {
      W,
      H,
      bands: bands.map((b) => ({ from: b.from, to: b.to, h: b.to - b.from + 1, peak: b.peak })),
      longest: longest ? { from: longest.from, to: longest.to, peak: longest.peak } : null,
      necks,
      widest,
      narrowest: Number.isFinite(narrowest) ? narrowest : 0,
      // Where the widest row is, relative to the band: 0 = top, 1 = bottom.
      widestAt: longest
        ? (rows.slice(longest.from, longest.to + 1).reduce((best, r) => (r.width > best.width ? r : best), { width: -1, y: longest.from }).y - longest.from) /
          Math.max(1, longest.to - longest.from)
        : null,
    };
  }, b64);

  console.log(`\n${file}  ${out.W}x${out.H}`);
  console.log(`  bands (contiguous smoke runs): ${out.bands.length}`);
  for (const b of out.bands.slice(0, 8)) {
    console.log(`    y ${b.from}..${b.to}  h=${b.h}  peak=${b.peak}`);
  }
  console.log(`  longest run: ${out.longest ? `${out.longest.from}..${out.longest.to} peak ${out.longest.peak}` : 'none'}`);
  console.log(`  necks (local minima inside the run): ${out.necks}`);
  console.log(`  width: narrowest ${out.narrowest}  widest ${out.widest}  widestAt=${out.widestAt?.toFixed(2)} (0=top of run, 1=bottom)`);
}
await browser.close();

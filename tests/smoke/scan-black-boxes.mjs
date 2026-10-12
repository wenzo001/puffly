/**
 * The acceptance measurement for the room's props: is the pack/lighter distinguishable from the wall
 * it stands on, or does it read as a hole punched out of the wall?
 *
 * The first version of this tool searched for *dark* compact regions with a fixed `<26` RGB
 * threshold. That was the wrong question, and it produced a false negative after the lighting fix:
 * the props now sit at `rgb(16,15,13)` and `rgb(6,6,5)` — still compact, still dark, still found by
 * that scan — but they now carry **2.7x** and **7.9x** contrast against their own wall, which is
 * exactly the acceptance criterion. What a player reads as "a broken mesh" is a contrast near 1x (a
 * pure-black plate on a mid-grey wall), not a particular darkness. So the question is contrast.
 *
 *   node tests/smoke/scan-black-boxes.mjs /tmp/puffly-r5/phone-portrait-break.png
 *
 * A browser is used as the PNG decoder (the repo already depends on Playwright) so no image library
 * is added.
 */
import { readFile } from 'node:fs/promises';

const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME =
  process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const files = process.argv.slice(2);

/**
 * The prop regions, in PNG px on a 786x1704 (2x DPR) phone frame. They were located by
 * `tests/smoke/probe-anchors.mjs`, which reads `.stage[data-aim]` live and lands on the same boxes:
 * these two are the prop anchors, not the room's clutter (which lives at CSS x 187-264).
 */
const REGIONS = [
  { label: 'pack', x: 92, y: 1028, w: 60, h: 92, minContrast: 1.6 },
  { label: 'lighter', x: 49, y: 829, w: 52, h: 61, minContrast: 1.6 },
];

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();

let failed = 0;
for (const file of files) {
  const b64 = (await readFile(file)).toString('base64');
  const out = await page.evaluate(
    async ([data, regions]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const at = (x, y) => {
        const i = (y * c.width + x) * 4;
        return [px[i], px[i + 1], px[i + 2]];
      };
      const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
      const mean = (arr) =>
        [0, 1, 2].map((k) => Math.round(arr.reduce((s, p) => s + p[k], 0) / arr.length));
      return regions.map((r) => {
        const cx = r.x + Math.round(r.w / 2);
        const cy = r.y + Math.round(r.h / 2);
        // Interior: a small grid near the middle, away from the edges the packEdge plane tints.
        const inner = [];
        for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) inner.push(at(cx + dx, cy + dy));
        // Surrounding wall: just outside each of the four edges.
        const around = [
          at(Math.max(1, r.x - 12), cy),
          at(Math.min(c.width - 2, r.x + r.w + 12), cy),
          at(cx, Math.max(1, r.y - 12)),
          at(cx, Math.min(c.height - 2, r.y + r.h + 12)),
        ];
        const innerMean = mean(inner);
        const aroundMean = mean(around);
        // WCAG's shape: the lighter over the darker, +0.05 each. 1.0 means indistinguishable.
        const ratio =
          (Math.max(lum(innerMean), lum(aroundMean)) + 0.05) / (Math.min(lum(innerMean), lum(aroundMean)) + 0.05);
        return {
          label: r.label,
          minContrast: r.minContrast,
          inside: `rgb(${innerMean.join(',')})`,
          insideLum: Math.round(lum(innerMean)),
          around: `rgb(${aroundMean.join(',')})`,
          aroundLum: Math.round(lum(aroundMean)),
          ratio: +ratio.toFixed(2),
        };
      });
    },
    [b64, REGIONS],
  );

  console.log(`\n${file}`);
  for (const r of out) {
    const ok = r.ratio >= r.minContrast;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${r.label.padEnd(8)} inside ${r.inside} (L ${r.insideLum})  around ${r.around} (L ${r.aroundLum})  contrast ${r.ratio}x (>= ${r.minContrast})`,
    );
  }
}
await browser.close();
if (failed > 0) {
  console.log(`\n${failed} prop region(s) below the visibility floor — the plates are still reading as holes`);
  process.exit(1);
}
console.log('\nboth props are distinguishable from the wall they stand on');

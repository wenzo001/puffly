/**
 * What is actually in the pixels where the black plates were? Report the interior colour and the
 * surrounding wall, so a claim about a prop's visibility can be checked against numbers rather than
 * an impression of a screenshot.
 *
 *   node tests/smoke/probe-plate-colour.mjs /tmp/puffly-r5/phone-portrait-break.png
 */
import { readFile } from 'node:fs/promises';

const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const files = process.argv.slice(2);

const playwright = await import(PLAYWRIGHT_SPEC);
const browser = await playwright.chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();

// The plates, measured before the lighting change (PNG px on 786x1704), and their prop anchors.
const REGIONS = [
  { label: 'pack (prop)', x: 92, y: 1028, w: 60, h: 92 },
  { label: 'lighter (prop)', x: 49, y: 829, w: 52, h: 61 },
];

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
      const lum = ([r, g, b]) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      return regions.map((r) => {
        // Interior: the middle of the box, sampled on a small grid.
        const inner = [];
        for (let dy = -6; dy <= 6; dy += 3) {
          for (let dx = -6; dx <= 6; dx += 3) {
            inner.push(at(r.x + Math.round(r.w / 2) + dx, r.y + Math.round(r.h / 2) + dy));
          }
        }
        // Surrounding wall, just outside each edge.
        const around = [
          at(Math.max(1, r.x - 12), r.y + Math.round(r.h / 2)),
          at(Math.min(c.width - 2, r.x + r.w + 12), r.y + Math.round(r.h / 2)),
          at(r.x + Math.round(r.w / 2), Math.max(1, r.y - 12)),
          at(r.x + Math.round(r.w / 2), Math.min(c.height - 2, r.y + r.h + 12)),
        ];
        const mean = (arr) => {
          const m = [0, 1, 2].map((k) => Math.round(arr.reduce((s, p) => s + p[k], 0) / arr.length));
          return m;
        };
        const innerMean = mean(inner);
        const aroundMean = mean(around);
        return {
          label: r.label,
          inside: `rgb(${innerMean.join(',')})`,
          insideLum: lum(innerMean),
          around: `rgb(${aroundMean.join(',')})`,
          aroundLum: lum(aroundMean),
          ratio: +((Math.max(lum(innerMean), lum(aroundMean)) + 0.05) / (Math.min(lum(innerMean), lum(aroundMean)) + 0.05)).toFixed(2),
        };
      });
    },
    [b64, REGIONS],
  );
  console.log(`\n${file}`);
  for (const r of out) {
    console.log(`  ${r.label.padEnd(16)} inside ${r.inside} (L ${r.insideLum})  around ${r.around} (L ${r.aroundLum})  contrast ${r.ratio}x`);
  }
}
await browser.close();

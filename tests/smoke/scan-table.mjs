/**
 * Measure how empty the table is: for the band below the seam, report the luminance distribution and
 * how much of it carries any detail at all. This turns "it looks empty" into a number.
 *
 *   node tests/smoke/scan-table.mjs /tmp/puffly-audit/phone-portrait-break.png
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
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { width: W, height: H } = c;
    const px = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => {
      const i = (y * W + x) * 4;
      return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    };

    // The seam: the row with the largest vertical luminance jump, scanned in the lower half.
    let seamY = -1;
    let best = 0;
    for (let y = Math.floor(H * 0.5); y < Math.floor(H * 0.85); y += 1) {
      let a = 0;
      let b = 0;
      for (let x = 0; x < W; x += 4) {
        a += lum(x, y - 3);
        b += lum(x, y + 3);
      }
      const jump = Math.abs(b - a);
      if (jump > best) {
        best = jump;
        seamY = y;
      }
    }

    // Below the seam: how much of it is flat?
    const from = seamY + 8;
    const to = H;
    let n = 0;
    let sum = 0;
    let min = 255;
    let max = 0;
    const hist = new Array(16).fill(0);
    for (let y = from; y < to; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const l = lum(x, y);
        n += 1;
        sum += l;
        if (l < min) min = l;
        if (l > max) max = l;
        hist[Math.min(15, Math.floor(l / 16))] += 1;
      }
    }
    // "Featureless" = the fraction of the band within +/-3 of its own median-ish mean.
    const mean = sum / n;
    let near = 0;
    let near10 = 0;
    for (let y = from; y < to; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const l = lum(x, y);
        if (Math.abs(l - mean) <= 3) near += 1;
        if (Math.abs(l - mean) <= 10) near10 += 1;
      }
    }
    return {
      W, H,
      seamY,
      seamFraction: +(seamY / H).toFixed(3),
      jump: +best.toFixed(1),
      band: { from, to, heightPx: to - from, fractionOfStage: +((to - from) / H).toFixed(3) },
      luminance: { mean: +mean.toFixed(1), min, max },
      flatWithin3: +(near / n).toFixed(3),
      flatWithin10: +(near10 / n).toFixed(3),
      hist,
    };
  }, b64);

  console.log(`\n${file}  ${out.W}x${out.H}`);
  console.log(`  seam at y=${out.seamY} (${(out.seamFraction * 100).toFixed(1)}% of the frame), jump ${out.jump}`);
  console.log(`  band below: y ${out.band.from}..${out.band.to} = ${out.band.heightPx}px = ${(out.band.fractionOfStage * 100).toFixed(1)}% of the stage`);
  console.log(`  luminance in band: mean ${out.luminance.mean}  min ${out.luminance.min}  max ${out.luminance.max}`);
  console.log(`  flat: ${(out.flatWithin3 * 100).toFixed(1)}% of pixels within +/-3 of the mean; ${(out.flatWithin10 * 100).toFixed(1)}% within +/-10`);
  console.log(`  histogram (luminance/16 -> share):`, out.hist.map((v, i) => `${i * 16}:${((v / out.hist.reduce((a, b) => a + b, 0)) * 100).toFixed(0)}%`).join(' '));
}
await browser.close();

/**
 * Reads the tray's rim as drawn: where its arc is, how bright it is against the tray's own disc, and
 * whether the near half — the side the audit called "missing" — is genuinely absent or merely dim.
 *
 * The rim's geometry records its provenance ("the 2D layer drew the rim as an arc from 1.05pi to
 * 1.95pi"), so the far-half arc is a deliberate reproduction. What was never checked is whether the
 * near half has *any* signal: if the disc's own edge reads there, the audit's complaint is answered
 * by the bowl itself; if not, the finding is a real one for the user to decide on.
 *
 *   PUFFLY_CHROME=... node tests/smoke/scan-tray-rim.mjs http://127.0.0.1:4179/puffly/
 */
const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const CHROME = process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

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

const anchor = await page.evaluate(() => {
  const aim = document.querySelector('.stage')?.getAttribute('data-aim') ?? '';
  const m = /(?:^| )ashtray:([0-9.]+),([0-9.]+)/.exec(aim);
  const boxAttr = document.querySelector('.stage')?.getAttribute('data-stage-box') ?? '';
  const bb = boxAttr.split(',').map(Number);
  const canvas = document.querySelector('canvas').getBoundingClientRect();
  if (!m) return null;
  return {
    x: canvas.left + canvas.width * Number(m[1]),
    y: canvas.top + canvas.height * Number(m[2]),
    cssW: canvas.width,
    cssH: canvas.height,
    // The stage box as canvas fractions, so the rim's world radius can be converted the way
    // `canvasToWorld` converts a position.
    boxW: bb[2] || 1,
    boxH: bb[3] || 1,
  };
});
if (anchor === null) throw new Error('no ashtray anchor in the mirror');

const shot = (await page.screenshot()).toString('base64');
const read = await page.evaluate(
  async (a) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + a.shot;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const sc = img.width / a.cssW;
    // The rim's own world scale (0.2337 on this build, read from the mesh) is the honest radius;
    // convert it to device px through the stage width, which is what canvasToWorld's x span does.
    const stageW = 4 * (a.boxW / a.boxH) * (a.cssW / a.cssH);
    const R = Math.round(0.2337 / stageW * a.cssW * sc);
    const cx = Math.round(a.x * sc);
    const cy = Math.round(a.y * sc);
    const lum = (x, y) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
    };
    const ring = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      let peak = 0;
      for (const rr of [R * 0.9, R * 0.95, R, R * 1.05, R * 1.1]) {
        const x = Math.round(cx + Math.cos(rad) * rr);
        const y = Math.round(cy + Math.sin(rad) * rr * 0.42);
        peak = Math.max(peak, lum(x, y));
      }
      ring.push({ deg, peak });
    }
    const bowl = [];
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      bowl.push(lum(Math.round(cx + Math.cos(rad) * R * 0.55), Math.round(cy + Math.sin(rad) * R * 0.55 * 0.42)));
    }
    const mean = (v) => v.reduce((s, n) => s + n, 0) / Math.max(1, v.length);
    const upper = ring.filter((s) => s.deg >= 90 && s.deg <= 270).map((s) => s.peak);
    const lower = ring.filter((s) => s.deg < 90 || s.deg > 270).map((s) => s.peak);
    return {
      R,
      cx,
      cy,
      upper: +mean(upper).toFixed(1),
      lower: +mean(lower).toFixed(1),
      bowlMean: +mean(bowl).toFixed(1),
      upperMax: +Math.max(...upper).toFixed(1),
      lowerMax: +Math.max(...lower).toFixed(1),
    };
  },
  { shot, ...anchor },
);

console.log(`\ntray rim scan (anchor ${read.cx},${read.cy}, R~${read.R} device px):`);
console.log(`  far half (upper, the arc's own span): mean ${read.upper}  peak ${read.upperMax}`);
console.log(`  near half (lower, the audit's "missing"): mean ${read.lower}  peak ${read.lowerMax}`);
console.log(`  bowl interior mean: ${read.bowlMean}`);
console.log(
  `  near/far mean ratio: ${(read.lower / Math.max(1, read.upper)).toFixed(2)}` +
    ' (near ~ far means the bowl edge itself reads; near << far means the finding is real)',
);
await context.close();
await browser.close();

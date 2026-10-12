/**
 * Decisive probe for the two hard black plates: read the live prop anchors (`.stage[data-aim]`) and
 * the prop box sizes, convert to CSS pixels, and compare against the plate boxes measured off the
 * shipped frame. If they coincide, the plates are the props and the room's light cannot show them.
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
await page.waitForTimeout(2200);

const out = await page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const data = {};
  for (const [k, v] of Object.entries(stage?.dataset ?? {})) data[k] = v;
  const r = stage.getBoundingClientRect();
  return { aim: data.aim, phase: data.phase, stageBox: { x: r.x, y: r.y, w: r.width, h: r.height } };
});
console.log('stage box:', out.stageBox, 'phase:', out.phase);
console.log('data-aim:', out.aim);

// data-aim is `body:0.62,0.41 lighter:0.12,0.85 …` in stage fractions.
const aim = {};
for (const part of (out.aim ?? '').split(' ')) {
  const [k, v] = part.split(':');
  if (k && v) {
    const [x, y] = v.split(',').map(Number);
    aim[k] = { x, y };
  }
}
console.log('\nanchors in CSS px (x*W, y*H):');
for (const [k, v] of Object.entries(aim)) {
  console.log(`  ${k.padEnd(9)} ${(v.x * out.stageBox.w).toFixed(1)}, ${(v.y * out.stageBox.h).toFixed(1)}`);
}
console.log('\nmeasured plates (CSS px): a=(24.5,414.5,26,30.5)  b=(45.5,513.5,30.5,46.5)');
console.log('plate centres:            a=(37.5,429.8)          b=(60.8,536.8)');
await browser.close();

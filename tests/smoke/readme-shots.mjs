/**
 * The four pictures at the top of the README, captured from the artefact rather than described.
 *
 * They went stale once already: the set that shipped was taken before the deck's chrome existed, so
 * the file said "the column takes shape" over a picture with no column, and "a word per row" over a
 * sheet that had no words. A screenshot cannot be asserted about, so the answer is not a stricter
 * test — it is a script that regenerates the pictures from the current build in one command:
 *
 *   PUBLIC_BASE=/puffly/ npm run build
 *   npm run preview                       # http://localhost:4173/puffly/
 *   node tests/smoke/readme-shots.mjs http://localhost:4173/puffly/
 *
 * It asserts nothing on purpose. What the frames should look like is a human judgement, and the
 * device suite (`touch-device.mjs`) is where the machine-readable claims live; this file only drives
 * a real break far enough to be worth photographing, prints the machine values each frame was read
 * at, and writes the JPEGs. Playwright and a browser binary come from the environment, exactly as in
 * that suite: PUFFLY_PLAYWRIGHT, PUFFLY_CHROME, PUFFLY_BROWSER.
 */

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const OUT_DIR = process.argv[3] ?? 'docs/images';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];
const ENGINE = process.env['PUFFLY_BROWSER'] ?? 'chromium';

/** How deep into a break to photograph: enough draws that the row reads as a break in progress. */
const DRAWS = 7;
/** Long enough for the breath to leave the mouth and still be in the air, short enough that the
 * chrome (`controlsIdleMs`) has not folded itself away before the next press. */
const SETTLE_MS = 500;

let browserType;
try {
  const playwright = await import(PLAYWRIGHT_SPEC);
  browserType = playwright[ENGINE];
  if (browserType === undefined) throw new Error(`no such engine: ${ENGINE}`);
} catch {
  console.error(
    `cannot import Playwright's ${JSON.stringify(ENGINE)} from ${JSON.stringify(PLAYWRIGHT_SPEC)}.\n` +
      'Set PUFFLY_PLAYWRIGHT to a playwright entry point (an absolute path to its index.mjs is\n' +
      'always fine) and PUFFLY_CHROME to a browser binary. Not run, so nothing is written.',
  );
  process.exit(3);
}

let browser;
try {
  browser = await browserType.launch(
    CHROME !== undefined
      ? { executablePath: CHROME }
      : ENGINE === 'chromium'
        ? { channel: 'chromium' } // the full build, like the device suite: the shell lacks the GPU paths
        : {},
  );
} catch (error) {
  console.error(`cannot launch ${ENGINE}: ${error.message}`);
  process.exit(3);
}

const phaseOf = (page) =>
  page.evaluate(() => document.querySelector('.stage')?.dataset.phase ?? 'missing');

const waitLit = async (page, withinMs = 3000) => {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const now = await phaseOf(page);
    if (/puff|tray/.test(now)) return now;
    if (Date.now() >= deadline) return '';
    await page.waitForTimeout(120);
  }
};

/**
 * The pill is a handle on a gesture, and a handle folds away 2.6 s after the last input (§10).
 * Between two photographed breaths that window can elapse, so every press goes through here: wake
 * on empty sky — above every prop, so it can't light something by accident — and name the control
 * rather than hanging in a framework retry if it stays hidden.
 */
async function pillReady(page) {
  const pill = page.locator('.pill');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await pill.isVisible().catch(() => false)) return pill;
    await page
      .locator('canvas')
      .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(150);
  }
  throw new Error('pillReady: the pill stayed hidden through three presses on the sky');
}

/** One breath, timed off the row's own clock rather than off a guessed sleep. */
async function drawOnce(page) {
  const pill = await pillReady(page);
  const box = await pill.boundingBox();
  if (box === null) throw new Error('drawOnce: the pill reported no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // `advance()` runs a step per frame, so on a loaded machine a wall-clock hold buys almost no
  // simulated draw. The row prints the hold in seconds — that is the draw's own time, so that is
  // what this waits on.
  await page
    .waitForFunction(
      () => {
        const text = (document.querySelector('.hud .num.alt')?.textContent ?? '').trim();
        return /\d+(\.\d+)?s$/.test(text) && Number(text.replace('s', '')) >= 1.4;
      },
      null,
      { timeout: 25_000, polling: 'raf' },
    )
    .catch(() => {
      // A short breath still photographs; the printed readout below is what says which one it was.
    });
  await page.mouse.up();
  await page.waitForTimeout(SETTLE_MS);
}

async function shoot(name, { width, height, dpr, mouse = false, draws = DRAWS, before }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    // The README is English, so the pictures should be too; the copy table follows the device
    // otherwise, and a headless browser's device language is not the reader's.
    locale: 'en-US',
    ...(mouse ? {} : { isMobile: true, hasTouch: true }),
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('PAGEERROR', String(error)));
  await page.goto(URL_ARG, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  let lit = 'not attempted';
  if (draws > 0) {
    const pill = await pillReady(page);
    await (mouse ? pill.click() : pill.tap());
    await page.waitForTimeout(320);
    lit = '';
    for (let attempt = 0; attempt < 4 && lit === ''; attempt += 1) {
      const again = await pillReady(page);
      await (mouse ? again.click() : again.tap());
      // A cheap wheel lighter sometimes misses (§13), so lighting is "keep trying".
      lit = await waitLit(page);
    }
    // A frame of an unlit table would still be a pretty picture, which is the wrong kind of
    // evidence: it would show the chrome reading `1 · 00:00 · 100%` and look like a break.
    if (lit === '') throw new Error(`${name}: the rod never caught after four tries`);
    for (let i = 0; i < draws; i += 1) await drawOnce(page);
  }
  if (before !== undefined) await before(page);

  const readout = await page.evaluate(() => ({
    phase: document.querySelector('.stage')?.dataset.phase ?? 'missing',
    ring: document.querySelector('.hud .ring .digits')?.textContent?.trim() ?? '',
    alt: document.querySelector('.hud .num.alt')?.textContent?.trim() ?? '',
    force: document.querySelector('.cta .art.force') !== null,
    sheets: document.querySelectorAll('.sheet').length,
  }));
  await page.screenshot({ path: `${OUT_DIR}/${name}.jpg`, type: 'jpeg', quality: 82 });
  console.log('SHOT', JSON.stringify({ name, lit, ...readout }));
  await context.close();
}

await shoot('phone-smoke', { width: 393, height: 852, dpr: 2 });
await shoot('desktop-smoke', { width: 1280, height: 800, dpr: 1, mouse: true });
await shoot('phone-landscape-smoke', { width: 844, height: 390, dpr: 2 });
await shoot('desktop-settings', {
  width: 1280,
  height: 800,
  dpr: 1,
  mouse: true,
  draws: 0,
  before: async (page) => {
    const handle = page.locator('.rail [data-tab="settings"]');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await handle.isVisible().catch(() => false)) break;
      await page
        .locator('canvas')
        .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
      await page.waitForTimeout(150);
    }
    await handle.click();
    await page.waitForTimeout(600);
  },
});

await browser.close();

/**
 * What does the row actually do around the ceiling's self-end and the release after it?
 *
 * The device check `a draw held past its ceiling ends itself, and the release afterwards buys nothing`
 * asserts the count lands at exactly `beforeCeiling + 1`. On 2026-10-17 two runs of one tree disagreed
 * with each other: the passing reading went 1 → 2 after one press, and the failing one went 1 → 3 after
 * `presses 2` — the same code, one window apart. Two explanations fit, and they are different products:
 *
 *   the instrument pressed twice. The re-press is triggered when no draw appears within 1500 ms of
 *     `mouse.down`. If a press that *was* registered simply reports late on a busy page, the check
 *     itself added a draw, and then "+1" is a lie about its own gestures rather than about the game;
 *
 *   the release really does buy a puff. That would be a product bug in the place a player counts most
 *     (12 puffs per rod), and it is exactly the complaint class this round is chasing.
 *
 * This tells them apart by measuring the row continuously instead of at two chosen moments: the press
 * latency to the first seconds, the wall time to the ceiling's bare force figure, whether the count
 * comes back **while the finger is still down**, and then what the count and the scene's own exhale
 * record do in the seconds after the release. Repeated three times, because a single sample of a
 * rotating red proves nothing either way.
 *
 *   node tests/smoke/probe-ceiling-release.mjs http://localhost:5175/
 */

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const playwright = await import(process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright');
const CHROME = process.env['PUFFLY_CHROME'];
const browser = await playwright.chromium.launch(
  CHROME === undefined ? { channel: 'chromium' } : { executablePath: CHROME },
);

const row = (page) =>
  page.evaluate(() => {
    const hud = document.querySelector('.hud');
    const stage = document.querySelector('.stage');
    const p = window.__pufflyScene;
    return {
      figures: hud === null ? [] : [...hud.querySelectorAll('.num')].map((el) => el.textContent.trim()),
      phase: stage?.dataset.phase ?? '',
      affordance: stage?.dataset.affordance ?? '',
      seconds: Number(Number(p?.stageRing?.seconds ?? 0).toFixed(2)),
      particles: p?.particles ?? -1,
      exhale: JSON.stringify(p?.lastExhale ?? null).slice(0, 60),
      frames: p?.frames ?? -1,
    };
  });

const countOf = (figures) => {
  const text = figures.find((t) => t.includes('/')) ?? '';
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : -1;
};

console.log(
  'trial  press→first seconds   seconds→ceiling figure   count while held   after release          exhale changes after release',
);

for (let trial = 0; trial < 3; trial += 1) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page
    .waitForFunction(() => (document.querySelector('.stage')?.dataset.affordance ?? 'none') !== 'none', null, {
      timeout: 15000,
      polling: 150,
    })
    .catch(() => {});

  // The ritual has to be underway before a hold means a draw: on a fresh page the pill carries 拿起来,
  // so holding it picks the rod up and nothing else — measured, the row stayed at 1|00:00|100% through a
  // whole 6 s hold with the seconds never leaving zero. Pick up, strike, and only then hold.
  const aim = await page.evaluate(() => {
    const raw = document.querySelector('.stage')?.dataset.aim ?? '';
    const box = document.querySelector('canvas').getBoundingClientRect();
    const out = {};
    for (const part of raw.split(' ')) {
      const [name, pair] = part.split(':');
      const [x, y] = (pair ?? '').split(',').map(Number);
      if (Number.isFinite(x)) out[name] = { x: box.left + box.width * x, y: box.top + box.height * y };
    }
    return out;
  });
  if (aim.body !== undefined) await page.touchscreen.tap(aim.body.x, aim.body.y);
  await page.waitForTimeout(300);
  if (aim.lighter !== undefined) await page.touchscreen.tap(aim.lighter.x, aim.lighter.y);
  const litUp = await page
    .waitForFunction(
      () => (document.querySelector('.stage')?.dataset.affordance ?? '') === 'puff',
      null,
      { timeout: 9000, polling: 150 },
    )
    .then(() => true)
    .catch(() => false);
  if (!litUp && aim.lighter !== undefined) {
    await page.touchscreen.tap(aim.lighter.x, aim.lighter.y);
    await page
      .waitForFunction(
        () => (document.querySelector('.stage')?.dataset.affordance ?? '') === 'puff',
        null,
        { timeout: 6000, polling: 150 },
      )
      .catch(() => {});
  }

  const start = await row(page);
  const box = (await page.locator('.pill').boundingBox()) ?? (await page.locator('canvas').boundingBox());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const t0 = Date.now();
  await page.mouse.down();

  // Phase 1: how long until the press is visible as a draw at all.
  let beganMs = -1;
  while (Date.now() - t0 < 6000) {
    const r = await row(page);
    if (r.seconds > 0) {
      beganMs = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(60);
  }

  // Phase 2: hold until the row wears the bare force number, which is the ceiling firing on its own.
  let ceilingMs = -1;
  let ceilingAt = 0;
  if (beganMs >= 0) {
    const c0 = Date.now();
    while (Date.now() - c0 < 20000) {
      const r = await row(page);
      if (r.figures.some((t) => /^\d+$/.test(t))) {
        ceilingMs = Date.now() - c0;
        ceilingAt = r.seconds;
        break;
      }
      await page.waitForTimeout(100);
    }
  }

  // Phase 3: the finger stays down. Does the count come back while still holding?
  const held = [];
  const h0 = Date.now();
  while (Date.now() - h0 < 6000) {
    const r = await row(page);
    held.push({ ms: Date.now() - h0, count: countOf(r.figures), figures: r.figures.join('|'), phase: r.phase });
    if (countOf(r.figures) >= 0) break;
    await page.waitForTimeout(150);
  }
  const countWhileHeld = held.filter((h) => h.count >= 0);
  const lastHeld = held[held.length - 1];

  // Phase 4: release, then watch the count and the scene's own exhale record for six seconds.
  const exhaleBeforeRelease = lastHeld ? lastHeld.figures : '';
  const r0 = await row(page);
  const exhaleAt = r0.exhale;
  const countAtRelease = r0.count ?? countOf(r0.figures);
  await page.mouse.up();
  const after = [];
  const a0 = Date.now();
  let exhaleFlips = 0;
  let previousExhale = exhaleAt;
  while (Date.now() - a0 < 6000) {
    const r = await row(page);
    if (r.exhale !== previousExhale) {
      exhaleFlips += 1;
      previousExhale = r.exhale;
    }
    after.push({ ms: Date.now() - a0, count: countOf(r.figures), phase: r.phase, particles: r.particles });
    await page.waitForTimeout(200);
  }
  await context.close();

  const countsAfter = after.map((a) => a.count).filter((c) => c >= 0);
  const maxAfter = countsAfter.length ? Math.max(...countsAfter) : -1;
  console.log(
    `  ${String(trial)}   press→seconds ${String(beganMs)}ms   seconds→ceiling ${String(ceilingMs)}ms (at ${String(
      Math.round(ceilingAt * 100) / 100,
    )}s)   ` +
      `count while held: ${countWhileHeld.length ? `back to ${String(countWhileHeld[0].count)} at ${String(countWhileHeld[0].ms)}ms` : `NEVER returned in 6 s (figures=${lastHeld?.figures ?? '-'})`}   ` +
      `after release: count ${String(countAtRelease)} → max ${String(maxAfter)} (start=${exhaleBeforeRelease})   ` +
      `exhale record changed ${String(exhaleFlips)} times`,
  );
  console.log(
    `      start count=${String(countOf(start.figures))} figures=${start.figures.join('|')} | after timeline ` +
      after
        .filter((a) => a.count >= 0)
        .slice(0, 6)
        .map((a) => `${String(a.ms)}ms:${String(a.count)}`)
        .join(' ') + `   affordance=${start.affordance}`,
  );
}

await browser.close();

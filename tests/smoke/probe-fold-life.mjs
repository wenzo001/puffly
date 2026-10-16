// How long (wall clock) does the chrome stay unfolded after a wake press, at each page speed?
// `controlsIdleMs` is a SIM-time quantity (2.6 s) and `dt` is clamped at 250 ms per frame, so on a
// starved page the fold arrives sooner in wall time than a player's next touch. This measures it.
import { chromium } from 'playwright';
const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4173/puffly/';
const RATE = Number(process.env.PUFFLY_CPU_THROTTLE ?? 0);
const ARGS = (process.env.PUFFLY_CHROME_ARGS ?? '').split(' ').filter(Boolean);
const browser = await chromium.launch({ channel: 'chromium', args: ARGS });
for (const rate of RATE > 0 ? [RATE] : [0]) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  if (rate > 0) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 40000 }).catch(() => {});
  const box = async () => page.evaluate(() => {
    const el = document.querySelector('.hud [data-hook="category"]');
    const r = el?.getBoundingClientRect();
    return { w: r ? Math.round(r.width) : -1, phase: document.querySelector('.stage')?.dataset.phase ?? '' };
  });
  const fps = await page.evaluate(() => new Promise((res) => { const t0 = performance.now(); let n = 0;
    const tick = () => { n += 1; if (window.performance.now() - t0 < 1000) window.requestAnimationFrame(tick); else res(n); };
    window.requestAnimationFrame(tick); }));
  // Wake it, then watch how long the control keeps a box.
  await page.touchscreen.tap(30, 120);
  const t0 = Date.now();
  let unfoldedMs = -1;
  for (let i = 0; i < 400; i += 1) {
    const b = await box();
    if (b.w > 1 && unfoldedMs < 0) unfoldedMs = Date.now() - t0;
    if (unfoldedMs >= 0 && b.w <= 1) break;
    await page.waitForTimeout(50);
  }
  const b2 = await box();
  console.log(JSON.stringify({ rate, fps, firstUnfoldedAfterMs: unfoldedMs, foldedAgainByMs: Date.now() - t0, boxNow: b2.w }));
  await ctx.close();
}
await browser.close();

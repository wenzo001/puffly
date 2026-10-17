// Does "reduce motion" actually reduce it?
//
// The app declares support (SPEC §61's arrivals, and a `prefers-reduced-motion` block in
// `global.css`), and this round already widened that block once — but only for *transitions*.
// Keyframe animations are a separate property and a separate leak: a component that runs
// `animation: something 1.2s infinite` keeps running it under reduce unless its own CSS says
// otherwise. That is exactly the class of "not refined" a player with vestibular sensitivity feels,
// and nothing measured it before now.
//
// It prints, per element that is actually painted, the animation and transition that survive under
// `prefers-reduced-motion: reduce`, grouped so one line is one component. Run against a server:
//   node tests/smoke/probe-reduced-motion.mjs http://localhost:5175/
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const browser = await chromium.launch({ channel: 'chromium' });

const SCAN = `() => {
  const secs = (v) => {
    const m = /([0-9.]+)ms/.exec(v);
    if (m) return Number(m[1]) / 1000;
    const s = /([0-9.]+)s(?!s)/.exec(v);
    return s === null ? 0 : Number(s[1]);
  };
  const rows = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1) continue;
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const anims = cs.animationName === 'none' ? [] : cs.animationName.split(/\\s*,\\s*/);
    const dur = secs(cs.animationDuration.split(/\\s*,\\s*/)[0] ?? '0s');
    const iter = cs.animationIterationCount.split(/\\s*,\\s*/)[0] ?? '1';
    const tdur = secs(cs.transitionDuration.split(/\\s*,\\s*/)[0] ?? '0s');
    const moving = anims.length > 0 && dur > 0.02;
    const slowTransition = tdur > 0.02;
    if (moving || slowTransition) {
      rows.push({
        what:
          el.tagName.toLowerCase() +
          '.' +
          (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : ''),
        animation: moving ? anims.join(',') + ' ' + dur + 's x' + iter : '',
        transition: slowTransition ? cs.transitionProperty + ' ' + tdur + 's' : '',
        /*
         * Movement is the thing reduced-motion is for; a colour or opacity cross-fade is not a
         * vestibular trigger and is left alone on purpose. Without this split the sweep lists a
         * dozen honest fades next to the one real leak, and the next reader chases all of them.
         * (And no backticks anywhere in here: this block is a template literal the page compiles.)
         */
        moves:
          /transform|translate|scale|rotate|inset|top|left|right|bottom|margin|padding/.test(
            (moving ? anims.join(' ') : '') + ' ' + (slowTransition ? cs.transitionProperty : ''),
          ),
      });
    }
  }
  const merged = new Map();
  for (const row of rows) {
    const key = (row.moves ? 'MOVE ' : 'fade ') + row.what + '|' + row.animation + '|' + row.transition;
    merged.set(key, (merged.get(key) ?? 0) + 1);
  }
  return [...merged.entries()].map(([key, n]) => ({ key, n }));
}`;

const CASES = [
  ['phone 393x852', { width: 393, height: 852 }, async () => {}],
  [
    'phone + settings open',
    { width: 393, height: 852 },
    async (page) => {
      await page.touchscreen.tap(60, 300);
      await page.waitForTimeout(220);
      await page
        .locator('.rail [data-tab="settings"]')
        .click({ timeout: 3000 })
        .catch(() => {});
      await page.waitForTimeout(700);
    },
  ],
  ['wide 1280x800', { width: 1280, height: 800 }, async () => {}],
];

for (const reduced of [false, true]) {
  for (const [label, viewport, step] of CASES) {
    const ctx = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: viewport.width < 700,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const page = await ctx.newPage();
    await page.goto(URL_ARG, { waitUntil: 'load' });
    await page
      .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 40000 })
      .catch(() => {});
    await step(page);
    const rows = await page.evaluate(`(${SCAN})()`);
    console.log(
      JSON.stringify({
        label: (reduced ? 'REDUCE  ' : 'FULL    ') + label,
        stillMoving: rows.map((r) => `${r.key} x${r.n}`),
      }),
    );
    await ctx.close();
  }
}
await browser.close();

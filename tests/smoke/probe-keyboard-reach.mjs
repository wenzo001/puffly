// Keyboard reachability, measured rather than assumed.
//
// The app is a touch game with a DOM chrome on top, so the questions a keyboard user asks are
// specific and none of them are answered by the device suite:
//
//   1. WALK — pressing Tab from a fresh document, which controls does the browser actually offer,
//      and does focus ever land on something a finger could not see (a closed panel's row, an
//      `opacity: 0` shell, an element with no box)?
//   2. HANDOFF — when a panel is opened *from the keyboard*, does focus move into it? If it stays on
//      the rail button behind the panel, the first Tab after opening walks the controls the panel
//      just covered.
//   3. RETURN — when the panel closes, is focus left on a node that no longer exists (the browser
//      then restarts from the top of the document, which reads as "my Tab key jumped").
//
// It asserts nothing. Run against a dev or preview server:
//   node tests/smoke/probe-keyboard-reach.mjs http://localhost:5175/
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const browser = await chromium.launch({ channel: 'chromium' });

const READ = `() => {
  const el = document.activeElement;
  if (el === null || el === document.body) return { id: 'body', domInk: false, alpha: 0, ring: 'n/a' };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  /*
   * Two reads here produced false findings on the first run and were rebuilt, so both are printed
   * as numbers rather than as verdicts:
   *  - "is the player looking at it" is NOT answerable from CSS in this build, and the first two
   *    guesses both produced false findings. The folded chrome is a deliberate 0.16 on an ancestor
   *    (.chrome, SPEC 10: it dims to a hint and stays reachable, so a dimmed stop is by design), and
   *    worse, html.scene3d-text sets opacity: 0 on .cat, .pill, .rail and .archive (global.css
   *    :549-578) ON PURPOSE: the 3D scene paints those pixels and the element is left behind as the
   *    hit target and the accessibility node. So this field is named domInk, not seen: it answers
   *    "is the DOM layer drawing here", and a zero is expected for every control whose ink lives in
   *    the scene. Whether the player sees anything is a pixel question (column luminance against an
   *    unlit constant), not this one. Note for whoever edits this file next: everything in here is
   *    a template literal the page compiles, so a backtick in a comment silently ends the string.
   *  - "has it a focus ring" cannot be read blind either: the native date field reported no outline
   *    in this walk and measured 2px solid when the same element was read a moment later. It is only
   *    a claim while the browser itself considers the element :focus-visible.
   */
  let alpha = 1;
  for (let n = el; n !== null && n !== document.body; n = n.parentElement) {
    alpha *= Number(getComputedStyle(n).opacity);
  }
  const focusVisible = el.matches(':focus-visible');
  const hook = [...el.attributes]
    .map((a) => a.name)
    .filter((n) => n.startsWith('data-') && !/^data-v-[0-9a-f]+$/.test(n))
    .map((n) => '=' + n.replace('data-', '') + (el.getAttribute(n) || ''))
    .join('');
  return {
    id:
      el.tagName.toLowerCase() +
      '.' +
      (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '') +
      hook,
    name: (el.getAttribute('aria-label') ?? '').trim() || (el.textContent ?? '').trim().slice(0, 18),
    domInk: r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && alpha > 0.3,
    alpha: +alpha.toFixed(2),
    box: [Math.round(r.width), Math.round(r.height)],
    inClosedPanel: !!el.closest('.sheet:not([data-open="true"])'),
    ring:
      !focusVisible
        ? 'not focus-visible'
        : cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2
          ? 'outline'
          : cs.boxShadow !== 'none'
            ? 'shadow'
            : 'NONE',
  };
}`;

const walk = async (page, tabs) => {
  const seen = [];
  for (let i = 0; i < tabs; i += 1) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(`(${READ})()`);
    seen.push(at);
    if (at.id === 'body') break;
  }
  return seen;
};

const report = (label, seen) => {
  const ids = seen.map((s) => s.id);
  const domBlank = seen.filter((s) => s.domInk === false && s.id !== 'body');
  const inClosed = seen.filter((s) => s.inClosedPanel);
  const noRing = seen.filter((s) => s.ring === 'NONE');
  const unique = [...new Set(ids)];
  console.log(
    JSON.stringify({
      label,
      tabs: seen.length,
      distinct: unique.length,
      firstEight: unique.slice(0, 8),
      domBlankStops: domBlank.slice(0, 5),
      focusInsideClosedPanel: inClosed.slice(0, 3),
      focusVisibleWithNoRing: noRing.slice(0, 5),
    }),
  );
};

const fresh = async (viewport) => {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 700 });
  const page = await ctx.newPage();
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page
    .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 40000 })
    .catch(() => {});
  return { ctx, page };
};

// 1. WALK on a phone, from a fresh document: the chrome has folded itself away by now, which is
//    itself part of the answer (a folded row is `visibility: hidden`, so it leaves the tab order).
{
  const { ctx, page } = await fresh({ width: 393, height: 852 });
  report('phone idle (chrome folded)', await walk(page, 40));
  await ctx.close();
}

// 2. HANDOFF: open the settings panel with the keyboard and ask where focus went.
{
  const { ctx, page } = await fresh({ width: 393, height: 852 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await page.evaluate(`(${READ})()`);
  // Reach the rail's settings button by Tabbing until it appears, then press Enter.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() =>
      (document.activeElement?.getAttribute('data-tab') ?? '') === 'settings',
    );
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const after = await page.evaluate(`(${READ})()`);
  const open = await page.evaluate(
    () => document.querySelectorAll('.sheet[data-open="true"]').length,
  );
  console.log(
    JSON.stringify({
      label: 'keyboard opens the settings panel',
      reachedTheRailButton: reached,
      focusBefore: before.id,
      focusAfter: after.id,
      focusMovedInsidePanel: await page.evaluate(
        () => !!document.activeElement?.closest('.sheet[data-open="true"]'),
      ),
      sheetsOpen: open,
    }),
  );

  // 3. RETURN: close it the same way and check focus is not left on a removed node.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const closed = await page.evaluate(`(${READ})()`);
  console.log(
    JSON.stringify({
      label: 'Escape closes it',
      sheetsOpen: await page.evaluate(() => document.querySelectorAll('.sheet[data-open="true"]').length),
      focusAfterClose: closed.id,
      focusStillDrawnInDom: closed.domInk,
    }),
  );
  await ctx.close();
}

// 4. WALK inside an open panel: does the whole panel get offered, and does the page scroll follow?
{
  const { ctx, page } = await fresh({ width: 393, height: 852 });
  await page.touchscreen.tap(60, 300);
  await page.waitForTimeout(250);
  await page.locator('.rail [data-tab="settings"]').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  const seen = await walk(page, 45);
  report('phone with settings open', seen);
  console.log(
    JSON.stringify({
      label: 'does Tab scroll the panel?',
      sheetScrollTop: await page.evaluate(
        () => document.querySelector('.sheet[data-open="true"]')?.scrollTop ?? -1,
      ),
      windowScrollY: await page.evaluate(() => window.scrollY),
    }),
  );
  await ctx.close();
}

await browser.close();

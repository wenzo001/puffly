// A general sweep for the two halves of "the UI is not refined" that a screenshot hides and the
// device suite only ever checks one pair at a time:
//
//   COVERED — an interactive control whose own centre answers a DIFFERENT layer. The pinned archive
//     card over a sheet's `.close` was found that way (`probe-card-overlap.mjs`); that is one
//     instance of a class, because every absolutely-positioned layer in `.stage` can land on any
//     control and nothing looked at the other pairs.
//   REACH — how large a square, centred on the control, is still entirely hit-testable as that
//     control. A box of 34 px with a 44 px transparent `::after` reaches 44, and `getBoundingClientRect`
//     cannot see that; a finger can. Compared against the app's own `--tap-target`.
//
// Two things this deliberately does NOT call a defect, because both were false positives the first
// time: a control scrolled below its panel's edge (`clipped`, not covered — the rail is simply what
// sits below it), and the stage's full-bleed `.hit` surface, which is a catch-all, not a target.
//
// It asserts nothing. Run against a build:
//   PUBLIC_BASE=/puffly/ npm run build
//   PUBLIC_BASE=/puffly/ npm run preview
//   node tests/smoke/probe-covered-controls.mjs http://localhost:4173/puffly/
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const browser = await chromium.launch({ channel: 'chromium' });

const SCAN = `() => {
  const name = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '';
    const hook = [...el.attributes]
      .map((a) => a.name)
      .filter((n) => n.startsWith('data-') && !n.startsWith('data-v-'))
      .slice(0, 2)
      .map((n) => '=' + n.replace('data-', '') + (el.getAttribute(n) || ''))
      .join('');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + hook;
  };
  const target =
    Number(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--tap-target')
        .replace('px', ''),
    ) || 44;
  const RADII = [12, 17, 22, 27, 32, 40];
  const hits = (el, cx, cy, r) => {
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      if (!(hit === el || el.contains(hit) || hit === null)) return false;
    }
    return true;
  };
  /** Is that centre inside every scrollable ancestor's visible box? If not, it is scrolled away. */
  /*
   * Is that centre outside the panel that holds it? The first version walked ancestors and tested
   * their computed overflow, and it could not be made to agree with itself: the same element at the
   * same point answered false from that walk and true from an identical loop written a few lines
   * later, with the panel's own box printed as 204..778 in the same breath. (Anything written in
   * here is inside a template literal that the page compiles, so a stray backtick in a comment
   * silently ends the string — that is how this file broke twice.) Naming the container is cheaper
   * and checkable, so that is what this does: .sheet is the only scroll container a control can be
   * scrolled away inside, and the viewport catches the rest.
   */
  const clipped = (el, cx, cy) => {
    const host = el.closest('.sheet');
    const b =
      host === null
        ? { top: 0, bottom: innerHeight, left: 0, right: innerWidth }
        : host.getBoundingClientRect();
    return cx < b.left + 1 || cx > b.right - 1 || cy < b.top + 1 || cy > b.bottom - 1;
  };
  const sheetBottom = () => {
    const el = document.querySelector('.sheet[data-open="true"]');
    return el === null ? -1 : Math.round(el.getBoundingClientRect().bottom);
  };
  const before = sheetBottom();
  const covered = [];
  const short = [];
  let clippedCount = 0;
  let counted = 0;
  for (const el of document.querySelectorAll('button, input, a[href], select, textarea, [role=button], [tabindex]')) {
    if (el.classList.contains('hit')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || el.disabled) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
    counted += 1;
    const isClipped = clipped(el, cx, cy);
    if (isClipped) {
      clippedCount += 1;
      continue;
    }
    const hit = document.elementFromPoint(cx, cy);
    if (hit !== null && !(hit === el || el.contains(hit) || hit.contains(el))) {
      covered.push({
        what: name(el),
        by: name(hit),
        centre: [Math.round(cx), Math.round(cy)],
      });
    }
    let reach = 0;
    for (const radius of RADII) {
      if (hits(el, cx, cy, radius)) reach = radius * 2;
      else break;
    }
    if (reach < target) short.push({ what: name(el), reach, box: [Math.round(r.width), Math.round(r.height)] });
  }
  return { counted, target, covered, short, clippedCount, sheetBottomBefore: before, sheetBottomAfter: sheetBottom() };
}`;

/** Press what a player presses, then let the sheet land. */
async function open(page, selector) {
  await page.touchscreen.tap(60, 300);
  await page.waitForTimeout(220);
  await page
    .locator(selector)
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await settle(page);
}

/**
 * Wait until the open panel stops moving. A sheet slides up with a 380 ms transform, and while it
 * is still sliding its own box reaches down under the static rail — so a control that is merely
 * scrolled to the bottom of a moving panel reads as "covered by the rail". The first version of
 * this sweep reported exactly that, three times, for the language row.
 */
async function settle(page) {
  let last = '';
  let same = 0;
  for (let lap = 0; lap < 14 && same < 3; lap += 1) {
    const now = await page.evaluate(() => {
      const el = document.querySelector('.sheet[data-open="true"]');
      if (el === null) return 'none';
      const r = el.getBoundingClientRect();
      return [r.top, r.bottom, el.scrollTop].map((n) => Math.round(n)).join(',');
    });
    same = now === last ? same + 1 : 0;
    last = now;
    await page.waitForTimeout(200);
  }
}

async function pinCard(page) {
  await page.touchscreen.tap(60, 300);
  await page.waitForTimeout(200);
  const mark = page.locator('.hud [data-hook="category"]');
  await mark.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.waitForTimeout(760);
  const pin = page.locator('[data-hook="pin"]');
  await pin.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await pin.dispatchEvent('pointerup', { pointerType: 'touch' });
  await pin.dispatchEvent('click');
  await page.waitForTimeout(200);
  await mark.dispatchEvent('pointerup', { pointerType: 'touch' });
  await mark.dispatchEvent('click');
  await page.waitForTimeout(300);
  await page.locator('.hud [data-hook="category"]').click({ timeout: 3000 }).catch(() => {});
  await settle(page);
}

const CASES = [
  ['phone 393x852 idle', { width: 393, height: 852 }, async () => {}],
  ['phone + shelf', { width: 393, height: 852 }, async (p) => await open(p, '.hud [data-hook="category"]')],
  ['phone + settings', { width: 393, height: 852 }, async (p) => await open(p, '.rail [data-tab="settings"]')],
  ['phone + pinned card + shelf', { width: 393, height: 852 }, pinCard],
  ['wide 1280x800 idle', { width: 1280, height: 800 }, async () => {}],
  ['wide + settings', { width: 1280, height: 800 }, async (p) => await open(p, '.rail [data-tab="settings"]')],
  ['landscape 852x393', { width: 852, height: 393 }, async () => {}],
];

for (const [label, viewport, step] of CASES) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 700 });
  const page = await ctx.newPage();
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page
    .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 40000 })
    .catch(() => {});
  await step(page);
  const seen = await page.evaluate(`(${SCAN})()`);
  const dedupe = (rows) => [...new Map(rows.map((r) => [JSON.stringify(r), r])).values()];
  console.log(
    JSON.stringify({
      label,
      controls: seen.counted,
      tapTarget: seen.target,
      scrolledAway: seen.clippedCount,
      panelMoved: [seen.sheetBottomBefore, seen.sheetBottomAfter],
      covered: dedupe(seen.covered),
      short: dedupe(seen.short),
    }),
  );
  await ctx.close();
}
await browser.close();

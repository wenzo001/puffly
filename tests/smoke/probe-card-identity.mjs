// Does the new identity clause in `the tile and the card say the same number of minutes for the
// same rod` actually bite? Both figures come from one function (`archiveModel.rodMinutes`), so the
// only way they can disagree is the card describing a DIFFERENT rod than the tile — which a 20x run
// showed. This proves the clause separates "same rod" from "some rod": the held rod's own name has
// to match, and another tile's name must NOT match.
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page
  .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 40000 })
  .catch(() => {});
await page.touchscreen.tap(60, 300);
await page.waitForTimeout(200);
await page.locator('.hud [data-hook="category"]').tap({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(600);

const ids = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.tile')];
  const locked = tiles.find((t) => t.dataset.locked === 'true');
  const other = [...tiles].reverse().find((t) => t !== locked);
  const text = (el, sel) => (el?.querySelector(sel)?.textContent ?? '').trim();
  return {
    lockedRod: locked?.dataset.rod ?? 'none',
    lockedName: text(locked, '.name'),
    lockedTile: text(locked, '.length .digits'),
    otherRod: other?.dataset.rod ?? 'none',
    otherName: text(other, '.name'),
  };
});

const mark = page.locator('.tile[data-locked="true"]').first();
await mark.dispatchEvent('pointerdown', { pointerType: 'touch' });
await page.waitForTimeout(760);
const card = await page.evaluate(() => {
  const el = document.querySelector('[data-hook="archive"]');
  return {
    name: (el?.querySelector('.name')?.textContent ?? '').trim(),
    cellsText: [...(el?.querySelectorAll('.cells dd') ?? [])].map((n) =>
      (n.textContent ?? '').trim(),
    ),
  };
});
await mark.dispatchEvent('pointerup', { pointerType: 'touch' });

console.log(
  JSON.stringify(
    {
      ids,
      card,
      // The two halves of the clause: green against the rod that was held, red against any other.
      sameRod: card.name === ids.lockedName && card.name.length > 0,
      lieAgainstOtherTile: card.name === ids.otherName,
      minutesAgree: card.cellsText.some((t) => t.includes(ids.lockedTile)),
    },
    null,
    1,
  ),
);
await ctx.close();
await browser.close();

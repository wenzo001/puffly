// Does a PINNED archive card really sit on top of an open sheet's close button?
//
// The device suite has been reporting `blocked:["close=aside.archive<…|open=1|card=1"]` under CPU
// starvation, and the reading it supports is a layout collision, not a speed problem: the card is
// `position:absolute; top:58px; inset-inline-end:14px; z-index:3` inside `.stage`, and a sheet is a
// bottom panel whose header keeps its `.close` at the same right edge. `App.vue` never dismisses a
// *pinned* card when a sheet opens (`dismissArchive` returns early while pinned — that is the point
// of pinning), so the two are allowed to be on screen together.
//
// This measures the two boxes at NORMAL speed, where nothing is starved, plus a positive control
// (same point with the card closed) so a "no overlap" answer can be told apart from a broken probe.
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const MARK = '.hud [data-hook="category"]';
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

const read = () =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const card = box('.archive');
    const close = box('.sheet[data-open="true"] .close');
    // Which layer loses something *clickable* decides whether one side can simply be demoted. The
    // card's own two controls are its header close and its pin toggle, so measure those too rather
    // than guessing where they land.
    const cardClose = box('.archive .close');
    const cardPin = box('.archive [data-hook="pin"]');
    const onTopOf = (b) => {
      if (b === null) return null;
      const hit = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2);
      return hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(/\s+/)[0]}` : null;
    };
    let overlap = null;
    let onTop = null;
    if (close !== null) {
      // Read the top-most element no matter whether a card is standing: the control below has to
      // show the same point answering the close itself, and a branch that only runs while a card
      // exists would report `null` for "no card" and "probe broken" alike.
      onTop = onTopOf(close);
      if (card !== null) {
        const dx = Math.min(card.x + card.w, close.x + close.w) - Math.max(card.x, close.x);
        const dy = Math.min(card.y + card.h, close.y + close.h) - Math.max(card.y, close.y);
        overlap = dx > 0 && dy > 0 ? { dx: Math.round(dx), dy: Math.round(dy) } : null;
      }
    }
    return {
      sheet: document.querySelectorAll('.sheet[data-open="true"]').length,
      card,
      close,
      overlap,
      onTop,
      cardClose,
      cardCloseOnTop: onTopOf(cardClose),
      cardPin,
      cardPinOnTop: onTopOf(cardPin),
      sheetTop: (document.querySelector('.sheet[data-open="true"]')?.getBoundingClientRect() ?? {
        y: -1,
      }).y,
    };
  });

// Pin the card through the app's own gesture: hold the mark, second finger on the pin.
const mark = page.locator(MARK);
await page.touchscreen.tap(60, 300);
await page.waitForTimeout(200);
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
const withCard = await read();

// Then open the shelf the way a player does, leaving the pinned card where it is.
await page.locator(MARK).tap({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);
const both = await read();

// Positive control: close the card and re-read the same point.
await page.locator('.archive .close').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(500);
const control = await read();

console.log(
  JSON.stringify(
    {
      viewport: [393, 852],
      cardOnly: { sheet: withCard.sheet, card: withCard.card, close: withCard.close },
      cardAndSheet: both,
      afterClosingCard: control,
    },
    null,
    1,
  ),
);
await ctx.close();
await browser.close();

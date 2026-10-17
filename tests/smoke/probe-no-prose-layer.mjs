// The no-prose layer (`语言 = icons`), swept for controls that become nothing.
//
// That layer is a real, shipped option: the app answers `data-cues="audio"` and drops the words.
// A control whose only content WAS a word then has nothing left to press, and the 3D scene cannot
// paint it either — the scene draws mirrors of DOM text and glyphs, so an empty DOM element is
// empty on screen too.
//
// For each visible interactive control, in both the worded and the wordless layer, this reports:
//   text     — the words it shows
//   graphic  — an svg / i / canvas / a span whose class says glyph-mark-or-word, or a background image
//   ink      — a border or a non-transparent background: something to aim at
// A defect is a control that has NO text, NO graphic and NO ink while still being tappable.
//
//   node tests/smoke/probe-no-prose-layer.mjs http://localhost:5175/
import { chromium } from 'playwright';

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const browser = await chromium.launch({ channel: 'chromium' });

const SCAN = `() => {
  const rows = [];
  for (const el of document.querySelectorAll('button, input, a[href], [role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || el.disabled) continue;
    const text = (el.textContent ?? '').trim();
    const graphic =
      el.querySelector('svg, i, canvas, img, [class*="glyph"], [class*="mark"], [class*="icon"]') !==
        null ||
        (cs.backgroundImage.includes('url(') || cs.backgroundImage.includes('gradient')) ||
        /*
         * A range input paints its track and thumb on pseudo-elements, which no DOM query reaches,
         * and getComputedStyle(el, '::-webkit-slider-thumb') answers with the element's own values
         * (measured: a 195x40 transparent box for what is really a 22 px round thumb). The app
         * lifted that ink into --slider-* custom properties (global.css:332-367), and those ARE
         * readable on the element. Without them every slider reads as "nothing left to aim at".
         */
        cs.getPropertyValue('--slider-thumb-size').trim() !== '';
    const ink =
      (cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0) ||
      (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
      (cs.boxShadow !== 'none' && cs.boxShadow !== '');
    rows.push({
      what:
        el.tagName.toLowerCase() +
        '.' +
        (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '') +
        [...el.attributes]
          .map((a) => a.name)
          .filter((n) => n.startsWith('data-') && !/^data-v-[0-9a-f]+$/.test(n))
          .slice(0, 1)
          .map((n) => '=' + n.replace('data-', '') + (el.getAttribute(n) || ''))
          .join(''),
      text: text.slice(0, 14),
      graphic,
      ink,
      box: [Math.round(r.width), Math.round(r.height)],
      label: (el.getAttribute('aria-label') ?? '').trim().slice(0, 14),
    });
  }
  const pressed = [...document.querySelectorAll('[data-language]')]
    .filter((el) => el.getAttribute('aria-pressed') === 'true')
    .map((el) => el.dataset.language);
  const labelWords = [...document.querySelectorAll(".sheet[data-open='true'] .label")]
    .map((el) => (el.textContent ?? '').trim())
    .filter((t) => t !== '').length;
  return {
    cues: document.querySelector('.stage')?.dataset.cues ?? '',
    pressedLanguage: pressed,
    labelWords,
    words: rows.filter((x) => x.text !== '').length,
    empty: rows.filter((x) => x.text === '' && !x.graphic && !x.ink),
    total: rows.length,
    rows,
  };
}`;

const page = await (
  await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
).newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page
  .waitForFunction(() => (window.__pufflyScene?.frames ?? 0) > 5, null, { timeout: 40000 })
  .catch(() => {});

const snapshot = async (tag) => {
  const seen = await page.evaluate(`(${SCAN})()`);
  console.log(
    JSON.stringify({
      tag,
      cues: seen.cues,
      controls: seen.total,
      pressedLanguage: seen.pressedLanguage,
      labelWords: seen.labelWords,
      withWords: seen.words,
      nothingLeft: seen.empty.map((e) => `${e.what} ${JSON.stringify(e.box)} label=${e.label}`),
    }),
  );
  return seen;
};

await page.touchscreen.tap(60, 300);
await page.waitForTimeout(250);
await page.locator('.rail [data-tab="settings"]').click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(800);
const worded = await snapshot('settings open, words on');

// Switch to the wordless layer through the row's own control, then re-read the same surfaces.
await page.locator('[data-language="icons"]').click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(900);
const wordless = await snapshot('settings open, icons layer');

// And the stage itself, with the panel closed: the pill and the rail are the only affordances left.
await page.locator('.sheet[data-open="true"] .close').click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);
await page.touchscreen.tap(60, 300);
await page.waitForTimeout(400);
await snapshot('stage only, icons layer');

console.log(
  JSON.stringify({
    labelsDropped: worded.labelWords - wordless.labelWords,
    note: 'labelWords dropping + pressedLanguage=[icons] is the layer engaging; nothingLeft is the layer being wrong',
  }),
);
await browser.close();

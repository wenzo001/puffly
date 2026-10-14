/**
 * Which glyphs the settings sheet writes as literal text can the browser actually draw?
 *
 * #163 recorded two things as possibly one: 「房间/语言」行那几个斜纹方块 — and it was right to
 * insist they be judged apart. Measured 2026-10-13 on the built app, cropping each button and
 * looking at it:
 *
 *   ▨  (settings.scene)      draws — a hatched square, not a tofu box.
 *   ◌  (settings.language/auto) **tofu** — a hollow box with a centre dot, which is `.notdef`.
 *   A  (English)             draws.
 *   中 (中文)                draws.
 *   ع  (العربية)             **tofu ×8** — the browser has no Arabic at all, so every letter of the
 *                             endonym falls back to `.notdef`.
 *   ∅  (icons)               draws.
 *
 * The trap, and the reason this file exists rather than a screenshot: **a tofu box is inked.** Its
 * coverage is 21–34% of its box, which reads as a healthy glyph. An earlier measurement in this
 * session ranked all five as fine, on that number alone. Coverage cannot tell a drawn glyph from a
 * `.notdef`; only the shape can, so the check below measures the shape — a `.notdef` is a hollow
 * rectangle, so its ink sits almost entirely on a border and leaves the interior empty.
 *
 *   node tests/smoke/scan-glyphs.mjs http://127.0.0.1:4179/puffly/
 */

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:4179/puffly/';
const CHROME =
  process.env['PUFFLY_CHROME'] ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const playwright = await import('playwright');
const browser = await playwright.chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 4,
});
const page = await context.newPage();
await page.goto(URL_ARG, { waitUntil: 'load' });
await page.waitForSelector('.stage');
await page.waitForTimeout(1400);

const tab = await page.locator('.rail [data-tab="settings"]').boundingBox();
if (tab === null) throw new Error('the settings tab is not on screen');
await page.mouse.click(tab.x + tab.width / 2, tab.y + tab.height / 2);
await page.waitForTimeout(900);

/**
 * Reads one element's pixels and answers "is this a drawn glyph or a `.notdef` box?"
 *
 * A `.notdef` box is a rectangle outline: its ink lies on the border, and the middle is empty. So
 * the discriminator is where the ink sits, not how much of it there is.
 *
 * `box` rather than a selector, so the same analysis answers for a row found by a selector and for a
 * mark found by walking the DOM.
 */
const measureBox = async (box) => {
  if (box === null) return null;
  // A clip must sit inside the viewport: Playwright throws rather than returning a blank frame, and
  // a mark the sheet has scrolled past is not a reading this file can give.
  const size = page.viewportSize();
  if (box.x < 0 || box.y < 0 || box.x + box.width > size.width || box.y + box.height > size.height) {
    return null;
  }
  const shot = (await page.screenshot({ clip: box })).toString('base64');
  return page.evaluate(
    async ([b64]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const W = img.width;
      const H = img.height;
      let lit = 0;
      const ink = [];
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (L > 90) {
          lit += 1;
          const px = (i / 4) % W;
          const py = Math.floor(i / 4 / W);
          ink.push([px, py]);
        }
      }
      if (ink.length === 0) {
        return { lit: 0, share: 0, coreShare: 0, verdict: 'nothing drawn' };
      }
      let minX = W;
      let maxX = -1;
      let minY = H;
      let maxY = -1;
      for (const [px, py] of ink) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      const iw = maxX - minX + 1;
      const ih = maxY - minY + 1;
      // The interior of the inked box, inset by a fifth.
      const insetX = Math.max(1, Math.round(iw * 0.2));
      const insetY = Math.max(1, Math.round(ih * 0.2));
      let core = 0;
      for (const [px, py] of ink) {
        if (px > minX + insetX && px < maxX - insetX && py > minY + insetY && py < maxY - insetY) core += 1;
      }
      /**
       * The discriminator, and why core-ink alone is not enough.
       *
       * An empty core says "an outline", which is true of a `.notdef` box **and of a circle** — so
       * `∅` was first read as broken for that reason alone. The difference between them is the
       * *profile*: a box carries ink down the full height of its two vertical edges, while a
       * circle touches its extreme columns only near the middle. So this counts, on the leftmost
       * and rightmost inked columns, how much of the height is covered.
       */
      const byColumn = new Map();
      for (const [px, py] of ink) {
        if (!byColumn.has(px)) byColumn.set(px, []);
        byColumn.get(px).push(py);
      }
      const spanY = Math.max(1, maxY - minY);
      const edgeFill = (px) => {
        const ys = byColumn.get(px);
        return ys === undefined ? 0 : ys.length / spanY;
      };
      const leftFill = edgeFill(minX);
      const rightFill = edgeFill(maxX);
      return {
        lit,
        inkW: iw,
        inkH: ih,
        share: +(lit / (W * H)).toFixed(4),
        coreShare: +(core / Math.max(1, iw * ih)).toFixed(4),
        edgeFill: +Math.min(leftFill, rightFill).toFixed(4),
      };
    },
    [shot],
  );
};

/**
 * `.notdef` is a rectangle outline: both extreme columns are inked down most of their height.
 * A circle (∅, ○) has an empty core too, but its extreme columns are inked only near the middle,
 * so its edge fill is low. Requiring *both* a low core and a tall edge is what separates them.
 */
const isNotdef = (m) =>
  m !== null && m.lit > 0 && m.coreShare < 0.12 && m.edgeFill > 0.55;

/** The same reading, for an element named by a selector. */
const measureInk = async (selector) => measureBox(await page.locator(selector).boundingBox());

/**
 * The same reading, for a mark found by walking the DOM — the shell writes its marks as bare text,
 * so there is no stable selector to point a ruler at, only the element that holds the character.
 */
const measureMarkByText = async (glyph) => {
  const box = await page.evaluate(
    ([g]) => {
      const nodes = [...document.querySelectorAll('button, span, p, div')].filter((el) => {
        const text = (el.textContent ?? '').trim();
        if (text !== g) return false;
        const r = el.getBoundingClientRect();
        // Only the element that actually *is* the mark, not an ancestor that contains it.
        return (
          r.width < 200 &&
          r.height < 80 &&
          ![...el.children].some((c) => (c.textContent ?? '').trim() === g)
        );
      });
      const el = nodes[0];
      if (el === undefined) return null;
      // The sheet scrolls, so a mark can sit outside the viewport; a screenshot clip that does is a
      // hard error in Playwright rather than a blank reading.
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 2), y: Math.max(0, r.y - 4), width: r.width + 4, height: r.height + 8 };
    },
    [glyph],
  );
  return measureBox(box);
};

const findings = [];

const scene = await measureInk('[data-setting="scene"]');
findings.push({ where: 'settings.scene', glyph: '▨', ink: scene, notdef: isNotdef(scene) });

const langs = await page.evaluate(() =>
  [...document.querySelectorAll('[data-language]')].map((b) => ({
    code: b.getAttribute('data-language') ?? '?',
    glyph: b.querySelector('.glyph')?.textContent ?? '',
  })),
);
for (const lang of langs) {
  const ink = await measureInk(`[data-language="${lang.code}"] .glyph`);
  findings.push({
    where: `settings.language/${lang.code}`,
    glyph: lang.glyph,
    ink,
    notdef: isNotdef(ink),
  });
}

/**
 * Every other literal mark the shell writes, found by walking the open sheet rather than by grep.
 * §2/§H.8 give the interface a set of marks, and they are all DOM text rather than the atlas — so
 * the language row is not the only place a font can be missing one. `◌` alone was written four more
 * times (the smoke-quality "auto" chip, the reduced-motion toggle, contrast beside it, and end-break),
 * which is why this walks the DOM: grep found them by luck, and a ruler that only knows the row I
 * happened to look at would have missed the other four.
 */
const shellMarks = await page.evaluate(() => {
  const out = [];
  const seen = new Set();
  const walk = document.createTreeWalker(document.body, 4 /* SHOW_TEXT */);
  for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
    const text = (n.textContent ?? '').trim();
    if (text === '') continue;
    // A button or a mark whose whole text is one or two non-word characters is a mark, not a word.
    if (text.length > 2) continue;
    if (!/[^\p{L}\p{N}\s.,!?'"()·:/-]/u.test(text)) continue;
    const el = n.parentElement;
    if (el === null) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    const box = el.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    out.push({
      where:
        el.getAttribute('data-hook') ??
        el.getAttribute('data-setting') ??
        el.getAttribute('aria-label') ??
        el.className ??
        el.tagName.toLowerCase(),
      glyph: text,
      selector: null,
      index: out.length,
    });
  }
  return out;
});
for (const mark of shellMarks) {
  const ink = await measureMarkByText(mark.glyph);
  if (ink === null) continue;
  findings.push({ where: `shell mark — ${mark.where}`, glyph: mark.glyph, ink, notdef: isNotdef(ink) });
}

await context.close();
await browser.close();

console.log('\nglyphs the settings sheet writes as literal text, read off the built app:');
console.log('  where                        glyph  core-ink  verdict');
for (const f of findings) {
  const core = f.ink === null ? '-' : `${(f.ink.coreShare * 100).toFixed(1)}%`;
  const edge = f.ink === null ? '-' : `${(f.ink.edgeFill * 100).toFixed(1)}%`;
  const verdict = f.ink === null ? 'element not found' : f.notdef ? '** .notdef — the font has no glyph **' : 'drawn';
  console.log(
    `  ${f.where.padEnd(28)} ${f.glyph.padEnd(6)} ${core.padStart(8)} ${edge.padStart(10)}   ${verdict}`,
  );
}
const broken = findings.filter((f) => f.notdef);
console.log(
  broken.length === 0
    ? '\n  every glyph in this block is drawn by the browser'
    : `\n  ${broken.length} of ${findings.length} are .notdef: ${broken.map((f) => `${f.where} (${f.glyph})`).join(', ')}`,
);
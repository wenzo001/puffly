/**
 * The primary button, §4.2 of the Demo: 62 px tall, two visual states, icon 26 plus a two-character
 * word, gap 12 — and no ring anywhere on it. The three strips under it carry the Demo's own S3 / S4
 * / S5 geometry (342-wide wave, fill bar and ash diagram), so this pins the anatomy the way
 * hud-anatomy pins the header ring.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORCE_BAR } from '../forceArt';

const PILL = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');

function artTag(cls: string): string {
  const at = PILL.indexOf(`class="art ${cls}"`);
  expect(at, `the pill no longer has the .art.${cls} block`).toBeGreaterThan(-1);
  const open = PILL.lastIndexOf('<svg', at);
  const close = PILL.indexOf('>', at);
  return PILL.slice(open, close);
}

/** The body of one CSS rule, braces included, chosen by its selector. */
function cssRule(text: string, selector: RegExp): string {
  const found = selector.exec(text);
  if (!found) throw new Error(`no rule matching ${selector}`);
  const open = text.indexOf('{', found.index);
  if (open < 0) throw new Error(`rule matching ${selector} has no body`);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && --depth === 0) return text.slice(open, index + 1);
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

describe('the pill is the Demo button and nothing more', () => {
  it('wears no ring: not an arc element, a progress circle or an .arc rule', () => {
    expect(PILL).not.toContain('class="arc"');
    expect(PILL).not.toMatch(/<svg[^>]*class="arc"/);
    expect(PILL).not.toContain('circle.run');
    expect(PILL).not.toMatch(/\.arc\s*\{/);
  });

  it('keeps the 62 / 31 / two-state anatomy, bound to the rules that carry it', () => {
    // Reading the whole file made this blind to the one thing that matters: the dark half of §2's two
    // states is a **selector**, not a colour. Deleting the `:not(...)` rule and pasting its two
    // declarations into `.pill` keeps every literal and makes the pill stop changing for
    // 吐烟／收烟／磕灰 — measured below as the decoy that only the bound form catches.
    const base = cssRule(PILL, /^\.pill \{/m);
    expect(base).toMatch(/min-height: 62px/);
    expect(base).toMatch(/border-radius: 31px/);
    expect(base).toContain('linear-gradient(90deg, #ff8533, #de5719)');
    // The Demo's own press curve, scoped to this button rather than to the app's global ease.
    expect(base).toContain('cubic-bezier(0.22, 0.61, 0.36, 1)');

    // Pressed: both the mouse's `:active` and the app's own held flag have to reach the shrink.
    // Located by the first selector of the pair; the body is the same one either half brings.
    const pressed = cssRule(PILL, /^\.pill:active,/m);
    expect(PILL).toContain(".cta[data-held='true'] .pill");
    expect(pressed).toMatch(/transform: *scale\(0\.98\)/);

    // And the inside-a-break state has to be the *rule that matches then*, not just a colour nearby.
    const dark = cssRule(
      PILL,
      /^\.cta:not\(\[data-affordance='pick'\]\):not\(\[data-affordance='lighter'\]\) \.pill \{/m,
    );
    expect(dark).toContain('linear-gradient(180deg, #3d3b38, #1f1d1c)');
    expect(dark).toContain('rgba(255, 153, 71, 0.42)');
    expect(base).not.toContain('linear-gradient(180deg, #3d3b38, #1f1d1c)');
  });

  it('puts the 26 px Demo icon next to the word at a 12 px gap', () => {
    expect(PILL).toMatch(/<DemoGlyph[^>]*:size="26"/);
    expect(PILL).toMatch(/gap: 12px/);
    expect(PILL).toContain('class="word"');
  });
});

describe('the three strips are the Demo’s 342-wide diagrams', () => {
  it('draws the S3 wave at 342 × 30 with the two pulses and the dashed future', () => {
    const tag = artTag('wave');
    expect(tag).toContain('viewBox="0 0 342 30"');
    const body = PILL.slice(
      PILL.indexOf('class="art wave"'),
      PILL.indexOf('</svg>', PILL.indexOf('class="art wave"')),
    );
    expect(body).toContain('rgba(255,138,61,0.85)');
    expect(body).toContain('rgba(255,138,61,0.5)');
    expect(body).toContain('rgba(255,138,61,0.22)');
    expect(body).toMatch(/stroke-dasharray="3 7"/);
  });

  it('draws the S4 force bar at 342 × 12 from the shared constants', () => {
    expect(artTag('force')).toContain('viewBox="0 0 342 12"');
    const body = PILL.slice(
      PILL.indexOf('class="art force"'),
      PILL.indexOf('</svg>', PILL.indexOf('class="art force"')),
    );
    // The inks are the shared constants' own values, pinned here and in force-art.test.
    expect(FORCE_BAR.track.fill).toBe('rgba(255,255,255,0.05)');
    expect(FORCE_BAR.fill.colour).toBe('rgba(255,138,61,0.30)');
    expect(FORCE_BAR.crest.colour).toBe('rgba(255,217,160,0.55)');
    expect(body).toContain('FORCE_BAR.track.fill');
    expect(body).toContain('FORCE_BAR.fill.colour');
    expect(body).toContain('FORCE_BAR.crest.colour');
    expect(body).toContain(':width="fillWidth"');
  });

  it('draws the S5 ash diagram at 342 × 26 with the column, the arc and the mound', () => {
    expect(artTag('flick')).toContain('viewBox="0 0 342 26"');
    const body = PILL.slice(
      PILL.indexOf('class="art flick"'),
      PILL.indexOf('</svg>', PILL.indexOf('class="art flick"')),
    );
    expect(body).toContain('rgba(240,230,214,0.75)');
    expect(body).toMatch(/M84 8q10-10 20 0/);
    expect(body).toContain('rgba(207,198,188,0.18)');
    expect(body).toContain('rgba(207,198,188,0.7)');
    expect(body).toContain('rgba(207,198,188,0.55)');
  });
});

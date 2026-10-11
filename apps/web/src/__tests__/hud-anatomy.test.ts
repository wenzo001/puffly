/**
 * The head-up row's anatomy, which §2 of `SmokeRitual-UI-Demo.html` fixes for all five core-loop
 * screens and `SmokeRitual-SPEC.json` repeats in `uiConsistency.ringSpec.sizes` (页头 40×40):
 *
 *   one ring, wearing *that screen's own symbol* — never a number — and beside it only the figures
 *   that screen asks for: `4 02:14 78%` on 待机, `0.4s 78%` on 点燃, `6 / 12 3.2s` on 吸入, `62` on
 *   吐烟, `9mm 2.1g` on 磕灰.
 *
 * Structural rather than rendered for the usual reason in this folder: apps/web has no component
 * harness, and a source-level check sees every branch, including the ones a browser test would have
 * to unlock to reach.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockAfter, stripComments } from './sourceProbe';

const HUD = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');
const TOKENS = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

/** The body of the `reading` computed, up to the desk row that follows it. */
function readingBody(): string {
  const start = HUD.indexOf('const reading = computed');
  expect(start, 'HudBar lost the phase reading').toBeGreaterThan(-1);
  const end = HUD.indexOf('const desk = computed', start);
  expect(end, 'the reading runs to the end of the file').toBeGreaterThan(start);
  return HUD.slice(start, end);
}

/** Every `figures: [ … ]` list in source order, as one label per figure. */
function figureSets(): string[][] {
  const body = readingBody();
  return indicesOf(body, 'figures: [').map((at) => {
    const open = at + 'figures: ['.length;
    const close = matchingBracket(body, open - 1);
    // One label per *slot*: the 吸入 screen's second slot is a choice between two figures, and
    // counting the branches would report a row of three where the player sees two.
    return splitEntries(body.slice(open, close - 1)).map((entry) => {
      const keys = [...entry.matchAll(/'(a11y\.hud\.[a-zA-Z]+)'/g)].map((m) => m[1] ?? '');
      const shorthand = /^\s*(clock|remaining)\s*$/.exec(entry);
      if (shorthand?.[1] !== undefined) return keyOfShared(body, shorthand[1]);
      return keys[0] ?? entry.trim();
    });
  });
}

/** The copy key a shared figure (`const remaining: Figure = { … }`) actually carries. */
function keyOfShared(body: string, name: string): string {
  const at = body.indexOf(`const ${name}: Figure = {`);
  expect(at, `${name} is not a declared figure`).toBeGreaterThan(-1);
  const key = /key: '(a11y\.hud\.[a-zA-Z]+)'/.exec(body.slice(at, at + 200))?.[1];
  expect(key, `${name} carries no copy key`).toBeTypeOf('string');
  return key ?? '';
}

/** The items of an array literal, split at its own depth. */
function splitEntries(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      out.push(list.slice(start, index));
      start = index + 1;
    }
  }
  out.push(list.slice(start));
  return out.filter((entry) => entry.trim() !== '');
}

function indicesOf(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) out.push(at);
  return out;
}

/** The index just past the `]` that closes the bracket opened at `open`. */
function matchingBracket(hay: string, open: number): number {
  let depth = 0;
  for (let index = open; index < hay.length; index += 1) {
    if (hay[index] === '[') depth += 1;
    else if (hay[index] === ']' && --depth === 0) return index + 1;
  }
  throw new Error('unbalanced brackets in the reading');
}

describe('the ring is §2’s ring (页头 40×40)', () => {
  it('is a 40×40 box with a circle of radius 17, 106.81 units around', () => {
    expect(HUD).toContain('viewBox="0 0 40 40"');
    expect(HUD).toMatch(/<circle class="track" cx="20" cy="20" r="17" \/>/);
    expect(HUD).toMatch(/<circle\s+class="arc"\s+cx="20"\s+cy="20"\s+r="17"/);
    // 2π·17, which is what the Demo's own stroke-dasharray is measured against.
    expect(HUD).toMatch(/const CIRCUMFERENCE = 106\.81;/);
    expect(Math.PI * 2 * 17).toBeCloseTo(106.81, 1);
  });

  it('wears the screen’s symbol and never a number', () => {
    // Block to the ring’s own closing span: the over-limit v-if puts a nested `</span>` ahead of it.
    const start = HUD.indexOf('<span class="ring"');
    let depth = 0;
    let end = -1;
    for (let i = start; i < HUD.length; i += 1) {
      if (HUD.startsWith('<span', i)) depth += 1;
      if (HUD.startsWith('</span>', i)) depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    const ring = HUD.slice(start, end);
    expect(ring).toContain('reading.glyph');
    // The digits that used to sit here are the Demo's S1 `4` and S4 `62`, and both moved to the row.
    expect(ring).not.toContain('digits');
    expect(ring).not.toContain('reading.value');
  });

  it('keeps the track at the 22% the Demo says a player needs to see the whole break', () => {
    // The rule alone, cut by braces. A fixed-length window from the selector ran on into `.arc`,
    // which also declares `stroke-width: 3`, so deleting the track's own stroke width stayed green.
    const track = blockAfter(stripComments(HUD), /\.track \{/);
    expect(track).toMatch(/var\(--soft-white\) 22%, transparent/);
    expect(track).toMatch(/stroke-width: 3;/);
  });
});

describe('each screen shows only its own figures (§2 五屏)', () => {
  it('待机 three, 点燃 two, 吸入 two, 吐烟 one, 磕灰 two', () => {
    const sizes = figureSets().map((set) => set.length);
    // [ no state, LIGHTING, 待机, 吐烟, 吸入, 磕灰, 用完 ] — the five screens plus the two edges
    // that share a shape with them.
    expect(sizes).toEqual([1, 2, 3, 1, 2, 2, 1]);
  });

  it('the 待机 row is the Demo’s `4 02:14 78%`, in that order', () => {
    const sticks = figureSets().find((set) => set.includes('a11y.hud.sticks'));
    expect(sticks).toEqual(['a11y.hud.sticks', 'a11y.hud.burned', 'a11y.hud.remaining']);
  });

  it('the 吐烟 row is the force alone — a second number competes with 「这一口抽了多久」', () => {
    const exhale = figureSets().find((set) => set.includes('a11y.hud.force'));
    expect(exhale).toEqual(['a11y.hud.force']);
  });

  it('the 磕灰 row keeps the column and the tray’s own grams', () => {
    const tray = figureSets().find((set) => set.includes('a11y.hud.trayMass'));
    expect(tray).toEqual(['a11y.hud.ash', 'a11y.hud.trayMass']);
  });

  it('the last figure is the accented one, in the Demo’s ember-soft', () => {
    // §1: --ember-soft #FFB273 is 次级强调：高亮数字. Our token carries the same role, so the same
    // value — one token, one meaning.
    expect(TOKENS).toMatch(/--ember-core: #ffb273;/);
    expect(HUD).toMatch(/\.alt \{\s*color: var\(--ember-core\);/);
    const body = readingBody();
    expect(body).toMatch(/accent: true,\n\s+};/);
  });

  it('interpolates the figures in the template’s own language', () => {
    const at = HUD.indexOf('<template v-for="figure');
    expect(at, 'the figures are not rendered from a list').toBeGreaterThan(-1);
    const markup = HUD.slice(at, HUD.indexOf('</template>', at));
    expect(markup).toContain('{{ figure.value }}');
    // A `${…}` in a template is a JavaScript template literal Vue will paint as literal text — the
    // exact fault this guard was written for, and one every structural assertion above would sail
    // straight past.
    expect(markup).not.toContain('${');
  });
});

describe('the desk row stays on the desk (拍板 ②)', () => {
  it('the phone never carries the five, and the desk width never carries the pair twice', () => {
    expect(HUD).toMatch(/\.desk \{\s*display: none;/);
    const media = HUD.slice(HUD.indexOf('@media (min-width: 860px)'));
    expect(media).toMatch(/\.hud > \.num \{\s*display: none;/);
  });
});

/**
 * 稿子 S19：「所有数字字号不低于 15，白字对深底按 WCAG AA 起做」—— the size half is
 * `font-floor.test.ts`; this file is the contrast half, and it is derived rather than transcribed.
 *
 * Why it exists: `global.css` already *says* in a comment that the design's own 次级 `#7E746A`
 * measures 4.3:1 and was therefore replaced by `--smoke-gray` for text. A comment about a number is
 * not a guard for it — the next token edit can cross that line in one keystroke, and the file holds
 * three tokens (warm-gray 4.33, ash-gray 4.89, cool-blue 12.40) whose only difference is what they
 * are used for. So the first case below asks the shell what it actually paints as text, and the
 * second requires each of those colours to clear AA on the surface it is declared on.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '@puffly/shared';
import type { Rgb } from '@puffly/shared';

const CSS_URL = '../global.css';

/** The `:root` block, read from the shipped file so there is no second copy of the palette. */
const TOKENS = (() => {
  const css = readFileSync(new URL(CSS_URL, import.meta.url), 'utf8');
  const start = css.indexOf(':root');
  const block = css.slice(start, css.indexOf('\n}', start));
  const map = new Map<string, string>();
  // `[a-z0-9-]` and not `[a-z-]`: the design names two of its tokens by number (`--text-2`,
  // `--text-3`), and a scanner that cannot see a token is a scanner that cannot judge it.
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    map.set(String(match[1]), String(match[2]).toLowerCase());
  }
  return map;
})();

function token(name: string): Rgb {
  const hex = TOKENS.get(name);
  if (hex === undefined) throw new Error(`${name} is not a hex token in :root`);
  return hexToRgb(hex);
}

const srgb = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb: Rgb): number =>
  0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
const contrast = (a: Rgb, b: Rgb): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Every colour the shell paints as text, with the surface that rule puts it on. `var(--x)` names are
 * matched against what the scanner finds, so adding a text colour without adding it here reddens.
 */
const PAIRS: readonly { colour: string; on: string; text: Rgb; surface: Rgb }[] = [
  {
    colour: 'var(--soft-white)',
    on: 'the app floor',
    text: token('--soft-white'),
    surface: token('--deep-charcoal'),
  },
  {
    colour: 'var(--smoke-gray)',
    on: 'the app floor',
    text: token('--smoke-gray'),
    surface: token('--deep-charcoal'),
  },
  {
    colour: 'var(--ember-core)',
    on: 'the app floor',
    text: token('--ember-core'),
    surface: token('--deep-charcoal'),
  },
  {
    colour: 'var(--ember-orange)',
    on: 'the app floor',
    text: token('--ember-orange'),
    surface: token('--deep-charcoal'),
  },
  {
    colour: 'var(--alert-ember)',
    on: 'the sheet floor',
    text: token('--alert-ember'),
    surface: token('--deep-charcoal'),
  },
  /**
   * The two gradients the Demo paints words on are horizontal or vertical, and the words are centred
   * on them, so the surface a reader actually sees is the midpoint. Judged at the extreme stop instead
   * the pair would be measuring a pixel no letter ever occupies — and the number there is on record
   * either way: `--on-ember` on `--grad-nav`'s #D94D1A end is 4.18, under the bar, which is a fact
   * about that gradient's far edge and not about this label.
   */
  {
    // §1's `--on-ember` on §1's `--grad-start` (#FF8533 → #DE5719), mid: #EF6E26.
    colour: '#2a1408',
    on: 'the middle of the start gradient',
    text: hexToRgb('#2a1408'),
    surface: hexToRgb('#ef6e26'),
  },
  {
    // The lit tab sits on `--grad-nav` (#FF8033 → #D94D1A), mid: #EC6727 — a different gradient from
    // the pill's, so it is judged on its own even though the ink is the same name.
    colour: '#2a1408',
    on: 'the middle of the nav gradient',
    text: hexToRgb('#2a1408'),
    surface: hexToRgb('#ec6727'),
  },
  {
    colour: 'var(--text-2)',
    on: 'the app floor',
    text: token('--text-2'),
    surface: token('--deep-charcoal'),
  },
  {
    // §1's `.btn.cont` ink, the light text on the continue gradient (S3 吐烟, S4 收烟, S5 磕灰). For
    // light ink the worst stop is the gradient's *lightest* end, #3D3B38.
    colour: '#e4dcd2',
    on: 'the lightest stop of the continue gradient',
    text: hexToRgb('#e4dcd2'),
    surface: hexToRgb('#3d3b38'),
  },
  {
    // The declared 次级色, and the one place it is allowed to carry words: 「还没有」 in the 图鉴 and in
    // the achievement ladder. It is here because the shell used to express "not yet" by dimming whole
    // cells with `opacity`, which takes a 16.99 name down to 4.02 and a 11.59 name to 1.98 — measured,
    // and under the bar. A colour the guard can judge beats an opacity nobody judged.
    colour: 'var(--ash-gray)',
    on: 'the sheet floor',
    text: token('--ash-gray'),
    surface: token('--deep-charcoal'),
  },
];

/** Every `color:` value in the shell, comments stripped, the way the other scanner guards do it. */
function paintedText(): Set<string> {
  const components = readdirSync(new URL('../../components', import.meta.url)).filter((name) =>
    name.endsWith('.vue'),
  );
  const sources = [CSS_URL, ...components.map((name) => `../../components/${name}`)];
  const found = new Set<string>();
  for (const source of sources) {
    const text = readFileSync(new URL(source, import.meta.url), 'utf8').replace(
      /\/\*[\S\s]*?\*\//g,
      ' ',
    );
    // `[^-\w]` keeps `border-color`, `background-color` and `-webkit-text-fill-color` out: this is
    // about the colour of the letters, not the colour of the box around them.
    for (const match of text.matchAll(/(?:^|[^-\w])color:\s*([^;]+)/g)) {
      const value = String(match[1]).trim().toLowerCase();
      if (value === '' || ['inherit', 'currentcolor', 'transparent'].includes(value)) continue;
      found.add(value);
    }
  }
  return found;
}

describe('the shell paints its words in colours that clear AA (S19)', () => {
  it('has judged every colour it uses for text', () => {
    const judged = new Set(PAIRS.map((pair) => pair.colour));
    const unjudged = [...paintedText()].filter((colour) => !judged.has(colour));
    expect(unjudged, `no pair declared for ${unjudged.join(', ')}`).toEqual([]);
  });

  it('clears 4.5:1 on the surface each one is declared on', () => {
    const lines: string[] = [];
    for (const pair of PAIRS) {
      const ratio = contrast(pair.text, pair.surface);
      lines.push(`${pair.colour} on ${pair.on} = ${ratio.toFixed(2)}`);
      expect(ratio, `${pair.colour} on ${pair.on}`).toBeGreaterThanOrEqual(4.5);
    }
    console.log(`AA ${lines.join(' | ')}`);
  });

  it('keeps the token the design itself measured under AA off the words', () => {
    // `global.css` says 次级 #7E746A is 4.3:1 on the floor and so may not paint 15px labels. This
    // reproduces that number from the shipped token instead of trusting the sentence, and pins the
    // usage rule: the token stays where a 4.3 contrast is legal, which is a hairline.
    const warm = contrast(token('--warm-gray'), token('--deep-charcoal'));
    expect(warm, 'the comment in global.css no longer matches the token').toBeLessThan(4.5);
    expect(warm.toFixed(1)).toBe('4.3');
    expect([...paintedText()]).not.toContain('var(--warm-gray)');
  });
});

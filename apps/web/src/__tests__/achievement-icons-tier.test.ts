/**
 * What the ladder puts on screen *without a word* — the column the block has to be complete in.
 *
 * §9's third tier is not a degraded mode, it is the tier the product is designed around: in `∅` every
 * `t()` returns null and only the digits, the marks and the `aria-label`s are left. A progress figure
 * that only makes sense next to a word is therefore not finished, and that is the rule this file
 * enforces as a *column*: for each row of the block, which of its four parts survives with no words
 * at all. It is written as a table so a part that quietly becomes a word — and a state that quietly
 * becomes a word — is a red line naming the column it fell out of, rather than a screenshot somebody
 * has to squint at.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createI18n } from '../i18n';
import { renderBlock, type PartName } from '../achievement-ladder';

const SHEET = readFileSync(new URL('../components/SessionSheet.vue', import.meta.url), 'utf8');
const STYLE = SHEET.slice(SHEET.indexOf('<style scoped>'));

/** The four things a rung row is made of, and whether each one is a word. */
const PARTS: readonly { part: PartName; word: boolean }[] = [
  { part: 'name', word: true },
  { part: 'track', word: false },
  { part: 'value', word: false },
  { part: 'unit', word: true },
  { part: 'met', word: false },
  { part: 'state', word: true },
];

describe('the block is complete with no words on screen', () => {
  it('keeps every non-word part in the icons tier and drops only the words', () => {
    const en = renderBlock('en');
    const icons = renderBlock('icons');
    for (const { part, word } of PARTS) {
      expect(en.parts[part].length, `en lost its ${part}`).toBeGreaterThan(0);
      if (word) {
        expect(icons.parts[part].length, `${part} is a word but survived ∅`).toBe(0);
      } else {
        expect(icons.parts[part].length, `${part} is not a word but ∅ lost it`).toBe(
          en.parts[part].length,
        );
      }
    }
    // The row itself is never dropped, whatever the language: dropping it is how a player in ∅ loses
    // a whole axis, which is the bug this file exists for.
    expect(icons.rows).toBe(en.rows);
    expect(icons.rows).toBe(4);
  });

  it('keeps the two states in ∅, where a word cannot carry them', () => {
    // met  → the bar is full
    // unlit → the bar is short, and the track is still drawn
    // The state is a *width*, so it is the one channel that needs no legend in any language.
    const unlit = renderBlock('icons', { puffs: 0 });
    const halfway = renderBlock('icons', { puffs: 75 });
    expect(unlit.parts.track.length).toBe(halfway.parts.track.length);
    expect(unlit.parts.track[1]).not.toEqual(halfway.parts.track[1]);
    console.log(`LADDER-ICONS half=${JSON.stringify(halfway.parts.track)}`);
    expect(halfway.parts.track[1]).toContain('scaleX(0.5)');
    expect(unlit.parts.track[1]).toContain('scaleX(0)');
    // A full bar is the *top* of a rung, which is the one moment before the row moves on to the next
    // one — 149 of the first 150 口 draws a bar at 0.993, and it is the width, not a word, that says
    // "nearly there". One more draw is not a fuller bar: it is the row showing the rung after it.
    const nearly = renderBlock('icons', { puffs: 149 });
    expect(nearly.parts.track[1]).toContain('scaleX(0.9933333333333333)');
    const crossed = renderBlock('icons', { puffs: 150 });
    expect(crossed.parts.track[1]).toContain('scaleX(0.5)');
    expect(crossed.parts.met[1]).toBe('1/5');
    expect(unlit.parts.met[1]).toBe('0/5');
    console.log(
      `LADDER-ICONS rows=${String(unlit.rows)} track=${JSON.stringify(unlit.parts.track)} nearly=${JSON.stringify(nearly.parts.track)}`,
    );
  });

  it('says the state a second time, as colour, for the rows a bar cannot carry', () => {
    // A moment rung has no progress to draw — it happened or it did not — so its two states are the
    // fill and the amber digits. Both are declared colours that `text-contrast.test.ts` can measure,
    // and neither is an opacity: a dimmed cell is what `not-yet-look.test.ts` forbids by name.
    expect(STYLE).toMatch(
      /\.line\[data-reached='true'\]\s+\.count\s*\{\s*color:\s*var\(--ember-core\)/,
    );
    expect(STYLE).toMatch(
      /\.line\.moment:not\(\[data-reached='true'\]\)\s+\.name\s*\{\s*color:\s*var\(--ash-gray\)/,
    );
    // The moment row's own track is the core's ratio: 0 or 1, never a fraction of a gust.
    const moment = renderBlock('icons');
    expect(moment.parts.track.filter((fill) => fill === 'scaleX(1)').length).toBe(0);
  });

  it('is not silent to a screen reader in any tier', () => {
    // The visual channel is digits and widths; the spoken one is the group's own name, which never
    // falls to nothing (`copy.say`). A check against a *word* would pass in one language and fail in
    // the next — this checks the call, which is the thing the sheet actually makes.
    for (const locale of ['en', 'zh-CN', 'ar', 'icons'] as const) {
      expect(createI18n(locale).say('ach.title').length, `${locale} is silent`).toBeGreaterThan(0);
    }
    expect(SHEET).toContain(':aria-label="copy.say(\'ach.title\')"');
  });
});

/** A sanity check that the harness above is really rendering rows, so its columns cannot pass empty. */
describe('the column table has something to read', () => {
  it('renders figures, and figures that differ between two ledgers', () => {
    const zero = renderBlock('en', { puffs: 0 });
    const some = renderBlock('en', { puffs: 75 });
    expect(zero.parts.value.join(' ')).not.toEqual(some.parts.value.join(' '));
    // The icons column is not seven empty strings: the value and the met-count are still there.
    for (const locale of ['en', 'icons'] as const) {
      const block = renderBlock(locale);
      expect(
        block.parts.value.every((text) => text.trim().length > 0),
        locale,
      ).toBe(true);
      expect(
        block.parts.met.every((text) => text.trim().length > 0),
        locale,
      ).toBe(true);
    }
  });
});

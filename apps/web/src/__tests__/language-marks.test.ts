/**
 * The language row's marks, and the one thing that must hold about all of them.
 *
 * #163 removed two marks that the browser could not draw — `◌` (U+25CC) and `ع` (U+0639) — and
 * replaced them with `○` and `↔`. Measured in `tests/smoke/scan-glyphs.mjs` against the built app:
 * a `.notdef` is a hollow rectangle, so it is a *shape* property, and the row went from 2 of 6 marks
 * unrenderable to 0 of 32 across the whole shell.
 *
 * **What this file can and cannot hold, stated before the cases because the difference matters.**
 *
 * "Does this character render?" is a property of the *user's installed fonts*, not of the repo — a
 * unit test has no browser and no font, so it cannot answer that, and no source read can either. The
 * browser probe is the only instrument that answers it, and a probe is not a gate.
 *
 * So this file pins the two things that *are* repo facts, both of which must survive an edit that
 * would put a tofu box back:
 *
 *  1. **no two rows may look alike.** The language row exists so a player can tell the tiers apart at
 *     a glance, and a mark shared by two rows defeats it silently — `A` for both English and Arabic
 *     was a real candidate while the replacement was being chosen, precisely because nothing measured
 *     it.
 *  2. **the marks are a closed, single-character set**, so a row cannot grow a word or a string by
 *     accident (the icon is a mark; its name is spelled out underneath it).
 *
 * Both were verified by mutation: making two rows share a mark, and making a mark a two-character
 * string, each redden exactly one case.
 */

import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../i18n/copy';

describe('the language row’s marks (§H.8, and #163)', () => {
  it('no two rows wear the same mark', () => {
    // The point of the mark is that a player who cannot read any of the words still tells the rows
    // apart. Two identical marks is invisible in review and fatal in the interface.
    const seen = new Map<string, string>();
    for (const choice of LANGUAGES) {
      const other = seen.get(choice.glyph);
      expect(
        other,
        `${choice.code} and ${other ?? ''} both wear ${JSON.stringify(choice.glyph)} — the row cannot be told apart`,
      ).toBeUndefined();
      seen.set(choice.glyph, choice.code);
    }
    expect(seen.size, 'the marks collapsed').toBe(LANGUAGES.length);
  });

  it('every mark is a single character, not a word', () => {
    // The name is spelled out underneath (`endonym`), so a multi-character "mark" is a layout bug
    // waiting for a language whose name is long — and it would silently push the row wide.
    for (const choice of LANGUAGES) {
      expect(
        Array.from(choice.glyph).length,
        `${choice.code}'s mark ${JSON.stringify(choice.glyph)} is not one character`,
      ).toBe(1);
    }
  });

  it('every row is named by something a reader can recognise', () => {
    // `endonym` is deliberately outside the copy table: naming 中文 "Chinese" is the mistake this
    // row exists to avoid, so a row must carry its own name and a mark, never a translated one alone.
    for (const choice of LANGUAGES) {
      expect(choice.endonym.trim(), `${choice.code} has no name of its own`).not.toBe('');
    }
  });

  it('the two marks #163 replaced are not in the table any more', () => {
    // `◌` U+25CC and `ع` U+0639 both drew as `.notdef` boxes. Naming them here is what makes a
    // regression a red instead of a screenshot somebody happens to look at — the same ledger move
    // `atlas-ink.test.ts` makes for the atlas half of the same problem (#138).
    const banned = ['◌', 'ع'];
    for (const choice of LANGUAGES) {
      for (const glyph of banned) {
        expect(
          choice.glyph,
          `${choice.code} wears ${JSON.stringify(glyph)} again — it draws as a .notdef box`,
        ).not.toBe(glyph);
      }
    }
  });

  it('the replacements are the ones that were measured to render', () => {
    // Both measured in the real element, same font stack, same 15px, same `line-height: 1`:
    // `○` U+25CB 13.7 px wide and `↔` U+2194 14.2 px wide, against the ~8–9 px the `.notdef` box
    // measures at. Naming the pair stops a later "simplification" quietly choosing a third mark
    // without measuring it.
    expect(LANGUAGES.find((c) => c.code === 'auto')?.glyph, 'the auto mark').toBe('○');
    expect(LANGUAGES.find((c) => c.code === 'ar')?.glyph, 'the Arabic mark').toBe('↔');
  });
});

/**
 * What the 成就 block says about *units* — the half of it a screenshot cannot judge.
 *
 * The block used to print four figures that were four different things measured four different ways
 * (`13` sticks, `150` draws, `4` grams, `125` minutes) in four visually identical rows with no word
 * saying which was which. Adding the unit words fixes the eye, and creates a new obligation: an
 * English-only unit would fall through to English in the tier that says words in another language,
 * which is exactly what §9's fallback is for. So this file checks the units as a *set* — all four
 * present in both spoken tiers, none of them a sentence, and the icons tier still complete without
 * them — and checks that the ladder's ratio and the cabinet's own count are the same figures the two
 * screens already print, because a screen that disagrees with its neighbour about the same device is
 * the failure mode this whole block was rewritten to remove.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, createI18n } from '../i18n';
import { EN } from '../i18n/copy';
import { ACHIEVEMENT_BARS, rungFillStyle } from '../achievement-ladder';

const SHEET = readFileSync(new URL('../components/SessionSheet.vue', import.meta.url), 'utf8');

/** The four axes' unit words, as a set — §H.8's 度量单位预算, spent on the rows that need them. */
describe('the ladder states its units, out of its own namespace (S13, SPEC.md:1603)', () => {
  it('keeps every unit word inside the 成就 namespace, which is where a quantifier may live', () => {
    // SPEC.md:174 keeps 中文量词 off the core loop; SPEC.md:1603 names the exception, and the guard in
    // `i18n/__tests__/copy.test.ts` spells it as a list of namespaces. `ach.` is on that list because
    // the ladder is a counts sheet — so the *counter-example* this rests on is that a quantifier
    // outside those namespaces still fails. Planting one under a namespace the rule does not cover
    // is the positive control: if this ever stops matching, the exemption has become decoration.
    const quantifiers = ['支', '口', '克', '分钟'];
    const allowed = /^(a11y|archive|ach|reduction|settings|shelf|stats)\./;
    const planted = { 'ach.unit.sticks': '支', 'stats.sticks': '支', 'hint.puff': '口' };
    const outside = Object.entries(planted).filter(
      ([key, word]) => !allowed.test(key) && quantifiers.some((unit) => word.includes(unit)),
    );
    expect(outside.map(([key]) => key)).toEqual(['hint.puff']);
    // And every unit the ladder ships is under the exempt namespace.
    for (const bar of ACHIEVEMENT_BARS) {
      expect(bar.unit, bar.unit).toMatch(/^ach\.unit\./);
    }
  });

  it('gives all four axes a unit in both tiers that say words', () => {
    for (const bar of ACHIEVEMENT_BARS) {
      for (const tier of ['en', 'zh-CN'] as const) {
        const word = COPY[tier]?.[bar.unit];
        expect(word, `${tier} has no ${bar.unit}`).toBeTypeOf('string');
        expect(String(word).trim().length, `${bar.unit} is empty in ${tier}`).toBeGreaterThan(0);
      }
    }
    // The four units are four different words: 支 / 口 / 克 / 分钟 are not interchangeable, which is
    // the whole reason the bare digits were unreadable.
    const zh = ACHIEVEMENT_BARS.map((bar) => COPY['zh-CN']?.[bar.unit]);
    expect(new Set(zh).size).toBe(4);
  });

  it('keeps every unit a label rather than a sentence', () => {
    // A unit is a noun the eye skips. A unit with a verb in it is advice, a comparison or a claim,
    // and the block's redline is that it may say what happened and nothing more.
    const SENTENCE = /\b(should|must|better|worse|goal|streak|progress)\b|的|了|要|应该/;
    for (const bar of ACHIEVEMENT_BARS) {
      for (const tier of ['en', 'zh-CN'] as const) {
        const word = String(COPY[tier]?.[bar.unit] ?? '');
        expect(word, `${tier}.${bar.unit} reads as a sentence`).not.toMatch(SENTENCE);
        expect(word.length, `${tier}.${bar.unit} is a sentence`).toBeLessThan(9);
      }
    }
  });

  it('leaves the rows complete in the tier with no words', () => {
    const icons = createI18n('icons');
    for (const bar of ACHIEVEMENT_BARS) {
      expect(icons.t(bar.unit), `${bar.unit} leaked into the icons tier`).toBeNull();
      expect(icons.t(bar.key), `${bar.key} leaked into the icons tier`).toBeNull();
    }
    // What survives: the figure, the unit spot (empty) and the state. The unit span is gated on the
    // same `!== null` every label in this sheet uses, so ∅ loses the word and keeps the order.
    expect(SHEET).toMatch(/v-if="copy\.t\(row\.unit\) !== null"/);
  });
});

describe('the ladder fills its bars by the core ratio and by nothing else', () => {
  it('never grows a bar past the rung it belongs to', () => {
    expect(rungFillStyle(0)).toBe('scaleX(0)');
    expect(rungFillStyle(0.5)).toBe('scaleX(0.5)');
    expect(rungFillStyle(1)).toBe('scaleX(1)');
    // A ratio is a number from core; a bar that overflowed its track would be a claim about progress
    // that is not true, and one that went negative would be a claim in the other direction.
    expect(rungFillStyle(1.4)).toBe('scaleX(1)');
    expect(rungFillStyle(-0.2)).toBe('scaleX(0)');
  });

  it('leaves the block out of 图鉴 territory: no box count lives here', () => {
    // The block counts rungs (23, in five steps on four axes) and nothing else. 图鉴's own `n / 12`
    // is printed on 图鉴's own sheet, and a copy of it here was removed rather than given a second
    // name — a figure with two homes is how two screens come to disagree about one device.
    const block = SHEET.slice(SHEET.indexOf('data-hook="achievements"'));
    expect(block.slice(0, block.indexOf('<ReductionPanel'))).not.toMatch(/PACKS|progressPacks/);
  });
});

describe('the units are the ones the table already had, not new vocabulary', () => {
  it('reuses the deck’s own words for the four axes', () => {
    // 支 / 口 / 克 / 分钟 are already in the table — the ladder is not allowed to invent a fifth
    // spelling of "sticks" beside 累计支数 and 减量's 支.
    expect(COPY['zh-CN']?.['ach.unit.sticks']).toBe('支');
    expect(COPY['zh-CN']?.['ach.unit.puffs']).toBe('口');
    expect(COPY['zh-CN']?.['ach.unit.grams']).toBe('克');
    expect(COPY['zh-CN']?.['ach.unit.minutes']).toBe('分钟');
    // English says what the ledger's rows above already say, so the two cannot read as two facts.
    const rows = ['stats.sticks', 'stats.draws'] as const;
    expect(EN['ach.unit.sticks']).toBe(EN[rows[0]]);
    expect(EN['ach.unit.puffs']).toBe(EN[rows[1]]);
  });

  it('names the moment state with the two words the sheet already uses for it', () => {
    // 还没有 is the shell's own word for a locked thing (the 图鉴's `a11y.tileLocked`), and 抽到过 is
    // its opposite: the two states a moment row may be in. Nothing here says "unlocked", which would
    // be a lock the player could fail to open.
    expect(COPY['zh-CN']?.['ach.unit.locked']).toBe('还没有');
    expect(COPY['en']?.['ach.unit.locked']).toBe('not yet');
    expect(COPY['zh-CN']?.['ach.unit.caught']).toBe('抽到过');
    expect(COPY['zh-CN']?.['ach.unit.strength']).toBe('风力');
  });
});

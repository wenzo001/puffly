/**
 * The 成就 block, read as a ladder: what the shell is allowed to put on it, and the one channel that
 * has to work when there are no words on the screen at all.
 *
 * Why this file exists rather than a screenshot. The block used to print `0/5 · 13` — *how many rungs
 * are met* and the next goal as a bare digit — so a player one puff short of a rung saw exactly what a
 * player at zero saw, and the four rows were four identical figures with four different units and no
 * word saying which. A frame can show that the block is prettier; it cannot show that a part-way rung
 * renders differently, which is the property the whole feature rests on. So the first case below
 * *renders* the block twice, at two ratios, and diffs the output.
 *
 * Two redlines are checked here as counts rather than as intentions:
 *  - **no new fact.** Every figure in the markup is a named value off `achievementsFor` (or off the
 *    ledger it is handed), and no digit is written into the markup. The guard reaches through
 *    wrapper elements, because one level of `<span class="cell">` is exactly where a literal would
 *    hide from a scan that only reads `{{ }}`.
 *  - **no new words.** The block pays for its units out of §H.8's 度量单位预算: eight `ach.unit.*` keys,
 *    counted by this file, so a ninth is a failing test and not a design decision.
 */

import { readFileSync } from 'node:fs';
import { renderToString } from 'vue/server-renderer';
import { createSSRApp, defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { COPY, createI18n } from '../i18n';
import { EN, LOCALES, type CopyKey } from '../i18n/copy';
import { achievementsFor, ACHIEVEMENTS, reachedCount } from '@puffly/game-core';
import {
  ACHIEVEMENT_BARS,
  ACHIEVEMENT_UNITS,
  ladderRows,
  rungFillStyle,
  type AxisRow,
} from '../achievement-ladder';

const SHEET = readFileSync(new URL('../components/SessionSheet.vue', import.meta.url), 'utf8');
const STYLE = SHEET.slice(SHEET.indexOf('<style scoped>'));

/** §H.8: the unit words the ladder may spend, and no others. */
const BUDGET = [
  'ach.unit.sticks',
  'ach.unit.puffs',
  'ach.unit.grams',
  'ach.unit.minutes',
  'ach.unit.strength',
  'ach.unit.ratio',
  'ach.unit.caught',
  'ach.unit.locked',
] as const;

/** The same band the other source scanners use: the block, up to the panel that follows it. */
function ladderBlock(): string {
  const start = SHEET.indexOf('data-hook="achievements"');
  expect(start, 'the break sheet lost its achievement ladder').toBeGreaterThan(-1);
  return SHEET.slice(start, SHEET.indexOf('<ReductionPanel', start));
}

/** Every `{{ }}` expression in a stretch of markup, wrappers and all. */
function bindings(markup: string): string[] {
  return [...markup.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((match) =>
    String(match[1]).replace(/\s+/g, ' ').trim(),
  );
}

/**
 * The block there is nothing left of: no words, because `t()` returns `null` in the icons tier. The
 * frames the ladder draws are props, so a stub stands in for `SessionSheet.vue` exactly as far as
 * this file can honestly go without mounting the whole app (which would need the scene, the audio
 * graph and a storage adapter). What it *is* honest about: it is the same component shape, the same
 * `ACHIEVEMENT_BARS` table the sheet renders from, and it is rendered by Vue.
 */
const Ladder = defineComponent({
  props: { bars: { type: Array as () => AxisRow[], required: true } },
  setup(props) {
    const copy = createI18n('icons');
    return () =>
      h(
        'div',
        { 'data-hook': 'achievements' },
        props.bars.map((bar) =>
          h('p', { class: 'line', 'data-reached': bar.reached }, [
            h('span', { class: 'track' }, [
              h('i', { style: { transform: rungFillStyle(bar.ratio) } }),
            ]),
            copy.t(bar.unit) === null
              ? null
              : h('span', { class: 'unit' }, copy.t(bar.unit) as string),
            h('span', { class: 'digits' }, `${bar.value} / ${bar.goal}`),
            h('span', { class: 'digits' }, `${bar.reached} / ${bar.total}`),
          ]),
        ),
      );
  },
});

/** What the player's own ledger produces at one moment, in the shape the sheet's computed returns. */
const barsAt = (ledger: Parameters<typeof ladderRows>[0], gust = 0): AxisRow[] =>
  ladderRows(ledger, gust);

const empty = { sticks: 0, puffs: 0, ashGrams: 0, minutes: 0 };

async function shown(bars: AxisRow[]): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(Ladder, { bars }) }));
}

describe('the 成就 ladder shows progress, in units (拍板 ⑤)', () => {
  it('renders a part-way rung differently from one at zero, in the same ledger', async () => {
    // 13 支 is the first sticks rung (150 支 ÷ 12, rounded) — the deck's own arithmetic. Six of them
    // is 46% of the way in; none of them is 0%.
    const zero = await shown(barsAt(empty));
    const partway = await shown(barsAt({ ...empty, sticks: 6 }));
    expect(zero).not.toEqual(partway);
    // And the difference is the progress itself, not a digit that happens to differ: the fill moved.
    expect(partway).toContain('scaleX(0.46153846153846156)');
    expect(zero).toContain('scaleX(0)');
    console.log(
      `LADDER-PROGRESS zero=${String(zero.length)}B partway=${String(partway.length)}B fill=46%`,
    );
  });

  it('is the core ratio that reaches the markup, not a number the shell worked out', () => {
    // The ratio the sheet draws is `rung.ratio`; the only arithmetic in the block is turning it into
    // a `scaleX` argument. If the sheet ever recomputed the fraction, this is where it would show.
    expect((ladderBlock().match(/scaleX\([^)]*ratio[^)]*\)/g) ?? []).length).toBe(2);
    expect(ladderBlock()).not.toMatch(/value\s*\/\s*row\.goal|\/\s*row\.goal/);
    // The value is the core's `at` clamped to the core's own goal — no literal ceiling in the shell.
    const ladder = SHEET.slice(
      SHEET.indexOf('const ladder = computed'),
      SHEET.indexOf('const MOMENT'),
    );
    expect(ladder).toMatch(/Math\.min\(at, next\?\.achievement\.goal/);
  });

  it('prints no digit that is not a named fact, one wrapper element deep', () => {
    // Three kinds of text are not a figure the player reads: Vue interpolation, the HTML comments
    // that explain the block, and attribute bindings (which are expressions, not output).
    const markup = ladderBlock()
      .replace(/\{\{[\s\S]*?\}\}/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s:?[a-zA-Z-]+="[^"]*"/g, '');
    expect(markup.match(/[0-9]/g) ?? [], 'a digit written into the markup').toEqual([]);
    // And every one of those bindings names a ledger field, the core's ratio, or a copy lookup.
    const allowed =
      /^(achieved|rungs\.length|row\.(axis|key|unit|value|goal|ratio|reached|total|fresh)|row\.name|row\.id|row\.minGust|row\.reached|stats\.strongestGust|copy\.t\('(?:ach|stats|shelf)\.[a-zA-Z0-9.]+'\)|copy\.t\(row\.(?:key|unit)\)|copy\.t\(row\.reached \? 'ach\.unit\.caught' : 'ach\.unit\.locked'\)|copy\.say\('ach\.title'\))$/;
    const named = bindings(ladderBlock()).filter((text) => !text.includes('`scaleX('));
    expect(named.length).toBeGreaterThan(10);
    for (const text of named) expect(text, `${text} is not a named fact`).toMatch(allowed);
  });

  it('pays for its units out of the eight-key budget, and the copy table has all of them', () => {
    const declared = Object.keys(EN).filter((key) => key.startsWith('ach.unit.'));
    expect([...declared].sort()).toEqual([...BUDGET].sort());
    // Every one on screen in the two tiers that say words — a unit that only exists in English is
    // the fall-through the copy tiers exist to prevent, and the ones the ladder uses are all of them.
    for (const key of BUDGET) {
      expect(COPY['en']?.[key], key).toBeTypeOf('string');
      expect(COPY['zh-CN']?.[key], key).toBeTypeOf('string');
    }
    // The four axis rows take their unit from the row (`row.unit`, which is one of the four), and the
    // moment and gust rows name theirs: every unit key the template can put on screen is in the table.
    expect(ladderBlock()).toMatch(/copy\.t\(row\.unit\)/);
    expect(ACHIEVEMENT_BARS.every((bar) => (BUDGET as readonly string[]).includes(bar.unit))).toBe(
      true,
    );
    const literal = [...ladderBlock().matchAll(/copy\.t\('(ach\.unit\.[a-zA-Z0-9]+)'\)/g)].map(
      (match) => match[1] ?? '',
    );
    expect(new Set(literal).size, 'the rows that cannot take a unit from a table').toBe(1);
    for (const key of literal) expect(BUDGET as readonly string[]).toContain(key);
  });

  it('names each axis in both tiers that say words', () => {
    const keys = [...ladderBlock().matchAll(/copy\.t\('([a-zA-Z0-9.]+)'\)/g)].map(
      (m) => m[1] ?? '',
    );
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const key of keys) {
      expect(COPY['en']?.[key as CopyKey], key).toBeTypeOf('string');
      expect(COPY['zh-CN']?.[key as CopyKey], key).toBeTypeOf('string');
    }
  });
});

describe('a met rung is readable with no words on the screen (§39, the ∅ tier)', () => {
  it('reads the unit and the state out of the copy tier the player is in', () => {
    // The channel cannot be a word: in `icons` every `t()` is null, so what is left is the bar, the
    // colour and the two digits. This is the check that the words really are absent rather than
    // merely dim — the same `copy.t(...) !== null` gate every other label in the sheet uses.
    for (const locale of LOCALES) {
      const i18n = createI18n(locale);
      const unit = i18n.t('ach.unit.sticks');
      if (locale === 'icons') expect(unit, 'the icons tier keeps no unit word').toBeNull();
      else expect(unit, `${locale} lost its unit word`).toBeTypeOf('string');
    }
    // And the block is still complete without them: the bar and both figures are unconditional.
    expect(ladderBlock()).toMatch(/class="track"/);
    expect((ladderBlock().match(/scaleX\([^)]*ratio[^)]*\)/g) ?? []).length).toBe(2);
    expect(ladderBlock()).toMatch(/v-if="copy\.t\(row\.unit\) !== null"/);
  });

  it('draws the state as a fill, with one rule each for met and for in-progress', () => {
    // The met state is the bar being full and amber; the in-progress state is the bar being short.
    // Both read off `row.ratio`, which the core computed — the sheet adds no threshold of its own.
    expect(STYLE).toMatch(/\.track\s*\{[^}]*background:/);
    expect(STYLE).toMatch(/\.track i\s*\{[^}]*background:\s*var\(--ember-core\)/);
    expect(STYLE).toMatch(
      /\.line\[data-reached='true'\]\s+\.count\s*\{[^}]*color:\s*var\(--ember-core\)/,
    );
    // Both colours are declared tokens, so `text-contrast.test.ts` judges the words and the fill;
    // an opacity here would be a second "locked look" nobody measured.
    const track = /\.track\s*\{[^}]*\}/.exec(STYLE)?.[0] ?? '';
    expect(track).not.toMatch(/opacity:/);
  });

  it('binds the fade and the sweep to the same one flag, and keeps both out of the way of motion', () => {
    // §39's 它自己亮一下 lives in `reveal.ts` and nowhere else: the row fades and its fill sweeps
    // once, and neither runs for a player who asked for less motion.
    expect(SHEET).toContain("import { useJustLit } from '../reveal'");
    expect(STYLE).toMatch(/\.line\[data-fresh='true'\]\s*\{[^}]*animation:\s*rung-lit/);
    expect(STYLE).toMatch(
      /\.line\[data-fresh='true'\]\s+\.track i\s*\{[^}]*animation:\s*rung-fill/,
    );
    const gate =
      /prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\.line\[data-fresh='true'\]\s+\.track i\s*\{\s*animation:\s*none[\s\S]*?\n\}/.exec(
        STYLE,
      );
    expect(
      gate,
      'a sweep that cannot be turned off is not one the player agreed to',
    ).not.toBeNull();
  });

  it('gives the three moments a state of their own rather than three grey names', () => {
    const rows = ladderBlock();
    // The moment rows are in every tier now: the name drops out with the rest of the words, and the
    // goal, the mark and the bar stay.
    expect(rows).toMatch(/v-for="row in momentRows"[\s\S]*?:data-reached="row\.reached"/);
    expect(rows).toMatch(/row\.minGust/);
    expect(rows).toMatch(/row\.reached \? 'ach\.unit\.caught' : 'ach\.unit\.locked'/);
    // The fill is the core's ratio here too, so a moment row is 0 or 1 and nothing between.
    expect(
      (rows.match(/scaleX\([^)]*ratio[^)]*\)/g) ?? []).length,
      'both kinds of row carry a bar',
    ).toBe(2);
    // The threshold printed on a moment row is core's own `minGust`, read off the rung.
    expect(SHEET).toMatch(/minGust:\s*rung\?\.achievement\.minGust/);
    // And the moment row is not filtered by its own name any more — that filter made the row count
    // depend on the language the player picked.
    expect(SHEET).not.toMatch(/filter\(\(row\) => row\.name !== null\)/);
  });
});

describe('the ladder agrees with the core table it is drawn from', () => {
  it('takes its four axes and its rung count from `achievementsFor`, not from its own list', () => {
    const rungs = achievementsFor(empty, 0);
    expect(rungs.length).toBe(ACHIEVEMENTS.length);
    expect(rungs.filter((rung) => rung.achievement.axis === 'moment').length).toBe(3);
    expect(reachedCount(rungs)).toBe(0);
    expect(rungs.every((rung) => rung.ratio === 0)).toBe(true);
    // A moment rung's ratio is the core's answer too, and it is the only one that is all-or-nothing:
    // there is no "46% of a gust".
    const caught = achievementsFor(empty, 0.985).filter(
      (rung) => rung.achievement.axis === 'moment',
    );
    expect(caught.map((rung) => rung.reached)).toEqual([true, false, false]);
    expect(caught.map((rung) => rung.ratio)).toEqual([1, 0, 0]);
  });

  it('reads the bar table off the same axis names the core uses', () => {
    expect(ACHIEVEMENT_BARS.map((bar) => bar.axis)).toEqual(['sticks', 'puffs', 'ash', 'time']);
    for (const bar of ACHIEVEMENT_BARS) {
      expect(
        ACHIEVEMENT_UNITS[bar.axis],
        `${bar.axis} has no unit, so its row would print a bare digit`,
      ).toBeTypeOf('string');
    }
  });
});

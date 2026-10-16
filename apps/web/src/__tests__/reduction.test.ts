/**
 * S20's stance, checked against the strings that ship rather than against prose: the reduction
 * page states the player's own counts and nothing else. No health claim, no threat, no penalty,
 * no fourth piece of advice (§ redlines.noAntiSmokingPressure, §10).
 */

import { readFileSync } from 'node:fs';

import { blockAfter, stripComments } from './sourceProbe';

import { describe, expect, it } from 'vitest';
import { COPY, translate } from '../i18n';
import { EN, type CopyKey } from '../i18n/copy';

const KEYS = Object.keys(EN) as CopyKey[];

/** Every word on the page the player reads when they are not smoking. */
const REDUCTION_KEYS = KEYS.filter(
  (key) =>
    key.startsWith('reduction.') || key.startsWith('a11y.reduction.') || key === 'settings.limit',
);

/** The lines a spoken locale actually shows for one key, in the locale the player would see them in. */
function linesFor(key: CopyKey): string[] {
  const out: string[] = [];
  for (const locale of Object.keys(COPY)) {
    const value = translate(locale, key);
    if (value !== null) out.push(`${locale} · ${key} → ${value}`);
  }
  return out;
}

/** The same lines with the locale tag stripped, so a scan reads only what a player reads. */
function valuesFor(key: CopyKey): string[] {
  return linesFor(key).map((line) => line.slice(line.indexOf('→') + 2).toLowerCase());
}

/**
 * Two families, both from the brief: an assertion about smoking and health, and a lever that
 * punishes or locks. The page is allowed to say "fewer" and "more" about the player's own week.
 */
const FORBIDDEN = [
  '健康',
  '肺',
  '癌',
  '疾病',
  '医生',
  '戒烟',
  '戒断',
  '危害',
  '好处',
  '改善',
  '风险',
  'health',
  'lung',
  'cancer',
  'disease',
  'doctor',
  'quit',
  'withdraw',
  'damage',
  'benefit',
  'risk',
  '惩罚',
  '处罚',
  '清零',
  '断签',
  '锁死',
  '锁定',
  '禁止',
  'penalty',
  'punish',
  'lock',
  'streak',
  'forbid',
];

/** The pressure verbs: this page may describe a count, it may not tell anyone what to do. */
const IMPERATIVE = /\b(should|must|have to|need to)\b/;

describe('the reduction page says nothing but the player log (S20, §10)', () => {
  it('the guard has strings to read, in both the anchor and the target language', () => {
    expect(REDUCTION_KEYS.length).toBeGreaterThan(8);
    for (const key of REDUCTION_KEYS) {
      expect(typeof COPY.en?.[key], key).toBe('string');
      expect(typeof COPY['zh-CN']?.[key], key).toBe('string');
    }
  });

  it('no line on the page asserts anything about health, and none threatens a penalty', () => {
    for (const key of REDUCTION_KEYS) {
      for (const value of valuesFor(key)) {
        for (const word of FORBIDDEN) {
          expect(value, `${key} → ${value}`).not.toContain(word);
        }
        expect(value, key).not.toMatch(IMPERATIVE);
      }
    }
  });

  it('the word list bites, so the pass above is not an empty scan', () => {
    const planted = '戒烟有益健康，肺的风险降低，否则连续记录清零';
    const hits = FORBIDDEN.filter((word) => planted.includes(word));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(IMPERATIVE.test('you should quit to protect your health')).toBe(true);
    // And it does not bite on the page's own vocabulary, which says "more" and "fewer".
    for (const key of REDUCTION_KEYS) {
      for (const value of valuesFor(key)) {
        expect(IMPERATIVE.test(value), `${key} → ${value}`).toBe(false);
      }
    }
  });

  it('the delta line only ever subtracts the player from the player', () => {
    for (const key of ['reduction.deltaMore', 'reduction.deltaFewer'] as CopyKey[]) {
      const lines = linesFor(key);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line, key).toContain('{count}');
        expect(line, key).toMatch(/week|周/);
      }
    }
  });

  it('the seven days carry the average the deck puts on the page (S20 日均)', () => {
    for (const key of ['reduction.average'] as CopyKey[]) {
      const lines = linesFor(key);
      expect(lines.length, key).toBeGreaterThan(1);
      for (const line of lines) {
        // The figure is interpolated, never typed: a page that wrote 14 would be a page that lied
        // about someone else's log.
        expect(line, key).toContain('{count}');
      }
    }
    // It fills, in both tiers that say words.
    expect(translate('zh-CN', 'reduction.average', { count: '1.7' })).toContain('1.7');
    expect(translate('en', 'reduction.average', { count: '1.7' })).toContain('1.7');
    // And the third tier has no sentence for it — which is why the component keeps the digit.
    expect(translate('icons', 'reduction.average', { count: '1.7' })).toBeNull();
  });

  it('the page reads the statistic instead of dividing a second time', () => {
    // The claim is the one §26 exists for: one derivation, many readers. A second division in the
    // component would round somewhere else from the bars beside it.
    const panel = readFileSync(
      new URL('../components/ReductionPanel.vue', import.meta.url),
      'utf8',
    );
    expect(panel).toContain('reduction.value.dailyAverage');
    expect(panel, 'the shell re-derived the average the statistics already gave').not.toMatch(
      /\/\s*7\b/,
    );
    // And it survives the tier with no words by falling back to the digit, not to nothing.
    expect(panel).toContain("copy.value.t('reduction.average', { count }) ?? count");
  });

  it('the alternatives stay the three the design names, so a fourth lecture cannot appear', () => {
    const alternatives = KEYS.filter((key) => key.startsWith('reduction.alt.'));
    expect(alternatives.sort()).toEqual([
      'reduction.alt.breathe',
      'reduction.alt.walk',
      'reduction.alt.water',
    ]);
  });

  it('counts a taken alternative instead of describing one (S23 按照计次)', () => {
    const panel = readFileSync(
      new URL('../components/ReductionPanel.vue', import.meta.url),
      'utf8',
    );
    // Three rows that a finger can act on, wired to the ledger rather than to a caption, each showing
    // the day's own count. A "row of advice" and a "row you can do" are the same markup until you
    // look for the handler, so that is what this looks for.
    const alts = panel.slice(
      panel.indexOf('<div class="alts">'),
      panel.indexOf('</div>', panel.indexOf('<div class="alts">')),
    );
    // Scoped to the rows themselves: the handler and the two data hooks are the whole difference
    // between a row you can act on and a caption that describes one, so they have to be *on* it.
    expect(alts).toContain('<button');
    expect(alts).toContain('@click="game.takeSubstitute(alt.id)"');
    expect(alts).toContain(':data-alt="alt.id"');
    expect(alts).toContain(':data-count="altCount(alt.id)"');
    expect(alts).not.toContain('<span v-for');
    // Named for a screen reader with both the action and the count, since the count is the part that
    // changes under a finger and the digits are `aria-hidden` decoration next to it.
    expect(panel).toContain("copy.say('a11y.alternative'");
    // And a control takes a finger: the pill was sized for a label, and that is no longer enough.
    // Read off `.alt`'s own rule body, not from the selector to the end of the file — the old window
    // was open-ended, so any later rule that declares a min-height would keep this green after the
    // row's own floor was deleted. `hud-anatomy.test.ts` documents the same defect from the other end.
    const altRule = blockAfter(stripComments(panel), /^\.alt \{/m);
    expect(altRule).toMatch(/min-height: *var\(--tap-target\)/);
  });
});

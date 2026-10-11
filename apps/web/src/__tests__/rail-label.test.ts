/**
 * The rail's caption must stay one line — SPEC.md §9.2, and the user's own report.
 *
 * 「在手机上移动端烟灰缸 3 个字换行了 我感觉这个文字有点过于大了」. The fix was one notch under
 * the reading floor plus `white-space: nowrap`; this file is what stops it from coming back. What
 * can be checked without a browser is checked exactly, and what cannot is named rather than
 * estimated: text advance needs a real font and a real layout, so the Latin tier is held to its
 * shipped character count instead of to a width computed from a made-up average.
 *
 * The Chinese tier is the one place arithmetic is honest: a CJK glyph is one em wide by definition,
 * so three of them at the shipped label size is a number, not a guess.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, LOCALES } from '../i18n/copy';

const CSS = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const RAIL = readFileSync(new URL('../components/TabRail.vue', import.meta.url), 'utf8');

const RAIL_KEYS = ['tab.light', 'tab.puff', 'tab.tray', 'tab.settings'] as const;

/** The `.tab` rule, taken as one block so a declaration elsewhere cannot stand in for it. */
function tabRule(): string {
  const rule = RAIL.match(/\.tab \{([^}]*)\}/)?.[1];
  if (!rule) throw new Error('no .tab rule in TabRail.vue');
  return rule;
}

/** One tier's caption for a rail key; '' where the tier is deliberately sparse. */
function caption(locale: string, key: string): string {
  const table = COPY[locale] as Record<string, string | undefined> | undefined;
  return table?.[key] ?? '';
}

/** SPEC.md §55's smallest measured stage. A caption wraps here before it wraps anywhere. */
const NARROWEST_STAGE = 320;

/** One number out of a rule, with the rule quoted back when it is missing — a silent 0 here would
 * turn the arithmetic below into a claim about nothing. */
function px(rule: string, name: string, pattern: RegExp): number {
  const value = Number(pattern.exec(rule)?.[1] ?? NaN);
  expect(value, `${name} is not a px number in the rail's CSS`).toBeGreaterThan(0);
  return value;
}

/** The width the capsule leaves each of the four tabs, at a given stage width. */
function tabShareAt(stageWidth: number): number {
  const rule = RAIL.slice(RAIL.indexOf('.rail {'), RAIL.indexOf('}', RAIL.indexOf('.rail {')));
  const outer = Math.min(
    stageWidth - px(rule, 'the capsule’s side margins', /width: calc\(100% - (\d+)px\)/),
    px(rule, 'the capsule’s cap', /max-width: (\d+)px/),
  );
  return (
    (outer -
      px(rule, 'the capsule’s border', /border: (\d+)px/) * 2 -
      px(rule, 'the capsule’s padding', /padding: (\d+)px/) * 2) /
    RAIL_KEYS.length
  );
}

/** What is left for the caption once a tab has taken its own padding. */
function tabContentAt(stageWidth: number): number {
  const padding = px(tabRule(), 'the tab’s padding', /padding: 0 (\d+)px/);
  return tabShareAt(stageWidth) - padding * 2;
}

function tokenNumber(name: string): number {
  const match = CSS.match(new RegExp(`${name}:\\s*calc\\((\\d+(?:\\.\\d+)?)px`));
  if (!match?.[1]) throw new Error(`${name} is not a calc(<number>px * …)`);
  return Number(match[1]);
}

describe('the rail label stays on one line (§9.2)', () => {
  it('forbids the wrap in the rule that draws the caption', () => {
    const rule = tabRule();
    expect(rule).toContain('white-space: nowrap');
    // The size has to come from the token; a literal px here is a second source that drifts.
    expect(rule).toContain('font-size: var(--label-size)');
  });

  it('keeps the caption one notch under the reading floor', () => {
    // 15px is the floor for text a player reads. The caption is not that; at 15px, 烟灰缸 wrapped.
    expect(tokenNumber('--label-size')).toBeLessThanOrEqual(13);
  });

  it('fits three full-width characters in the width a phone actually gives a tab', () => {
    const widestChinese = Math.max(...RAIL_KEYS.map((key) => caption('zh-CN', key).length));
    expect(widestChinese).toBe(3);
    // A CJK glyph is one em, so this is arithmetic rather than an estimate. It is now arithmetic
    // about the width the layout *gives* the tab, which it was not while the tab carried a
    // `min-width`: §2's `.item` is `flex: 1`, so the four share the capsule and the capsule is what
    // has a width. Measured at the narrowest stage, because that is where a caption wraps first.
    expect(widestChinese * tokenNumber('--label-size')).toBeLessThanOrEqual(
      tabContentAt(NARROWEST_STAGE),
    );
    expect(widestChinese * tokenNumber('--label-size')).toBeLessThanOrEqual(tabContentAt(390));
  });

  it('leaves every tab a target a thumb can hit at the narrowest stage', () => {
    // §1's 44×44 floor. `flex: 1` can shrink an item below its content, so the share each tab gets
    // is the number to check, and it is checked before the padding is taken off.
    expect(tabShareAt(NARROWEST_STAGE)).toBeGreaterThanOrEqual(44);
  });

  it('holds every tier to the labels it ships today', () => {
    expect(LOCALES).toContain('icons');
    for (const locale of ['en', 'zh-CN', 'ar'] as const) {
      for (const key of RAIL_KEYS) {
        const text = caption(locale, key);
        if (text === '') continue;
        // 'settings' is the longest thing down here in the anchor tier; growing a caption is a
        // decision, not an accident, so the count is pinned rather than left to fit.
        expect(text.length, `${locale}.${key} = ${text}`).toBeLessThanOrEqual(9);
        expect(text, `${locale}.${key} has a line break in it`).not.toMatch(/\s/);
      }
    }
  });
});

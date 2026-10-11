/**
 * S6's 写实度 row, checked as a control and as a wiring.
 *
 * Structural on purpose, the way `reverb-row.test.ts` reads the sheet: apps/web has no component
 * harness, so `sourceProbe`'s rule applies — these checks buy "the call exists, in the branch that
 * means it, and once", and nothing more. What the dial *does* to the picture is judged in
 * realism-purity.test.ts (in `game-core`), and what it must never do to the burn is
 * judged there too; this file is about the row being a row and about the shell handing the number to
 * the renderer at all.
 *
 * The two ways a settings row rots are specific: a control that writes a different setting than the
 * one it names, and a control whose value never leaves the sheet.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '@puffly/game-core';
import { COPY, type CopyKey } from '../i18n';
import { shellSource } from './sourceProbe';

const SHEET = readFileSync(new URL('../components/SettingsSheet.vue', import.meta.url), 'utf8');

/** The one row that owns the look, sliced out of the template. */
const row = (() => {
  const start = SHEET.indexOf('data-setting="realism"');
  expect(start, 'the settings sheet lost its 写实度 row').toBeGreaterThan(-1);
  return SHEET.slice(start, SHEET.indexOf('</div>', start));
})();

describe('the 写实度 row is a control and not a decoration (S6)', () => {
  it('writes the setting it claims to, and shows the one it read', () => {
    expect(row).toContain('realism: Number(');
    expect(row).toContain(':value="Math.round(settings.realism * 100)"');
    expect(row).toContain('class="digits"');
  });

  it('can actually be moved to the value the deck writes', () => {
    // The row's detents are the 档位 (S15 asks for levels read off tick marks, not more words), so a
    // default the track cannot land on is a default nobody can go back to. Read from the core rather
    // than restated: this compares the row's own `step` with the shipped `realism`.
    const step = Number(/step="(\d+)"/.exec(row)?.[1]);
    expect(step, 'the row is not a stepped track').toBeGreaterThan(0);
    const percent = createDefaultSettings().realism * 100;
    expect(percent % step, `${String(percent)} is not one of the row's stops`).toBe(0);
    // And the deck's own number is the deck's: 80 / 20 (S6).
    expect(percent).toBe(80);
  });

  it('names itself in a screen reader, in both tiers that say words', () => {
    const say = /copy\.say\('([^']+)'\)/.exec(row)?.[1];
    expect(say, 'an unnamed control is a broken control').toBeTruthy();
    for (const locale of ['en', 'zh-CN'] as const) {
      const value = COPY[locale]?.[say as CopyKey];
      expect(value, `${locale}:${say ?? ''}`).toBeTypeOf('string');
      expect(value?.trim(), `${locale}:${say ?? ''} is empty`).not.toBe('');
    }
  });

  it('has a label word in both tiers, gated so the icons tier keeps the control', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(COPY[locale]?.['settings.realism'], locale).toBeTypeOf('string');
    }
    expect(row).toContain("word('settings.realism') !== null");
  });

  it('reaches the renderer, not just the save file', () => {
    // The compiler is the real guard here — `RendererSettings.realism` is required, and the renderer
    // is built from this one function — so this is the tripwire for the wiring being *moved* out of
    // the family rather than broken in it. `setSettings`, the quality ladder and the first frame all
    // go through the same object, which is why a fifth field used to be applied by the loop and
    // forgotten by the resize.
    const settings = shellSource();
    // Prettier reflows a union across lines the moment it outgrows one, so the comparison strips
    // whitespace: this guard is about the wiring carrying these names, not about the wrap.
    const compact = settings.replace(/\s+/g, '');
    expect(compact).toContain(
      "'reducedMotion'|'quality'|'contrast'|'skin'|'customBackground'|'realism'|'visualCues'",
    );
    expect(settings).toContain('realism: settings.value.realism,');
  });
});

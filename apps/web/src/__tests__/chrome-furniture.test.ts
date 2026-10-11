/**
 * The core keeps a clearance line for the shell's bottom furniture, and that furniture is measured
 * in pixels, here, in CSS. These checks are the seam: the constant must equal what the button
 * actually paints, and the resize path must actually tell the core how tall the stage is.
 *
 * They live in the shell rather than in `stage.test.ts` because the pure layer may not read files
 * at all (SPEC.md §47) — and a rule nothing can check is a rule that quietly rots.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHROME_BAND_PX, CHROME_EDGE_PX } from '@puffly/game-core';
import { blockAfter, stripComments } from './sourceProbe';

const PILL = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');
const RAIL = readFileSync(new URL('../components/TabRail.vue', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../composables/usePuffly.ts', import.meta.url), 'utf8');

describe('the chrome the core clears is the chrome the shell draws', () => {
  it('matches the band the pill actually paints', () => {
    const bottom = Number(/bottom: calc\((\d+)px/.exec(PILL)?.[1]);
    const height = Number(/min-height: (\d+)px/.exec(PILL)?.[1]);
    expect(bottom, 'the offset under the pill').toBeGreaterThan(0);
    expect(height, 'the height of the pill').toBeGreaterThan(0);
    expect(CHROME_BAND_PX).toBe(bottom + height);
    // The pad is what stops a prop sitting flush against the shadow the button casts.
    expect(CHROME_EDGE_PX).toBeGreaterThan(CHROME_BAND_PX);
  });

  it('is handed the height by every resize, or the line stays decorative', () => {
    const calls = [...SHELL.matchAll(/setStageAspect\(([^)]*)\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call[1], 'each call tells the engine how tall the stage is').toContain(
        'viewport.stage.height',
      );
    }
  });
});

/**
 * §2 of `SmokeRitual-UI-Demo.html` gives the two bottom controls their widths in the same breath as
 * their heights: `.btn` is `calc(100% - 48px)` inside a 390 phone — 342, the number the Demo itself
 * writes out as the airflow strip's viewBox — and `.tabbar` is `padding: 14px 20px` around a capsule
 * that fills it, so 350. Both were shrink-wrapped to their content here, which is why the scene's
 * painted card kept coming out narrower than the Demo's button: `fillCard` mirrors the rect it is
 * given, and the rect was wrong.
 */
describe('the two bottom controls are the Demo’s widths, not their content’s', () => {
  it('the pill spans the phone with §2’s 24 px margins', () => {
    expect(PILL).toContain('width: calc(100% - 48px)');
    // The cap is the phone's own 342, so a desktop gets the phone's button rather than a banner.
    expect(PILL).toContain('max-width: 342px');
    expect(PILL).toContain('min-height: 62px');
    expect(PILL).toContain('border-radius: 31px');
    // Half of 62: the pill is a stadium, and §2's radius is derived from its height, not chosen.
    expect(31 * 2).toBe(62);
  });

  it('the capsule spans the phone with §2’s 20 px margins and its items share it', () => {
    // Each figure read from the rule that owns it, comments gone. Whole-file reads were not enough:
    // `border-radius: 32px` is in `.rail` *and* in `.tab`, so deleting the capsule's own radius left
    // the check green — and `.tab`'s `flex: 1` sits in the line above its own explanation.
    const rail = blockAfter(stripComments(RAIL), /\.rail \{/);
    expect(rail).toContain('width: calc(100% - 40px)');
    expect(rail).toContain('max-width: 350px');
    expect(rail).toContain('height: 62px');
    expect(rail).toContain('border-radius: 32px');
    // §2's `.item` is `flex: 1`; a min-width would let four labels shrink-wrap the capsule again.
    const tab = blockAfter(stripComments(RAIL), /\.tab \{/);
    expect(tab, 'the tabs no longer share the capsule').toContain('flex: 1');
    expect(tab, 'a min-width puts the shrink-wrap back').not.toContain('min-width: 6');
    // §2 gives the item the capsule's own radius and lets the browser clamp it.
    expect(tab, 'the item drifted off --r-capsule').toContain('border-radius: 32px');
  });
});

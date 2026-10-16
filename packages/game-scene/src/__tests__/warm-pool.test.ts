/**
 * §2's warm light, one pool per screen of the core loop.
 *
 * The Demo does not draw one light and reuse it: every one of its five phone frames writes the
 * stage's own `radial-gradient` with different numbers, because the light belongs to whatever the
 * screen is about — the table in 待机, the flame in 点着, the column in 吸入 / 力度, the tray in 磕灰.
 * This file is the first place that claim has a guard: the two glows `backgroundStructure` hands the
 * scene were read by nothing at all, which is how a px/fraction mix-up could hide a pool that was
 * being placed 149 canvas-widths off the frame.
 *
 * The numbers are transcribed from `SmokeRitual-UI-Demo.html` — read out of a browser on 2026-10-11,
 * which printed each stage's computed background and the px boxes of its children. Its phone stage
 * is 388 × 575, the same box the app's stage element gets at 390 × 844, so these fractions are the
 * file's own numbers rather than a translation of it.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { CIGARETTE_STATES } from '@puffly/game-core';
import {
  backgroundStructure,
  bloomAlpha,
  warmBloomScreen,
  warmPoolScreen,
  WARM_BLOOM,
  WARM_POOL,
} from '../backdrop';
import { harness, type Harness } from '../../../game-core/src/__tests__/harness';

/** A phone in portrait, the composition the Demo drew. */
const PHONE = { w: 390, h: 844 };

function breakHarness(): Harness {
  return harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
}

/** The row as the scene's own field names it — the one place the two vocabularies meet. */
function asGlow(row: { cx: number; cy: number; rx: number; ry: number; alpha: number }) {
  return { x: row.cx, y: row.cy, rx: row.rx, ry: row.ry, alpha: row.alpha };
}

/** The two lights the scene is handed: the bloom first, then the pool of the current screen. */
function lightsOf(h: Harness, frame: { w: number; h: number } = PHONE) {
  const { glows } = backgroundStructure(h.state(), frame.w, frame.h);
  const bloom = glows[0];
  const pool = glows[1];
  if (bloom === undefined || pool === undefined) throw new Error('the backdrop drew no lights');
  return { bloom, pool };
}

describe('the five pools are the Demo’s five rows', () => {
  it('carries each screen’s own centre, size and strength', () => {
    // Written the way the Demo writes them, so a change here has to be a change there.
    expect(WARM_POOL.idle).toEqual({ cx: 0.5, cy: 0.78, rx: 0.9, ry: 0.55, alpha: 0.16 });
    expect(WARM_POOL.light).toEqual({ cx: 0.5, cy: 0.68, rx: 0.7, ry: 0.45, alpha: 0.22 });
    expect(WARM_POOL.puff).toEqual({ cx: 0.5, cy: 0.4, rx: 0.8, ry: 0.6, alpha: 0.12 });
    expect(WARM_POOL.force).toEqual({ cx: 0.5, cy: 0.46, rx: 0.7, ry: 0.5, alpha: 0.09 });
    expect(WARM_POOL.tray).toEqual({ cx: 0.5, cy: 0.6, rx: 0.7, ry: 0.5, alpha: 0.1 });
  });

  it('moves the light between screens instead of drawing one pool for all five', () => {
    // One constant for five rows would satisfy "the Demo's numbers" for exactly one frame and be
    // wrong for the other four, so the difference is the thing being kept.
    const centres = new Set(Object.values(WARM_POOL).map((row) => row.cy));
    const alphas = new Set(Object.values(WARM_POOL).map((row) => row.alpha));
    expect(centres.size).toBe(5);
    expect(alphas.size).toBe(5);
  });

  it('draws the two blooms the Demo does, at the Demo’s own numbers', () => {
    // S1: `left:60px;top:180px;width:280px;height:170px` with `closest-side, rgba(255,138,61,.20)`.
    expect(WARM_BLOOM.table.rx).toBeCloseTo(140 / 388, 6);
    expect(WARM_BLOOM.table.ry).toBeCloseTo(85 / 575, 6);
    expect(bloomAlpha('table', WARM_BLOOM.quietAmbient)).toBeCloseTo(0.2, 6);
    // S2, the frame with the lighter open: 190 × 190 at `.34`, hotter and tighter.
    expect(WARM_BLOOM.alight.rx).toBeCloseTo(95 / 388, 6);
    expect(WARM_BLOOM.alight.ry).toBeCloseTo(95 / 575, 6);
    expect(bloomAlpha('alight', WARM_BLOOM.quietAmbient)).toBeCloseTo(0.34, 6);
    // The room's exposure scales it, in the same direction as everything else lit.
    expect(bloomAlpha('table', 0.1)).toBeLessThan(bloomAlpha('table', 0.9));
  });

  it('switches the bloom on the rod being alight, not on the screen number', () => {
    expect(warmBloomScreen('IDLE')).toBe('table');
    expect(warmBloomScreen('PICKED_UP')).toBe('table');
    expect(warmBloomScreen('LIGHTING')).toBe('alight');
    expect(warmBloomScreen('PUFFING')).toBe('alight');
    expect(warmBloomScreen('RESTING')).toBe('alight');
    expect(warmBloomScreen('EXTINGUISHED')).toBe('table');
    expect(warmBloomScreen('DISCARDED')).toBe('table');
  });
});

describe('a live break walks the rows the Demo drew', () => {
  it('takes the table, the flame, the column, the exhale and the tray in order', () => {
    const h = breakHarness();
    expect(warmPoolScreen(h.state().cigarette.state)).toBe('idle');

    h.tap('cigarette');
    h.run(16);
    // Picked up and not yet at the flame: still the table's screen.
    expect(h.state().cigarette.state).toBe('PICKED_UP');
    expect(warmPoolScreen(h.state().cigarette.state)).toBe('idle');

    h.tap('lighter');
    h.run(16);
    expect(h.state().cigarette.state).toBe('LIGHTING');
    expect(lightsOf(h).pool).toMatchObject(asGlow(WARM_POOL.light));

    h.until(() => h.state().cigarette.state === 'BURNING', 3000);
    expect(warmPoolScreen('BURNING')).toBe('puff');

    h.press('cigarette');
    h.run(1200);
    expect(h.state().cigarette.state).toBe('PUFFING');
    expect(lightsOf(h).pool).toMatchObject(asGlow(WARM_POOL.puff));

    h.release('cigarette');
    h.until(() => h.state().cigarette.state === 'RESTING', 2000);
    expect(lightsOf(h).pool).toMatchObject(asGlow(WARM_POOL.force));

    h.until(() => h.state().cigarette.state === 'ASH_READY', 120_000);
    expect(lightsOf(h).pool).toMatchObject(asGlow(WARM_POOL.tray));
  });

  it('puts each screen\u2019s pool inside the frame, portrait and wide alike', () => {
    // The bug this family exists for was a unit mix — a centre taken as a fraction of the box's width
    // and a radius as a fraction of its height — and that only *shows* on a frame that is not square.
    // The old case measured one screen (idle) on one frame; a unit slip in the other four rows, or in
    // the landscape layout, stayed invisible. `asGlow` equality cannot catch it either: both sides
    // would read the same wrong number.
    const frames = [
      ['phone', { w: PHONE.w, h: PHONE.h }],
      ['wide', { w: 1280, h: 800 }],
    ] as const;
    const base = structuredClone(breakHarness().state());
    for (const [name, frame] of frames) {
      for (const state of CIGARETTE_STATES) {
        // Rebuilt rather than mutated: the state type is read-only, and a cast that quiets the
        // compiler here would also hide a wrong field.
        const probe = { ...base, cigarette: { ...base.cigarette, state } } as typeof base;
        const { pool } = lightsOf({ state: () => probe } as never, frame);
        expect(
          pool.x > 0 && pool.x < 1 && pool.y > 0 && pool.y < 1 && pool.rx <= 1 && pool.ry <= 1,
          `${name} frame, ${state}: pool at ${pool.x},${pool.y} r${pool.rx}×${pool.ry} left the frame`,
        ).toBe(true);
        // And it is the screen's own strength, not a leftover from the unit mix.
        expect(pool.alpha).toBe(WARM_POOL[warmPoolScreen(state)].alpha);
      }
    }
  });

  it('hands the scene a pool that is inside the frame it will be drawn in', () => {
    // Everything in these fields is a fraction of the stage box, because that is what the scene
    // multiplies by the frame. The version this replaces mixed units (`box.x + spot.x * box.width`
    // for the centre, `box.width * w * 0.8` for the radius), which put the pool 149 canvas-widths
    // right of the frame and read on screen as "there is no warm light".
    const { pool } = lightsOf(breakHarness());
    expect(pool.x).toBeGreaterThan(0);
    expect(pool.x).toBeLessThan(1);
    expect(pool.y).toBeGreaterThan(0);
    expect(pool.y).toBeLessThan(1);
    expect(pool.rx).toBeGreaterThanOrEqual(WARM_POOL.idle.rx - 0.001);
    expect(pool.rx).toBeLessThanOrEqual(1);
    expect(pool.ry).toBeLessThanOrEqual(1);
    expect(pool.alpha).toBe(WARM_POOL.idle.alpha);
  });
});

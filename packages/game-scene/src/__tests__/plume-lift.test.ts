/**
 * The cartoon side buys visibility with alpha, and with nothing else — SPEC.md §16, S7's 卡通 five.
 *
 * The core authors the breath thin on purpose (`0.08 + 0.1 × intensity`, against the smouldering
 * thread's flat 0.18), so at the 写实 end the player's own breath is dimmer than the ash column:
 * the shape of the exhale — the thing S3/S4 draw — disappears. `EXHALE_LIFT` is the answer, and the
 * two things that make it safe are exactly what the retired Canvas 2D suite bounded and what is
 * unjudged since 2026-10-10: that it lifts the *breath* (not the ash, not the sparks), and that it
 * lifts the alpha (not the count, not the radius, not the life) — otherwise "more visible" is paid
 * for with more smoke, and the calibrated plume pictures measure a different cloud.
 *
 * The step is capped at a factor of 2 at the cartoon end. A lift is a multiplier on an authored
 * number, so an uncapped one is how a plume becomes a white ball.
 */
import { describe, expect, it } from 'vitest';
import type { Burst } from '@puffly/game-core';
import { MATERIAL_BURSTS, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { EXHALE_LIFT, cartoonScale, plumeIntakeOptions } from '../paint';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

/**
 * The bursts a real session hands the scene: the breath the player took, and the first material
 * burst (ash off the rod) the same walk produced.
 */
function realBursts(): { exhale: Burst; material: Burst } {
  const h = harness();
  lit(h);
  const all: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') all.push(event.burst);
  });
  h.press('cigarette');
  for (let i = 0; i < 120; i += 1) h.engine.advance(STEP);
  h.release('cigarette');
  for (let i = 0; i < 4000 && !all.some((b) => b.kind === 'exhale'); i += 1) {
    h.engine.advance(STEP);
  }
  for (let i = 0; i < 8000 && !all.some((b) => MATERIAL_BURSTS.has(b.kind)); i += 1) {
    h.engine.advance(STEP);
  }
  const exhale = all.find((b) => b.kind === 'exhale');
  const material = all.find((b) => MATERIAL_BURSTS.has(b.kind));
  if (!exhale || !material) throw new Error('the session handed over no breath or no ash to lift');
  return { exhale, material };
}

/**
 * What one intake call puts in the pool, read back as the fields this file compares.
 *
 * `alphaPeak` and not `alpha`: a particle is born with `alpha = 0` and the pool only expands it into
 * the authored peak inside `update()` (`peak · attack · release`), so reading `alpha` here compares a
 * column of zeros with another column of zeros — which is exactly how the first version of this file
 * passed two mutations that change the lift. The guard below is that lesson made machine-readable.
 */
function born(burst: Burst, plumeLift: number): number[][] {
  const pool = new ParticlePool(900);
  intakeBurst(burst, pool, { densityScale: 1, plumeLift });
  const rows: number[][] = [];
  pool.forEachActive((p) => rows.push([p.alphaPeak, p.radius, p.maxLife]));
  expect(
    rows.length,
    'the pool took nothing, so this comparison would pass on any lie',
  ).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row[0], 'a born particle carries no peak alpha').toBeGreaterThan(0);
  }
  return rows.sort((a, b) => a[0]! - b[0]!);
}

describe('the lift is a step on the breath, and nothing else (EXHALE_LIFT)', () => {
  const { exhale, material } = realBursts();

  it('lifts the breath by exactly the factor it is given', () => {
    const quiet = born(exhale, 1);
    const lifted = born(exhale, 1 + EXHALE_LIFT);
    expect(lifted.length).toBe(quiet.length);
    quiet.forEach((row, i) => {
      expect(lifted[i]![0], `particle ${String(i)} alpha`).toBeCloseTo(
        (row[0] ?? 0) * (1 + EXHALE_LIFT),
        10,
      );
    });
  });

  it('buys visibility with alpha only — same air, not more of it', () => {
    const quiet = born(exhale, 1);
    const lifted = born(exhale, 1.7);
    expect(lifted.length, 'the lift must not add particles').toBe(quiet.length);
    quiet.forEach((row, i) => {
      expect(lifted[i]![1], `particle ${String(i)} radius`).toBeCloseTo(row[1] ?? 0, 12);
      expect(lifted[i]![2], `particle ${String(i)} life`).toBeCloseTo(row[2] ?? 0, 12);
    });
  });

  it('leaves the ash and the sparks alone, because they are the tobacco, not the breath', () => {
    const one = born(material, 1);
    const three = born(material, 3);
    expect(three).toEqual(one);
  });

  it('and at the shipped split that step is 1.5×, capped at 2× at the cartoon end', () => {
    const liftOf = (realism: number): number =>
      plumeIntakeOptions({ realism, reducedMotion: false, quality: 'high', skin: null })
        .plumeLift ?? 1;
    expect(liftOf(1)).toBe(1);
    expect(liftOf(0.8)).toBeCloseTo(1 + EXHALE_LIFT * cartoonScale(0.8), 10);
    expect(liftOf(0)).toBeLessThanOrEqual(2);
    expect(liftOf(0)).toBeGreaterThan(liftOf(0.8));
  });
});

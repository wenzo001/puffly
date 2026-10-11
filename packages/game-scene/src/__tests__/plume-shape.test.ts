/**
 * The plume is a body of air, not a swarm — SPEC.md §15, §16.
 *
 * The complaint was that the smoke reads as fog and is out of focus (像雾, 没对上焦). The cause
 * was not the particle count, the alpha, or the spread angle: `curl2`'s third argument selects a
 * different noise *lattice*, and the pool was passing each particle's own seed, so two neighbours
 * were pushed in unrelated directions and nothing ever moved as a column. One shared field, and
 * the same numbers become a thread.
 *
 * What this file measures changed once, and for a reason worth keeping: it used to measure one
 * burst's own elongation after a few seconds. That number was really measuring how far the cloud
 * had *travelled* — a fast cloud is a tall cloud however it looks. When the smoke was given the
 * drag air actually exerts on it (see `SMOKE_DRAG` in intake.ts), the travelling stopped and the
 * same assertion reddened at 0.51 while the rendered frame showed the narrowest plume the engine
 * had ever drawn. So the shape is now measured where the player sees it: on the whole plume,
 * every burst the scene has aired at once.
 */

import { describe, expect, it } from 'vitest';
import type { Burst } from '@puffly/game-core';
import { FIELD_SCALE, MATERIAL_BURSTS, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

interface Shape {
  /** CSS pixels on the phone's stage box, so the two are the same kind of number. */
  sigmaX: number;
  sigmaY: number;
  elongation: number;
  /** The plume's own footprint, as a share of the stage's area. */
  coverage: number;
}

const sd = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
};

/** Every burst a real session hands over in `seconds`, riding the shared field together. */
function airTheScene(seconds: number): ParticlePool {
  const h = harness();
  // 900 ms of settle after the cherry takes: the rod is out at the flame when it catches and walks
  // home from there, and a column whose origin is sliding across the table is not the resting plume
  // this file measures (§15).
  lit(h, 900);
  const pending: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') pending.push(event.burst);
  });
  const pool = new ParticlePool(1400);
  const steps = Math.round((seconds * 1000) / STEP);
  const drawEnds = Math.round(1400 / STEP);
  let clockMs = 0;
  h.press('cigarette');
  for (let i = 0; i < steps; i++) {
    if (i === drawEnds) h.release('cigarette');
    h.engine.advance(STEP);
    clockMs += STEP;
    for (const burst of pending.splice(0, pending.length)) {
      // The breath only. A column that fell while the rod was burning rides the same pool, and
      // mixing it in makes this file's footprint depend on when the ash happened to come off.
      if (MATERIAL_BURSTS.has(burst.kind)) continue;
      intakeBurst(burst, pool, { densityScale: 1 });
    }
    pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, clockMs / 1000, null);
  }
  return pool;
}

/**
 * The phone the brief puts first (§ mobile 390×844), because "taller than wide" is a claim about
 * pixels: positions are normalised (§55), so the same cloud is tall on a portrait stage and squat on
 * a wide one. Lengths inside the cloud scale with `min(width / 0.75, height)` — what `viewport.len`
 * uses — while the two axes scale with the stage's own edges.
 */
const PHONE = { width: 390, height: 844, unit: 520 };

function shapeOf(pool: ParticlePool): Shape {
  const xs: number[] = [];
  const ys: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pool.forEachActive((particle) => {
    const r = particle.radius * particle.scale * particle.size * PHONE.unit;
    const px = particle.x * PHONE.width;
    const py = particle.y * PHONE.height;
    xs.push(px);
    ys.push(py);
    minX = Math.min(minX, px - r);
    maxX = Math.max(maxX, px + r);
    minY = Math.min(minY, py - r);
    maxY = Math.max(maxY, py + r);
  });
  expect(xs.length, 'the scene had a plume to measure').toBeGreaterThan(20);
  const sigmaX = sd(xs);
  const sigmaY = sd(ys);
  return {
    sigmaX,
    sigmaY,
    elongation: sigmaY / Math.max(sigmaX, 1e-6),
    // Still a share of the stage's area, so the number does not change with the box it was drawn in.
    coverage: ((maxX - minX) / PHONE.width) * ((maxY - minY) / PHONE.height),
  };
}

describe('the smoke moves as one body (§15)', () => {
  it('the plume the player sees is one body of air, not fog', () => {
    const shape = shapeOf(airTheScene(2.5));
    console.log(
      `PLUME px sigmaX=${shape.sigmaX.toFixed(1)} sigmaY=${shape.sigmaY.toFixed(1)} elongation=${shape.elongation.toFixed(3)} footprint=${(shape.coverage * 100).toFixed(1)}% of the stage`,
    );
    // Re-measured 2026-10-08, twice corrected, and both corrections moved the number *down* — which
    // is the reason they are written here rather than quietly folded in. Both rows below are this
    // same ruler on the same 2.5 s scene, printed with the filter switched off and then on:
    //
    //   smoke only   sigmaX 31.3  sigmaY 38.2    elongation 1.223  footprint 22.2%
    //   as aired     sigmaX 33.1  sigmaY 177.4   elongation 5.356  footprint 66.7%
    //
    // 1. The sample is the plume bodies only. The scene also airs the cherry's sparks, and they are
    //    thrown straight up: with them in, the cloud reads 4.6x taller than the smoke is spread. The
    //    old bound was largely a picture of sparks.
    // 2. The two axes are compared in one unit. Positions are normalised (§55), so a raw `sigmaY` /
    //    `sigmaX` divides a spread over 844 pixels by a spread over 390 and calls the quotient a
    //    shape. On the phone's box this plume is 31.3px wide and 38.2px tall.
    //
    // What the bounds are here to catch is the per-particle noise lattice the header names, and that
    // failure was measured by putting it back: `curl2`'s seed set to each particle's own gives
    // footprint 45.0% and elongation 1.596 — the bound below reddens, while a taller/thinner bound
    // would have *passed* the fog, because a swarm scatters vertically as much as it does sideways.
    //
    // Two bounds this case used to carry are gone, and the reason is the same measurement. Against a
    // cloud whose buoyancy was switched off (elongation 1.033) and one whose sideways swing was
    // raised 4.9x (sigmaX 32.2), `elongation >= 1.5` and `sigmaX <= 0.11` both stayed green: they were
    // reading the size of the breath, which no failure mode moves. Narrowness is claimed where it is
    // actually produced, by plume-column.test.ts（2026-10-10 随 2D 光栅套件退役）.
    expect(shape.coverage).toBeLessThanOrEqual(0.35);
  });

  it('two puffs still do not trace the same path (§16)', () => {
    // The reason this is asserted: sharing one field is exactly what could have made every puff
    // identical. They do not, because each one samples the air at its own place and moment.
    const h = harness();
    lit(h);
    const paths: string[] = [];
    h.engine.on((event) => {
      if (event.kind === 'burst' && event.burst.kind === 'drift') {
        const pool = new ParticlePool(400);
        intakeBurst(event.burst, pool, { densityScale: 1 });
        for (let i = 0; i < 120; i++) {
          pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, (i * STEP) / 1000, null);
        }
        const xs: number[] = [];
        pool.forEachActive((particle) => xs.push(Number(particle.x.toFixed(4))));
        paths.push(xs.sort().join(','));
      }
    });
    h.engine.advance(14000);
    expect(paths.length, 'the cherry drifted more than once').toBeGreaterThan(1);
    expect(new Set(paths).size, 'every drift traced the same line').toBe(paths.length);
  });
});

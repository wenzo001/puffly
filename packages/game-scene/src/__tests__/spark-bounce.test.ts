/**
 * 火星落地有弹跳 — S12's 「火星飞溅用夸张粒子，落地有弹跳（比真实更脆）」, SPEC.md §16.
 *
 * What was missing was bigger than a flourish. Measured before this file, every spark the lighting
 * threw crossed the table's horizon at vy≈0.42 with 0.8–1.3 s of life left and died at y 1.00–1.30
 * of a stage that ends at 1.0: the scene draws a table and the sparks fell straight through it.
 *
 * The plane is `state.stage.layout.table.y` — where things *lie* (the rod, the pack and the tray are
 * all drawn on it), not `tableEdgeY`, which is the back edge of the same surface. The floor answers
 * sparks and nothing else: ash flakes are simulated by Game Core and settle flat on purpose, and a
 * plume that could not fall past a line would be a wall — which is what the last case proves.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Burst } from '@puffly/game-core';
import { FIELD_SCALE, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

interface Trail {
  /** How far down it got, in stage units. */
  deepest: number;
  /** How many times the plane turned it back. */
  contacts: number;
  /** The top of the first hop: the smallest y reached after that first turn. */
  riseTop: number;
  /** Clock at the first turn, and the last clock this spark was still alive. */
  firstContactMs: number;
  lastSeenMs: number;
}

/** One real lighting, its sparks integrated by the shipped pool against the state's own table plane. */
function traceSparks(): { trails: Trail[]; floor: number; finalClock: number } {
  const h = harness();
  const pending: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') pending.push(event.burst);
  });
  lit(h, 900);

  const pool = new ParticlePool(1400);
  const trails = new Map<string, Trail>();
  let clockMs = 0;
  h.press('cigarette');

  for (let step = 0; step < Math.round(4000 / STEP); step++) {
    if (step === Math.round(1400 / STEP)) h.release('cigarette');
    h.engine.advance(STEP);
    clockMs += STEP;
    for (const burst of pending.splice(0, pending.length)) {
      intakeBurst(burst, pool, { densityScale: 1 });
    }
    const floor = h.state().stage.layout.table.y;

    // The slot index plus the seed: an index alone would merge a dead spark's trail with the next
    // particle born into the same slot.
    const key = (index: number, particle: { noiseSeed: number }): string =>
      `${String(index)}:${String(particle.noiseSeed)}`;

    const before = new Map<string, number>();
    pool.forEachActive((particle, index) => {
      if (particle.spark) before.set(key(index, particle), particle.vy);
    });

    pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, clockMs / 1000, floor);

    pool.forEachActive((particle, index) => {
      if (!particle.spark) return;
      const id = key(index, particle);
      const trail: Trail = trails.get(id) ?? {
        deepest: particle.y,
        contacts: 0,
        riseTop: particle.y,
        firstContactMs: -1,
        lastSeenMs: clockMs,
      };
      trail.deepest = Math.max(trail.deepest, particle.y);
      trail.lastSeenMs = clockMs;
      // Turned back: it was falling in the step and it is rising in it, which is the floor running.
      if ((before.get(id) ?? 0) > 0 && particle.vy < 0) {
        trail.contacts += 1;
        if (trail.contacts === 1) {
          trail.firstContactMs = clockMs;
          // The hop is measured from the plane, not from wherever this spark happened to be when
          // the pool first saw it — that mistake reported every hop as 0.14, the drop itself.
          trail.riseTop = particle.y;
        }
      }
      if (trail.contacts > 0) trail.riseTop = Math.min(trail.riseTop, particle.y);
      trails.set(id, trail);
    });
  }
  return {
    trails: [...trails.values()],
    floor: h.state().stage.layout.table.y,
    finalClock: clockMs,
  };
}

describe('the table takes the spark (S12: 落地有弹跳)', () => {
  const run = traceSparks();
  const landed = run.trails.filter((trail) => trail.contacts > 0);
  const hops = landed.map((trail) => run.floor - trail.riseTop);
  const lives = landed.map((trail) => trail.lastSeenMs - trail.firstContactMs);
  console.log(
    `MEASURE sparks=${String(run.trails.length)} landed=${String(landed.length)} ` +
      `floor=${run.floor.toFixed(3)} deepest=${Math.max(
        ...run.trails.map((t) => t.deepest),
      ).toFixed(3)} ` +
      `hop=${hops.map((h) => h.toFixed(3)).join(',')} contacts=${landed
        .map((t) => String(t.contacts))
        .join(',')} aliveAfterLandingMs=${lives.map((l) => String(Math.round(l))).join(',')}`,
  );

  it('no spark ends up under the plane it should bounce off', () => {
    expect(run.trails.length, 'the lighting threw no sparks at all').toBeGreaterThan(0);
    for (const trail of run.trails) {
      expect(trail.deepest, 'a spark sank through the table').toBeLessThanOrEqual(run.floor + 1e-3);
    }
    // And the claim has something to bite on: sparks do reach the plane.
    expect(
      run.trails.filter((trail) => trail.deepest >= run.floor - 1e-3).length,
      'no spark ever reached the table, so nothing proves the floor works',
    ).toBeGreaterThan(0);
  });

  it('the plane turns the fall back upward, and the hop reads', () => {
    expect(landed.length, 'nothing bounced: the floor is only a clamp').toBeGreaterThan(0);
    // 比真实更脆, and it has to be seeable: measured hops are 0.023–0.035 of the stage's height
    // (9–14 px on a 390×844 stage). The bound sits under the smallest measured hop, so a restitution
    // quietly halved still passes and one zeroed out does not.
    for (const hop of hops) {
      expect(hop, 'the spark did not come back up').toBeGreaterThan(0.018);
    }
  });

  it('a spark that lands does not sit on the table glowing', () => {
    expect(landed.length, 'nothing landed, so the cost of a landing is unjudged').toBeGreaterThan(
      0,
    );
    for (const trail of landed) {
      // Both bounds are the two measurements, not a guess: with a landing costing 0.8 of the spark's
      // life the same run reports at most 3 hops in 833 ms; take the cost away and it reports 5 hops
      // in 1150 ms — a speck skittering along the table, which is not what a spark does.
      expect(trail.contacts, 'the spark jitters on the plane instead of dying').toBeLessThanOrEqual(
        4,
      );
      const alive = trail.lastSeenMs - trail.firstContactMs;
      expect(alive, 'a landed spark is still flying a second on').toBeLessThan(1000);
    }
  });

  it('answers sparks only — anything else still falls through the same line', () => {
    // The positive control: a wall drawn at that height would pass every case above.
    const poolFor = (spark: boolean): ParticlePool => {
      const pool = new ParticlePool(4);
      pool.spawn({
        x: 0.5,
        y: 0.6,
        // Straight down at the plane, with no buoyancy and no turbulence to argue with.
        vx: 0,
        vy: 0.4,
        radius: 0.004,
        alphaPeak: 0.7,
        alphaDecay: 1,
        life: 4000,
        noiseSeed: spark ? 11 : 12,
        rotation: 0,
        scale: 1,
        scaleGrowth: 0,
        turbulence: 0,
        rise: 0,
        gravity: 0.35,
        drag: 0.2,
        // Not plume air: this pool holds a spark, and the three layers belong to a breath.
        layer: null,
        tint: [255, 200, 120],
        heat: 1,
        depth: 1,
        spark,
        delay: 0,
      });
      return pool;
    };
    const deepestOf = (pool: ParticlePool): number => {
      let deepest = 0;
      for (let i = 0; i < 60; i++) {
        pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, i * 0.02, 0.705);
        pool.forEachActive((particle) => {
          deepest = Math.max(deepest, particle.y);
        });
      }
      return deepest;
    };
    expect(deepestOf(poolFor(false)), 'smoke was stopped by the spark floor').toBeGreaterThan(0.72);
    expect(deepestOf(poolFor(true)), 'a spark passed the table through').toBeLessThanOrEqual(0.706);
  });

  it('the renderer hands the pool the plane the state is drawn on', () => {
    // A source read, and only what a source read can buy: that the one production call site names
    // the layout's own table line instead of a constant — the half that would silently stop
    // bouncing the moment the table lifts (§55). The physics is judged behaviourally above.
    // The call site moved with the scene (2026-10-10): `SceneStage`'s frame is the only place the
    // pool is integrated now.
    const scene = readFileSync(
      new URL('../../../../apps/web/src/components/SceneStage.vue', import.meta.url),
      'utf8',
    );
    const call = /pool\.update\([^;]*\);/s.exec(scene);
    expect(call, 'the scene no longer integrates the pool').not.toBeNull();
    expect(call?.[0]).toContain('state?.stage.layout.table.y');
  });
});

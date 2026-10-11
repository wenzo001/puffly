/**
 * The plume has three layers — SPEC.md S7 写实: 「烟羽分层：主体、边缘、卷曲三层独立速度与透明度」.
 *
 * #38 gave the smoke one shared flow field and it stopped being fog; #39 and #40 kept that body on
 * stage and made it one line. What was still missing was the deck's own word for what a plume *is*:
 * every particle in a breath was authored with the same brightness, the same buoyancy and the same
 * share of the room's eddies, so the column had no inside and no outside. One rope. S7 asks for a
 * body (主体), an edge that did not keep up (边缘) and curls that leave (卷曲).
 *
 * So this file measures the three populations the deck names, in the three quantities the deck names:
 * transparency, speed, and — for 卷曲 — how far out of the line they get. Bounds are the roster's own
 * readings from the `LAYER` lines this prints, with the slack the smallest sample needs (`cigar`
 * breathes 43 bodies, so 8 of them are curls).
 *
 * What the layering deliberately did *not* buy is a different cloud. Measured against the same table
 * collapsed to one layer: footprint 22.2% → 23.0% of the stage, the breath's lit width at 2 s 0.103 →
 * 0.092 of a stage height, and the peak against the room 5.58 → 5.45 (the floor plume-contrast.test.ts（2026-10-10 随 2D 光栅套件退役）
 * holds is 5). The 主体 keeps the authored buoyancy and carries 1.5× the authored alpha, so the halo is
 * added light rather than the body's light spent on it — and the two versions that got that wrong are
 * still in the numbers below: a flat-mean table (core 1.0 / edge 0.55 / curl 0.3) took that ratio to
 * 3.93, and equalising the alpha alone (speeds and couplings still layered) takes it to 4.60. Both are
 * 「烟看不清」, the one complaint this file may not reintroduce.
 *
 * Mutations, and what each one actually reddened — all measured, none assumed:
 * - alpha collapsed to one value → the eleven 透明度 cases **and** `plume-contrast`'s floor;
 * - buoyancy collapsed → 14: the eleven 速度 cases, 「the layers really part」, the co-existence case,
 *   and the footprint half of 「the outer layers are the ones that left the line」;
 * - coupling collapsed → exactly that last case's two swing lines. They are why this file asserts the
 *   coupling as a number at all: the footprint alone did not notice a coupling collapse — a body that
 *   rises less far simply samples less of the field — so three couplings would have been decorative;
 * - layers dealt in blocks (five core, three edge, two curl, in runs) → 「any seven consecutive
 *   births」, the co-existence case, and `plume-continuity`'s `long` row, while the proportions stay
 *   exactly right, which is why the dealing and the share are two separate cases;
 * - material bursts given layers → 「an event has no halo」 and `spark-bounce`'s hop;
 * - the draught applied to every layer, or to none → the one draught case in each direction;
 * - the resize copy dropping `layer`, or the frame dropping `ventDraught` → the two wiring cases.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { Burst, BurstKind } from '@puffly/game-core';
import { FIELD_SCALE, MATERIAL_BURSTS, intakeBurst, plumeLayerFor } from '../intake';
import type { PlumeLayer } from '../particles';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;
const LAYERS: readonly PlumeLayer[] = ['core', 'edge', 'curl'];
const ids = DEFAULT_CONTENT.cigarettes.map((cigarette) => cigarette.id);

interface Stat {
  n: number;
  alpha: number;
  rise: number;
  swing: number;
  height: number;
  spreadX: number;
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const sd = (values: number[]): number => {
  if (values.length < 2) return 0;
  const middle = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - middle) ** 2, 0) / (values.length - 1),
  );
};

/** The first real breath of `cigaretteId`, released the way the player releases it. */
function breathOf(cigaretteId: string): Burst {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId });
  lit(h);
  let breath: Burst | null = null;
  h.engine.on((event) => {
    if (!breath && event.kind === 'burst' && event.burst.kind === 'exhale') breath = event.burst;
  });
  h.press('cigarette');
  h.engine.advance(1400);
  h.release('cigarette');
  h.engine.advance(600);
  if (!breath) throw new Error(`${cigaretteId} never breathed`);
  return breath;
}

/** One burst, aired for `seconds` in still wind, with `shred` as the venue's draught. */
function ride(burst: Burst, seconds: number, shred = 0): ParticlePool {
  const pool = new ParticlePool(1400);
  intakeBurst(burst, pool, { densityScale: 1 });
  const steps = Math.round((seconds * 1000) / STEP);
  for (let i = 0; i < steps; i++) {
    pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, (i * STEP) / 1000, null, 1, shred);
  }
  return pool;
}

/** Per layer: population, brightness, buoyancy, coupling, height above the mouth, sideways footprint. */
function statsOf(pool: ParticlePool, mouthY: number): Record<PlumeLayer | 'none', Stat> {
  type Bucket = { alpha: number[]; rise: number[]; swing: number[]; y: number[]; x: number[] };
  const fresh = (): Bucket => ({ alpha: [], rise: [], swing: [], y: [], x: [] });
  const buckets: Record<PlumeLayer | 'none', Bucket> = {
    core: fresh(),
    edge: fresh(),
    curl: fresh(),
    none: fresh(),
  };
  pool.forEachActive((particle) => {
    const bucket = buckets[particle.layer ?? 'none'];
    bucket.alpha.push(particle.alphaPeak);
    bucket.rise.push(particle.rise);
    bucket.swing.push(particle.swing);
    bucket.y.push(mouthY - particle.y);
    bucket.x.push(particle.x);
  });
  const out = {} as Record<PlumeLayer | 'none', Stat>;
  for (const [key, bucket] of Object.entries(buckets)) {
    out[key as PlumeLayer | 'none'] = {
      n: bucket.alpha.length,
      alpha: mean(bucket.alpha),
      rise: mean(bucket.rise),
      swing: mean(bucket.swing),
      height: mean(bucket.y),
      spreadX: sd(bucket.x),
    };
  }
  return out;
}

const share = (stat: Stat, live: number): number => (live === 0 ? 0 : stat.n / live);

describe('the deck’s three layers are three populations (S7 r4)', () => {
  it('one period of a burst is five body, three edge, two curl', () => {
    const counts = { core: 0, edge: 0, curl: 0 };
    for (let i = 0; i < 10; i++) counts[plumeLayerFor(i)] += 1;
    expect(counts).toEqual({ core: 5, edge: 3, curl: 2 });
  });

  it('and any seven consecutive births contain all three', () => {
    // The reason the dealing is spread instead of dealt in blocks: a burst is a stream, so birth
    // order is position along the column. Blocks would keep these proportions exactly and still put
    // the body at the head of the breath and the curls at the mouth — three layers sliced in time,
    // which is the picture this replaces. Measured over twenty periods, including the ones that
    // straddle the boundary.
    for (let start = 0; start <= 199; start++) {
      const seen = new Set<PlumeLayer>();
      for (let i = start; i < start + 7; i++) seen.add(plumeLayerFor(i));
      expect(seen.size, `births ${String(start)}–${String(start + 6)}`).toBe(3);
    }
  });

  it.each(ids)('%s breathes all three layers', (id) => {
    const burst = breathOf(id);
    const pool = ride(burst, 1.2);
    const stats = statsOf(pool, burst.origin.y);
    const live = pool.size;
    console.log(
      `LAYER ${id.padEnd(10)} live=${String(live)} ` +
        LAYERS.map(
          (layer) =>
            `${layer}=${String(stats[layer].n)}(${(share(stats[layer], live) * 100).toFixed(1)}%) ` +
            `a=${stats[layer].alpha.toFixed(4)} r=${stats[layer].rise.toFixed(4)} ` +
            `sw=${stats[layer].swing.toFixed(4)} h=${stats[layer].height.toFixed(4)} ` +
            `sx=${stats[layer].spreadX.toFixed(4)}`,
        ).join(' '),
    );
    expect(share(stats.core, live)).toBeGreaterThanOrEqual(0.45);
    expect(share(stats.edge, live)).toBeGreaterThanOrEqual(0.25);
    expect(share(stats.curl, live)).toBeGreaterThanOrEqual(0.15);
  });
});

describe('透明度 (S7: 三层独立…透明度)', () => {
  it.each(ids)('%s is born in three brightnesses', (id) => {
    const burst = breathOf(id);
    const stats = statsOf(ride(burst, 1.2), burst.origin.y);
    expect(stats.core.alpha / stats.edge.alpha).toBeGreaterThanOrEqual(1.85);
    expect(stats.edge.alpha / stats.curl.alpha).toBeGreaterThanOrEqual(1.7);
    // Each layer outward is about half the one inside it, and the body of the breath is not the
    // thing that got dimmer: 1.5× the authored alpha survives the sampled jitter and the taper.
    expect(stats.core.alpha).toBeGreaterThanOrEqual(burst.alphaPeak * 0.6);
  });
});

describe('速度 (S7: 三层独立速度…)', () => {
  it.each(ids)('%s gives its three layers three buoyancies', (id) => {
    const burst = breathOf(id);
    const stats = statsOf(ride(burst, 1.2), burst.origin.y);
    expect(stats.core.rise / stats.curl.rise).toBeGreaterThanOrEqual(1.6);
    expect(stats.edge.rise / stats.curl.rise).toBeGreaterThanOrEqual(1.15);
    // The head of a breath still moves at the speed the four calibrated plume files were measured
    // against — the layering is the outer smoke lagging, not the column being slowed down.
    expect(stats.core.rise / burst.rise).toBeGreaterThanOrEqual(0.9);
    expect(stats.core.rise / burst.rise).toBeLessThanOrEqual(1.1);
  });

  it('the layers really part as the breath rises', () => {
    // The behavioural half of the claim: three different authored buoyancies only count as three
    // layers if the smoke ends up in three places. Measured on `classic` at 1.2 s, in the middle of
    // the exhale, where the deck’s 「分层涌出」 happens; the roster's slow rods part by the same
    // multipliers over a shorter travel, which the case above already judges.
    const burst = breathOf('classic');
    const stats = statsOf(ride(burst, 1.2), burst.origin.y);
    expect(stats.core.height).toBeGreaterThan(stats.edge.height);
    expect(stats.edge.height).toBeGreaterThan(stats.curl.height);
    expect(stats.core.height - stats.curl.height).toBeGreaterThanOrEqual(0.015);
  });

  it('and the layers are together at the same heights, not stacked along the column', () => {
    const burst = breathOf('classic');
    const pool = ride(burst, 1.2);
    const ys: number[] = [];
    pool.forEachActive((particle) => ys.push(particle.y));
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    let checked = 0;
    let missing = 0;
    for (let band = 4; band < 12; band++) {
      const lo = top + ((bottom - top) * band) / 12;
      const hi = top + ((bottom - top) * (band + 1)) / 12;
      const seen = new Set<PlumeLayer | null>();
      let live = 0;
      pool.forEachActive((particle) => {
        if (particle.y >= lo && particle.y < hi) {
          live += 1;
          seen.add(particle.layer);
        }
      });
      // Only bands that hold something: the leading edge of a plume *is* its body, and a band of two
      // particles cannot be asked to contain three layers.
      if (live < 6) continue;
      checked += 1;
      if (seen.size < 3) missing += 1;
    }
    expect(checked, 'the breath had a body of smoke to measure').toBeGreaterThanOrEqual(5);
    expect(missing).toBe(0);
  });
});

describe('the outside is the outside', () => {
  it('the outer layers are the ones that left the line', () => {
    const burst = breathOf('classic');
    const stats = statsOf(ride(burst, 3), burst.origin.y);
    console.log(
      `SPREAD core=${stats.core.spreadX.toFixed(4)} edge=${stats.edge.spreadX.toFixed(4)} curl=${stats.curl.spreadX.toFixed(4)} ` +
        `swing=${stats.core.swing.toFixed(3)}/${stats.edge.swing.toFixed(3)}/${stats.curl.swing.toFixed(3)}`,
    );
    // The coupling is asserted as a number and not only through the footprint, because the footprint
    // turned out to be the *buoyancy*'s story: with the three couplings collapsed to one, `spreadX`
    // kept its order — a body that rises less far samples less of the field — so only this reading
    // can tell a coupling table from a decorative one. (Measured, not reasoned: that collapse was
    // tried, and it reddened nothing until this line existed.)
    expect(stats.edge.swing / stats.core.swing).toBeGreaterThanOrEqual(1.5);
    expect(stats.curl.swing / stats.edge.swing).toBeGreaterThanOrEqual(1.5);
    expect(stats.edge.spreadX / stats.core.spreadX).toBeGreaterThanOrEqual(1.3);
    expect(stats.curl.spreadX / stats.core.spreadX).toBeGreaterThanOrEqual(2);
  });

  it('a draught takes the curls off and leaves the body its line (S21, 延)', () => {
    // The deck's three layers, extended with the number S21 introduced: a venue's 通风系数 already
    // paints the plume wider and dimmer, and now it also reaches the structure — an open place peels
    // the 卷曲 layer off while the 主体 keeps the line the player breathed.
    const burst = breathOf('classic');
    const sealed = statsOf(ride(burst, 3, 0), burst.origin.y);
    const open = statsOf(ride(burst, 3, 1), burst.origin.y);
    console.log(
      `SHRED curl ${sealed.curl.spreadX.toFixed(4)}→${open.curl.spreadX.toFixed(4)} ` +
        `core ${sealed.core.spreadX.toFixed(4)}→${open.core.spreadX.toFixed(4)}`,
    );
    expect(open.curl.spreadX / sealed.curl.spreadX).toBeGreaterThanOrEqual(1.4);
    // The body and the edge feel nothing, bit for bit — that is the difference between a draught and
    // a blur, and it is why the claim is equality rather than a tolerance.
    expect(open.core.spreadX).toBe(sealed.core.spreadX);
    expect(open.edge.spreadX).toBe(sealed.edge.spreadX);
  });
});

describe('what is not a plume', () => {
  it('an event has no halo — sparks, ash and flint stay one layer', () => {
    const burst = breathOf('classic');
    for (const kind of ['ember', 'ash', 'impact', 'puff', 'drift'] as BurstKind[]) {
      const pool = new ParticlePool(400);
      intakeBurst({ ...burst, kind }, pool, { densityScale: 1 });
      const seen = new Set<PlumeLayer | null>();
      pool.forEachActive((particle) => seen.add(particle.layer));
      const material = MATERIAL_BURSTS.has(kind);
      if (material) {
        expect([...seen], kind).toEqual([null]);
        // …and it keeps the whole field and its own authored buoyancy: an event is not a plume, so it
        // is not handed a plume's slower, softer air either.
        pool.forEachActive((particle) => {
          expect(particle.swing, kind).toBe(1);
        });
      } else {
        expect([...seen].sort(), kind).toEqual(['core', 'curl', 'edge']);
      }
    }
  });
});

describe('wiring (source reads — what they can and cannot prove is stated in each)', () => {
  it('the frame hands the pool the venue it is drawing', () => {
    // Like the table-plane read in `spark-bounce.test.ts`: this proves the one production call site
    // names this frame's own 通风系数, not a constant. That the draught then moves the curls is judged
    // behaviourally above. The call site moved with the scene (2026-10-10): it is `SceneStage`'s
    // frame now, and the tier-copy half of this describe retired with the painted renderer — the
    // scene keeps one pool for the life of the layer, so there is no rebuilt copy to guard.
    const scene = readFileSync(
      new URL('../../../../apps/web/src/components/SceneStage.vue', import.meta.url),
      'utf8',
    );
    const call = /pool\.update\([^;]*\);/s.exec(scene);
    expect(call, 'the scene no longer integrates the pool').not.toBeNull();
    expect(call?.[0]).toContain('ventDraught(state?.environment.ventilation ?? 1)');
  });
});

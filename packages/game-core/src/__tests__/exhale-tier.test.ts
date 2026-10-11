/**
 * §puffAnimations' exhale table, which is the half of the tier rule the lip-action test cannot see:
 * the breath is *not* random. Its volume, layers, spread and rise time are the tier the released
 * press measured, and an inhaled rod's exhale burst must carry the Demo's own S / M / L numbers
 * (8 / 24 / 35 ml, 1–2 / 3–4 / 5–6 layers, 24 / 52 / 86 px, 0.6 / 1.2 / 2.5 s).
 *
 * A mouthed rod (savourMs > 0) keeps its own slow branch and carries no tier fields at all.
 */
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../types/events';
import { PUFF_TIERS, type PuffTierId } from '../puffTier';
import { tieredExhaleOptions } from '../systems/emissions';
import type { Burst } from '../types/events';
import { FIXTURE } from './fixture';
import { harness, lit, type Harness } from './harness';

/** The recipe’s own envelope ratios, restated so a changed constant fails loudly. */
const RADIUS_SCALE: Record<PuffTierId, number> = { S: 24 / 52, M: 1, L: 86 / 52 };
const LIFE_SCALE: Record<PuffTierId, number> = { S: 0.5, M: 1, L: 1.6 };
const IDS: readonly PuffTierId[] = ['S', 'M', 'L'];

describe('the tier recipe carries the Demo exhale table', () => {
  it('scales the legacy M count by the table’s own 8 / 24 / 35 ml', () => {
    const counts = IDS.map((id) => tieredExhaleOptions(PUFF_TIERS[id], 0.6).count);
    // 44 + 86·0.6 = 95.6 → 96 for M; S takes a third, L ×35/24 = 139.4 → 139.
    expect(counts).toEqual([32, 96, 139]);
    // The eye’s mass ratio is the spec’s own volume ratio, stated in whole millilitres.
    expect(counts[1]! / counts[0]!).toBeCloseTo(24 / 8, 1);
    expect(counts[2]! / counts[0]!).toBeCloseTo(35 / 8, 1);
  });

  it('is exactly the legacy inhaled count on M', () => {
    for (const intensity of [0, 0.37, 0.84, 1]) {
      const legacy = 44 + Math.round(86 * intensity);
      expect(tieredExhaleOptions(PUFF_TIERS.M, intensity).count).toBe(legacy);
    }
  });

  it('hands the renderer every table field unchanged', () => {
    for (const id of IDS) {
      const t = PUFF_TIERS[id];
      const recipe = tieredExhaleOptions(t, 0.6).tierRecipe;
      expect(recipe).toBeDefined();
      expect(recipe?.tier).toBe(id);
      expect(recipe?.volumeMl).toBe(t.volumeMl);
      expect(recipe?.smokeLayers).toEqual([t.smokeLayers[0], t.smokeLayers[1]]);
      expect(recipe?.spreadRadiusPx).toBe(t.spreadRadiusPx);
      expect(recipe?.riseSeconds).toBe(t.riseSeconds);
    }
  });

  it('scales the birth radius off M’s envelope at 24 / 52 / 86 px’s own ratios', () => {
    // M is the legacy 0.01…0.03 envelope the calibrated plume files measure; S and L are that
    // envelope at the Demo’s own 24 / 52 and 86 / 52.
    for (const id of IDS) {
      const [min, max] = tieredExhaleOptions(PUFF_TIERS[id], 0.6).radius;
      expect(max).toBeCloseTo(0.03 * RADIUS_SCALE[id], 8);
      expect(min).toBeCloseTo(0.01 * RADIUS_SCALE[id], 8);
    }
  });

  it('stretches the life envelope with 0.6 / 1.2 / 2.5 s and widens every tier', () => {
    for (const id of IDS) {
      const [min, max] = tieredExhaleOptions(PUFF_TIERS[id], 0.6).lifeMs;
      expect(min).toBeCloseTo(3600 * LIFE_SCALE[id], 6);
      expect(max).toBeCloseTo(8200 * LIFE_SCALE[id], 6);
    }
    const bands = IDS.map((id) => tieredExhaleOptions(PUFF_TIERS[id], 0.6).lifeMs);
    expect(bands[1]?.[0]).toBeGreaterThan(bands[0]?.[0] ?? 0);
    expect(bands[2]?.[0]).toBeGreaterThan(bands[1]?.[0] ?? 0);
  });

  it('keeps ejection, buoyancy and turbulence on the one intensity formula at every tier', () => {
    // Those three are not columns of the Demo tier table, so the tier may not author them. The rise
    // time is expressed by the life envelope above.
    for (const id of IDS) {
      const o = tieredExhaleOptions(PUFF_TIERS[id], 0.6);
      expect(o.speed[0]).toBe(0.01);
      expect(o.speed[1]).toBeCloseTo(0.052, 10);
      expect(o.rise).toBeCloseTo(2.08, 10);
      expect(o.turbulence).toBeCloseTo(0.51, 10);
      expect(o.alphaPeak).toBeCloseTo(0.14, 10);
    }
  });
});

/** Press, hold, release, and return the exhale burst the release emitted. */
function exhaleFor(h: Harness, holdMs: number): Burst {
  lit(h);
  const before = h.bursts.filter((e) => e.kind === 'burst' && e.burst.kind === 'exhale').length;
  h.press('cigarette');
  h.run(holdMs);
  h.release('cigarette');
  const breaths = h.bursts.filter((e) => e.kind === 'burst' && e.burst.kind === 'exhale');
  const burst = breaths[before];
  if (!burst || burst.kind !== 'burst')
    throw new Error(`no exhale burst after a ${holdMs} ms hold`);
  return burst.burst as Burst;
}

describe('the engine stamps the released draw’s tier on the breath', () => {
  it('lands S / M / L for short, middle and long holds', () => {
    const short = exhaleFor(harness(), 500);
    expect(short.tier).toBe('S');
    expect(short.volumeMl).toBe(8);
    expect(short.smokeLayers).toEqual({ min: 1, max: 2 });
    expect(short.spreadRadiusPx).toBe(24);
    expect(short.riseSeconds).toBe(0.6);

    const middle = exhaleFor(harness(), 1500);
    expect(middle.tier).toBe('M');
    expect(middle.volumeMl).toBe(24);
    expect(middle.smokeLayers).toEqual({ min: 3, max: 4 });
    expect(middle.spreadRadiusPx).toBe(52);
    expect(middle.riseSeconds).toBe(1.2);

    // The default rod ends its own window before 2.5 s, so widen the window — the tier is the held
    // clock, and L starts at 2.0 s.
    const long = exhaleFor(harness({ settings: { puffDurationSec: 6 } }), 2500);
    expect(long.tier).toBe('L');
    expect(long.volumeMl).toBe(35);
    expect(long.smokeLayers).toEqual({ min: 5, max: 6 });
    expect(long.spreadRadiusPx).toBe(86);
    expect(long.riseSeconds).toBe(2.5);
  });

  it('stays on the short tier one side of a second and the middle tier the other', () => {
    expect(exhaleFor(harness(), 900).tier).toBe('S');
    expect(exhaleFor(harness({ settings: { puffDurationSec: 6 } }), 1100).tier).toBe('M');
    expect(exhaleFor(harness({ settings: { puffDurationSec: 6 } }), 1900).tier).toBe('M');
    expect(exhaleFor(harness({ settings: { puffDurationSec: 6 } }), 2100).tier).toBe('L');
  });

  it('grows the breath in count, width and life as the tier climbs', () => {
    const draws = IDS.map((_, i) =>
      exhaleFor(
        harness({ settings: { puffDurationSec: 6 }, seed: 7 + i }),
        [500, 1500, 2500][i] ?? 0,
      ),
    );
    const counts = draws.map((b) => b.count);
    const radii = draws.map((b) => b.radius.max);
    const lives = draws.map((b) => b.lifeMs.min);
    for (const series of [counts, radii, lives]) {
      expect(series[1]).toBeGreaterThan(series[0] ?? 0);
      expect(series[2]).toBeGreaterThan(series[1] ?? 0);
    }
  });
});

describe('a mouthed rod does not receive the tier library', () => {
  it('exhales on the slow branch and carries no tier fields', () => {
    const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'cigar' });
    lit(h);
    h.press('cigarette');
    h.run(2200);
    h.release('cigarette');
    const breath = h.bursts.findLast((e) => e.kind === 'burst' && e.burst.kind === 'exhale');
    expect(breath?.kind).toBe('burst');
    if (breath === undefined || breath.kind !== 'burst') throw new Error('no cigar exhale');
    const burst = breath.burst;
    expect(burst.tier).toBeUndefined();
    expect(burst.volumeMl).toBeUndefined();
    expect(burst.smokeLayers).toBeUndefined();
    expect(burst.spreadRadiusPx).toBeUndefined();
    expect(burst.riseSeconds).toBeUndefined();
  });
});

describe('the tier changes a picture, never a frozen parameter', () => {
  it('replays the same tiered breath from the same seed', () => {
    const walk = (seed: number): Burst[] => {
      const h = harness({ seed, settings: { puffDurationSec: 6 } });
      lit(h);
      const out: Burst[] = [];
      for (const ms of [500, 1500, 2500]) {
        const before = h.bursts.length;
        h.press('cigarette');
        h.run(ms);
        h.release('cigarette');
        out.push(
          ...h.bursts
            .slice(before)
            .filter((e): e is Extract<EngineEvent, { kind: 'burst' }> => e.kind === 'burst')
            .map((e) => e.burst),
        );
      }
      return out.filter((b) => b.kind === 'exhale');
    };
    expect(JSON.stringify(walk(99))).toBe(JSON.stringify(walk(99)));
    // And the stream is genuinely seeded rather than frozen.
    expect(JSON.stringify(walk(99))).not.toBe(JSON.stringify(walk(100)));
  });

  it('leaves the content bundle’s frozen parameters untouched', () => {
    // §7.4’s own acceptance rule: a change that moves duration / puffs / temperature / ash mass is
    // rejected without discussion. The tier recipe reads PUFF_TIERS only; the content it shapes
    // breath by breath is the engine’s own burst, so the content bundle must come back byte-equal
    // after every tier has been drawn.
    const frozen = FIXTURE.cigarettes.map((c) =>
      JSON.stringify({
        burnDuration: c.burnDuration,
        puffs: c.physical.puffs,
        temperature: c.physical.centerTempC,
        ashGrams: c.physical.ashGrams,
        puffProfile: c.puffProfile,
        smokeProfile: c.smokeProfile,
      }),
    );
    const h = harness({ settings: { puffDurationSec: 6 } });
    lit(h);
    for (const ms of [500, 1500, 2500]) {
      h.press('cigarette');
      h.run(ms);
      h.release('cigarette');
      h.run(400);
    }
    const after = FIXTURE.cigarettes.map((c) =>
      JSON.stringify({
        burnDuration: c.burnDuration,
        puffs: c.physical.puffs,
        temperature: c.physical.centerTempC,
        ashGrams: c.physical.ashGrams,
        puffProfile: c.puffProfile,
        smokeProfile: c.smokeProfile,
      }),
    );
    expect(after).toEqual(frozen);
  });
});

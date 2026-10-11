/**
 * §puffAnimations — the three inhale tiers and the nine lip actions, and the four rules the source
 * states as hard constraints: the tier is the press's own measured length, the dice pick only
 * *within* that tier, a pick never repeats the action before it, and the exhale is not random at
 * all. The fifth is §redlines.abstractMouthOnly: the mouth is a lip line and an airflow column, and
 * nothing else, so every deformation here is single-digit pixels.
 *
 * The last block is the seam the pure layer cannot see on its own: the engine has to roll once per
 * draw whatever the rod happens to be, because a 品鉴型 whose roll were skipped would fork the
 * deterministic stream §71 replays.
 */

import type { Rng } from '@puffly/shared';
import { createRng } from '@puffly/shared';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { describe, expect, it } from 'vitest';
import {
  LIP_ACTIONS,
  PUFF_TIERS,
  lipActionsFor,
  pickLipAction,
  puffTierFor,
  showsLipLine,
  type LipActionId,
  type PuffTier,
  type PuffTierId,
} from '../puffTier';
import { STEP_MS } from '../constants';
import { harness, lit } from './harness';

const TIERS: readonly PuffTierId[] = ['S', 'M', 'L'];

/** A generator that counts its own draws. `pickLipAction` only ever asks for `next()`. */
function counting(seed: number): { rng: Rng; draws: () => number } {
  const inner = createRng(seed);
  let n = 0;
  return {
    draws: () => n,
    rng: {
      next: () => {
        n += 1;
        return inner.next();
      },
    } as unknown as Rng,
  };
}

/** Hold the rod down one fixed step at a time, recording the action after every step. */
function holdAndRecord(
  h: ReturnType<typeof harness>,
  limitMs: number,
): { heldMs: number; ids: (LipActionId | null)[] } {
  const ids: (LipActionId | null)[] = [];
  let spent = 0;
  h.press('cigarette');
  while (spent < limitMs) {
    h.run(STEP_MS);
    const puff = h.state().cigarette.puff;
    ids.push(puff.lipAction);
    if (!puff.active) break;
    spent += STEP_MS;
  }
  return { heldMs: h.state().cigarette.puff.heldMs, ids };
}

describe('the tier is the press’s own length', () => {
  it('lands S below a second, M to two, and L from there', () => {
    expect(puffTierFor(0)).toBe('S');
    expect(puffTierFor(999)).toBe('S');
    expect(puffTierFor(1000)).toBe('M');
    expect(puffTierFor(1999)).toBe('M');
    expect(puffTierFor(2000)).toBe('L');
    // L's own range in the source is [2.0, 2.0] — ISO 3308 puts a single draw at 2.0 s / 35 ml and
    // the deep tier sits exactly on that ceiling. Past it there is no fourth tier to walk into.
    expect(puffTierFor(9000)).toBe('L');
    expect(puffTierFor(-500)).toBe('S');
  });

  it('carries the source’s own numbers for each tier', () => {
    expect(PUFF_TIERS.S).toMatchObject({
      label: '浅吸',
      volumeMl: 8,
      smokeLayers: [1, 2],
      spreadRadiusPx: 24,
      riseSeconds: 0.6,
    });
    expect(PUFF_TIERS.M).toMatchObject({
      label: '中吸',
      volumeMl: 24,
      smokeLayers: [3, 4],
      spreadRadiusPx: 52,
      riseSeconds: 1.2,
    });
    expect(PUFF_TIERS.L).toMatchObject({
      label: '深吸',
      volumeMl: 35,
      smokeLayers: [5, 6],
      spreadRadiusPx: 86,
      riseSeconds: 2.5,
    });
  });

  it('gets heavier in every column as the tier climbs', () => {
    const byTier = <T>(pick: (tier: PuffTier) => T): T[] => TIERS.map((id) => pick(PUFF_TIERS[id]));
    const series = [
      byTier((tier) => tier.volumeMl),
      byTier((tier) => tier.spreadRadiusPx),
      byTier((tier) => tier.riseSeconds),
      byTier((tier) => tier.smokeLayers[1]),
    ];
    for (const values of series) {
      const [first, second, third] = values;
      expect(second ?? 0).toBeGreaterThan(first ?? 0);
      expect(third ?? 0).toBeGreaterThan(second ?? 0);
    }
  });
});

describe('the nine lip actions stay inside the tier that earned them', () => {
  it('is three to a tier and nine in all', () => {
    expect(LIP_ACTIONS).toHaveLength(9);
    for (const tier of TIERS) expect(lipActionsFor(tier)).toHaveLength(3);
    expect(LIP_ACTIONS.map((action) => action.id).join(' ')).toBe('S1 S2 S3 M1 M2 M3 L1 L2 L3');
    // The id's prefix and its tier are the same fact stated twice; they may not disagree.
    for (const action of LIP_ACTIONS) expect(action.id[0]).toBe(action.tier);
  });

  it('never crosses a tier and never repeats the action just shown', () => {
    const { rng } = counting(7);
    for (const tier of TIERS) {
      let previous: LipActionId | null = null;
      const seen = new Set<LipActionId>();
      for (let draw = 0; draw < 400; draw += 1) {
        const action = pickLipAction(rng, tier, previous);
        expect(action.tier, `a ${tier} draw returned ${action.id}`).toBe(tier);
        expect(action.id, `${action.id} came up twice in a row`).not.toBe(previous);
        seen.add(action.id);
        previous = action.id;
      }
      // All three get used: a "pool" that only ever reached two would be a hidden second rule.
      expect(seen.size).toBe(3);
    }
  });

  it('spends exactly one draw per pick, whatever the exclusion did', () => {
    for (const tier of TIERS) {
      const { rng, draws } = counting(11);
      pickLipAction(rng, tier, null);
      expect(draws(), `${tier} with nothing to exclude`).toBe(1);
      const second = counting(12);
      pickLipAction(second.rng, tier, `${tier}1` as LipActionId);
      expect(second.draws(), `${tier} excluding one of three`).toBe(1);
    }
  });

  it('deforms the lip line by single-digit pixels, because the redline forbids more', () => {
    for (const action of LIP_ACTIONS) {
      for (const [key, value] of Object.entries(action.lip)) {
        if (typeof value !== 'number') continue;
        if (key === 'tiltDeg') {
          expect(Math.abs(value), `${action.id} tilt`).toBeLessThanOrEqual(4);
          continue;
        }
        expect(value, `${action.id} ${key}`).toBeLessThanOrEqual(6);
      }
    }
    // 最细 / 略细 / 最粗 / 最宽 are words in the source and stay words here: inventing a multiplier
    // for them would be this file's arithmetic, not the design's.
    const wordOnly = LIP_ACTIONS.filter((action) => action.column.note);
    expect(wordOnly.map((action) => action.id).join(' ')).toBe('S1 S2 L2');
  });
});

describe('the mouthed rods are not handed a lip line', () => {
  it('reads the rod’s own measurement, not a category name', () => {
    expect(showsLipLine(0)).toBe(true);
    // The core's own reading is binary: 「0 for a rod that is inhaled」. One millisecond of wanted
    // hold is a rod that holds, so no line is drawn for it.
    expect(showsLipLine(1)).toBe(false);
    expect(showsLipLine(2000)).toBe(false);
    // `savourMs` is 「how long this rod wants its smoke held in the mouth — 0 for a rod that is
    // inhaled」, so the decision is a number and cannot branch on a kind string at all. That is a
    // fact about the signature, which is why this file does not go reading source for it: §47
    // forbids Node built-ins in the pure layer, tests included.
    const takesOnlyANumber: (savourMs: number) => boolean = showsLipLine;
    expect(takesOnlyANumber(0)).toBe(true);
  });
});

describe('the engine rolls the action into the draw', () => {
  it('opens in the shallow tier and walks up as the hold crosses', () => {
    const shallow = harness();
    lit(shallow);
    const short = holdAndRecord(shallow, 600);
    const first = short.ids[0];
    expect(first, 'a draw that has begun has an action').not.toBeNull();
    expect(
      lipActionsFor('S').some((a) => a.id === first),
      `opened on ${String(first)}`,
    ).toBe(true);

    // The deep tier starts at 2.0 s, and the fixture rod ends a draw at its own ceiling long
    // before that. A long window is what makes the crossing reachable — §14 lets the player set
    // it, and this test is about the tier, not about the ceiling.
    const deep = harness({ settings: { puffDurationSec: 6 } });
    lit(deep);
    const long = holdAndRecord(deep, 2400);
    const last = long.ids[long.ids.length - 1] ?? null;
    expect(long.heldMs, 'the walk never reached the deep tier').toBeGreaterThanOrEqual(2000);
    expect(
      lipActionsFor('L').some((a) => a.id === last),
      `ended on ${String(last)}`,
    ).toBe(true);
    // And it passed through M rather than jumping: the tier is the clock, so the sequence has to
    // show an M-pool action between the S opening and the L ending.
    const mids = new Set(long.ids.filter((id) => id !== null));
    expect([...mids].some((id) => id.startsWith('M'))).toBe(true);
  });

  it('never repeats an action across two consecutive draws', () => {
    const h = harness();
    lit(h);
    let previous: LipActionId | null = null;
    let seen = 0;
    // Long enough between draws for the previous one to settle: a press the state refuses is not a
    // draw, and counting one as a repeat would be this test's error, not the engine's. Three draws
    // is what the walk produces; the pure layer above is where the 400-deep threading is proven.
    for (let attempt = 0; attempt < 80 && seen < 3; attempt += 1) {
      const before = h.state().cigarette.puff.count;
      h.press('cigarette');
      h.run(400);
      h.release('cigarette');
      h.run(200);
      const puff = h.state().cigarette.puff;
      if (puff.count === before) continue;
      const now = puff.lipAction;
      expect(now, `draw ${String(seen)} came back with no action`).not.toBeNull();
      expect(now, `draw ${String(seen)} repeated ${String(previous)}`).not.toBe(previous);
      previous = now;
      seen += 1;
    }
    expect(seen, 'the walk never got three draws').toBeGreaterThanOrEqual(3);
  });

  it('replays the same actions from the same presses', () => {
    const walk = (seed: number): (LipActionId | null)[] => {
      const h = harness({ seed });
      lit(h);
      const seen: (LipActionId | null)[] = [];
      for (const limit of [500, 1500, 2500, 700]) {
        seen.push(...holdAndRecord(h, limit).ids);
        h.release('cigarette');
        h.run(300);
      }
      return seen;
    };
    expect(walk(99)).toEqual(walk(99));
    // And the roll is not a no-op dressed up as determinism: a different seed does move it.
    expect(walk(99).join(' ')).not.toBe(walk(100).join(' '));
  });

  it('rolls for a 品鉴型 too, and the interface is what declines to draw it', () => {
    // Skipping the roll for the rods that never show a lip line would fork the stream on which rod
    // is in the hand — the same trap §71 already caught once with the flourish switch.
    const cigar = harness({ content: DEFAULT_CONTENT, cigaretteId: 'cigar' });
    lit(cigar);
    const read = holdAndRecord(cigar, 600);
    const id = read.ids[0] ?? null;
    expect(id, 'the draw came back with no action').not.toBeNull();
    const state = cigar.state().cigarette;
    // The exclusion is real and it is a measurement of the rod, so `showsLipLine` says no here.
    expect(state.readouts.savourMs, 'this rod is not a mouthed one').toBeGreaterThan(0);
    expect(showsLipLine(state.readouts.savourMs)).toBe(false);
  });
});

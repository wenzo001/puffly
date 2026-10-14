/**
 * The reveal, driven by the ledger that actually crosses a rung.
 *
 * `reveal.test.ts` pins `useJustLit` against hand-written id lists, and
 * `achievement-ladder.test.ts` pins that `data-fresh` reaches the row's animation. Neither drives
 * the *chain*: `achievementsFor(ledger)` → the reached ids → `useJustLit` → the ids a row is marked
 * with. That chain is the whole of §39's 它自己亮一下, and the gap was found by trying to verify it
 * from outside the page — a browser probe could not reach the moment, because the first rung sits at
 * a twelfth of the deck's two-month figure (13 sticks) and the engine exposes no test progress lever.
 *
 * It does not need one. `achievementsFor` is a pure function of a plain ledger, so the moment can be
 * driven exactly: hand it a ledger short of a rung, open the sheet, then hand it one past it. These
 * cases pin the three things that chain has to get right, each of which the isolated tests cannot see:
 *
 *  1. a rung that crosses while the sheet is open is the id that gets marked — the real achievement
 *     id, from the core's own table, not a string the shell made up;
 *  2. a ledger that moves *without* crossing a goal marks nothing — the ledger ticks constantly, and
 *     a tick is not a moment;
 *  3. the marked id is one the row can actually bind, i.e. it exists in `ACHIEVEMENTS` — a marked id
 *     with no row is a fade that never plays, which is the failure the whole feature is for.
 */

import { nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementsFor } from '@puffly/game-core';
import { useJustLit } from '../reveal';

/** The sheet's own derivation: the ids of the rungs the ledger has reached. */
const reachedIdsOf = (ledger: Parameters<typeof achievementsFor>[0], gust = 0): string[] =>
  achievementsFor(ledger, gust)
    .filter((rung) => rung.reached)
    .map((rung) => rung.achievement.id);

/** A rig wired the way `SessionSheet.vue` wires it: a ledger, an open flag, the reveal cache. */
function rig(initial: Parameters<typeof achievementsFor>[0], open: boolean) {
  const ledger = ref(initial);
  const isOpen = ref(open);
  const fresh = useJustLit(
    () => reachedIdsOf(ledger.value),
    () => isOpen.value,
  );
  return {
    fresh,
    /** The ledger moving under the sheet, as a real session would move it. */
    move(next: Parameters<typeof achievementsFor>[0]): void {
      ledger.value = next;
    },
    setOpen(open: boolean): void {
      isOpen.value = open;
    },
    settle: nextTick,
  };
}

/** The first sticks rung's own goal, read off the core's table rather than restated. */
const firstSticksGoal =
  ACHIEVEMENTS.find((achievement) => achievement.axis === 'sticks')?.goal ?? 0;

const empty = { sticks: 0, puffs: 0, ashGrams: 0, minutes: 0 };

describe('the reveal, driven by the ledger that crosses a rung (§39)', () => {
  it('the first sticks rung is a real goal, so the moment below is a real crossing', () => {
    // If this is 0 the rest of the file is measuring nothing: the deck's own pacing is what makes
    // "13 sticks" a moment rather than a number picked for the test.
    expect(firstSticksGoal).toBeGreaterThan(1);
  });

  it('marks the rung that crossed while the sheet was looking, by its own id', async () => {
    const sheet = rig(empty, false);
    sheet.setOpen(true);
    await sheet.settle();
    expect(sheet.fresh.value.size, 'opening marks nothing').toBe(0);

    // One stick short of the goal: the ledger moved, and nothing crossed.
    sheet.move({ ...empty, sticks: firstSticksGoal - 1 });
    await sheet.settle();
    expect(sheet.fresh.value.size, 'a tick that crossed no goal is not a moment').toBe(0);

    // Past it. This is the moment §39 asks for.
    sheet.move({ ...empty, sticks: firstSticksGoal });
    await sheet.settle();
    const marked = [...sheet.fresh.value];
    expect(marked.length).toBe(1);
    // And it is an id the core's own table owns, so a row exists to bind it.
    expect(ACHIEVEMENTS.map((achievement) => achievement.id)).toContain(marked[0]);
  });

  it('marks nothing for a ledger that moves without crossing, however far it moves', async () => {
    // Start *past* the first rung, so there is already a lit id on screen. A ledger that then moves
    // without crossing anything must not re-mark it: the row is lit, the moment is over.
    //
    // This is the case that makes the diff real. Starting from an empty ledger, `litIds` is `[]`
    // until the crossing — so a `justLit = [...ids]` mutation marks nothing either, and the test
    // passes against a broken reveal. Measured: with that mutation in place this case reddens and
    // the empty-ledger ones stay green, which is why it exists.
    const sheet = rig({ ...empty, sticks: firstSticksGoal }, true);
    await sheet.settle();
    expect(sheet.fresh.value.size, 'arriving on an already-lit rung is not a moment').toBe(0);

    // Three ticks inside the *next* rung: the ratio moves, the goal is not met, nothing is news.
    const puffsGoal = ACHIEVEMENTS.find((a) => a.axis === 'puffs')?.goal ?? 0;
    for (const puffs of [1, puffsGoal - 1, 2]) {
      sheet.move({ ...empty, sticks: firstSticksGoal, puffs });
      await sheet.settle();
    }
    expect(sheet.fresh.value.size, 'progress is not a reveal').toBe(0);
  });

  it('marks several rungs when one session crosses more than one', async () => {
    // A long break crosses the sticks rung and a puffs rung together. Both are news; the cache
    // holds both, and neither is dropped for the other.
    const sheet = rig(empty, true);
    await sheet.settle();
    const puffsGoal = ACHIEVEMENTS.find((a) => a.axis === 'puffs')?.goal ?? 0;
    sheet.move({ ...empty, sticks: firstSticksGoal, puffs: puffsGoal });
    await sheet.settle();
    expect(sheet.fresh.value.size).toBe(2);
  });

  it('gives the row a fill as well as a flag: the marked id is the one whose ratio is 1', async () => {
    // The sweep and the fade are bound to the same flag, so the marked rung must be the one whose
    // bar is full — a fade on a bar that is still short would say "lit" over a row that reads 4/13.
    const sheet = rig(empty, true);
    await sheet.settle();
    sheet.move({ ...empty, sticks: firstSticksGoal });
    await sheet.settle();
    const marked = [...sheet.fresh.value];
    const rungs = achievementsFor({ ...empty, sticks: firstSticksGoal });
    for (const id of marked) {
      const rung = rungs.find((entry) => entry.achievement.id === id);
      expect(rung, `the marked id ${id} is not a rung the ledger reached`).toBeDefined();
      expect(rung?.ratio, `${id} is marked but its bar is not full`).toBe(1);
    }
  });

  it('wipes the moment when the sheet closes, so an old fade is not news', async () => {
    // The other half of the same rule: a rung that lit while the sheet was open is a moment, and
    // the moment ends when the sheet does. Reopening shows a plain row — nothing here is a second
    // account of what was lit, so nothing is kept to be replayed later.
    //
    // This case is what makes the wipe real: without it, a mutation that drops the
    // `fresh.value = new Set()` in the close arm passes every other case here, because none of them
    // closes the sheet.
    const sheet = rig(empty, true);
    await sheet.settle();
    sheet.move({ ...empty, sticks: firstSticksGoal });
    await sheet.settle();
    expect(sheet.fresh.value.size, 'the crossing happened while the sheet was open').toBe(1);

    sheet.setOpen(false);
    await sheet.settle();
    expect(sheet.fresh.value.size, 'the moment ends with the sheet').toBe(0);

    // And reopening on an unchanged ledger shows nothing: the rung is lit, and it is old news.
    sheet.setOpen(true);
    await sheet.settle();
    expect(sheet.fresh.value.size, 'reopening is not a second moment').toBe(0);
  });
});

/**
 * The ash column and the weather are on two different clocks — SPEC.md §18, §22.
 *
 * A gust knocks the ash off (§22: the room does things that are not asked for), and the column grows
 * as the cherry eats the rod (§18). The first is counted in wall minutes, the second in millimetres
 * of tobacco, so the ratio between them is set by how fast the rod burns — and the deck's own minute
 * figures moved that ratio out of balance. Four of the eleven rods then met so much weather per
 * millimetre of ash that the column was knocked off sooner than it could regrow, and `ash.ready` —
 * the beat the deck calls 磕灰, one of the six the whole loop is made of — never arrived at all:
 * measured on an unattended burn, `night` `long` `cigarillo` and `cigar` each ran past their own full
 * burn length with `ready` never once true.
 *
 * The rule that fixes it is not a threshold nobody justified: a gust may take a column whenever the
 * rod still has another one left in it, and not when it does not. Nothing new is invented — the two
 * quantities are the same ones the ash system already uses — and 灰量, 时长 and 口数 are untouched,
 * so this is not a burn-rate retune wearing a disguise.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { STEP_MS, WorldEventId } from '@puffly/game-core';
import { harness, lit } from '../packages/game-core/src/__tests__/harness';

interface Walk {
  id: string;
  /** When the column first asks to be flicked, as a share of this rod's own burn. */
  readyAt: number;
  /** How many times the room knocked the ash off on the way there. */
  gusts: number;
  /** …of which while the rod was still young (the flavour that must survive). */
  earlyGusts: number;
}

/** An unattended burn: lit, then left alone until the cherry has nothing to eat. */
async function walk(id: string): Promise<Walk> {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId: id });
  lit(h);
  const total = h.state().cigarette.burnMsTotal;
  let waited = 0;
  let steps = 0;
  let readyAt = -1;
  while (h.state().cigarette.rodRemaining > 0.0005 && waited < total * 1.1) {
    h.run(STEP_MS * 3);
    waited += STEP_MS * 3;
    if (readyAt < 0 && h.state().cigarette.ash.ready) readyAt = waited / total;
    // The walk is real CPU work — about 25 600 engine steps a rod — and a worker that does a whole
    // roster in one synchronous stretch cannot answer vitest's own heartbeat. Measured on this
    // build 2026-10-11: the eleven rods in one stretch ran 4.58 s without a single one of its
    // 100 ms timers firing, and on a contended full-suite run that same file was measured at 66 s,
    // past the ~30 s a worker gets to report a task — which is how a run with 1067 tests passed
    // and no failed assertion still leaves the gate red. Nothing here is on a wall clock (the loop
    // advances by `STEP_MS`), so handing the thread back cannot move a number: it only lets the
    // worker be reachable while it thinks.
    steps += 1;
    if (steps % 2000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const gusts = h.events.filter(
    (event) => event.kind === 'world' && event.occurrence.type === WorldEventId.ASH_FALL,
  );
  return {
    id,
    readyAt,
    gusts: gusts.length,
    earlyGusts: gusts.filter((event) => event.atMs < total * 0.7).length,
  };
}

/** Measured once and read by both claims below, so the two cannot be about different runs. */
let measured: Promise<Walk[]> | null = null;
const walks = (): Promise<Walk[]> =>
  (measured ??= (async () => {
    const walked: Walk[] = [];
    for (const rod of DEFAULT_CONTENT.cigarettes) walked.push(await walk(rod.id));
    return walked;
  })());

describe('a gust may take the ash, but never the rod’s last column (§18, §22)', () => {
  // The budget is for the whole roster's lives walked once, and it is stated because the walk is
  // real work: alone this file runs in about a second, and in a full-suite run — where every worker
  // is doing the same thing at the same time — that same second has been measured past vitest's
  // 5 s default. A green build that turns red because the machine is busy is a red nobody can read.
  // 2026-10-08 raised it again: on a box already carrying two browser suites, this test was killed at
  // the 30 s ceiling it had itself been given, with every ASH line printed and no assertion involved.
  // A ceiling for CPU work is a statement about the machine, so it gets the margin, not the claim.
  it('leaves every rod the content ships a column worth flicking', async () => {
    for (const w of await walks()) {
      console.log(
        `ASH ${w.id.padEnd(10)} readyAt=${w.readyAt.toFixed(3)} gusts=${String(w.gusts)} ` +
          `early=${String(w.earlyGusts)}`,
      );
      // Inside the rod's own life, not after it: an unattended burn still gets to the beat.
      expect(w.readyAt, `${w.id} never grew a flickable column`).toBeGreaterThanOrEqual(0);
      expect(w.readyAt, `${w.id} only got its column after the rod was gone`).toBeLessThan(1);
    }
  }, 90_000);

  it('still lets the room knock the ash off while the rod has more to give', async () => {
    // The other half. A guard that simply refused every gust would leave the case above green and
    // quietly delete §22's weather from the ash, so this asks for the gust itself, on every rod.
    for (const w of await walks()) {
      expect(w.gusts, `${w.id} never met an ash-falling gust`).toBeGreaterThan(0);
      expect(w.earlyGusts, `${w.id} only met gusts at the very end`).toBeGreaterThan(0);
    }
  });
});

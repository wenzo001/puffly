/**
 * The column has to be one line, not a string of beads — SPEC.md §15, §16.
 *
 * Found by rasterizing a frame rather than by a metric: once the smoke was given the drag air
 * actually exerts on it, it stopped travelling, and a stopped column is only as continuous as its
 * emission rate. The picture showed the smouldering thread as four or five separate dots with dark
 * air between them. Nothing about σx or elongation can see that — a row of dots is narrow.
 *
 * So this measures the one thing the eye reports: walking from the cherry to the top of the plume,
 * how much of the way is covered by some puff's own drawn disc, and how wide the widest stretch that
 * is not is. The second of those used to be a *count* of uncovered stretches, which turned out to be
 * a property of the ruler: a 24-slice walk over a thread 30 puffs tall calls one lost slice a hole,
 * while the same lost slice on a stub is a fifth of a puff. It reddened on a content number that
 * changes nothing about the air (a rod's burn length, which sets no emission rate), so the bound is
 * now stated in the puff's own radii instead.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { Burst } from '@puffly/game-core';
import { FIELD_SCALE, intakeBurst } from '../intake';
import { PUFF_SPREAD } from '../paint';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;
const BANDS = 24;

/** The thread a smouldering cherry draws, aired for `seconds` and measured as it stands. */
function columnAfter(
  cigaretteId: string,
  seconds: number,
): {
  continuity: number;
  live: number;
  /** The widest stretch of dark air, counted in the puff's own drawn radii. */
  hole: number;
  /** The thread's height, counted in puffs' own drawn radii. */
  heights: number;
} {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId });
  lit(h);
  const pending: Burst[] = [];
  h.engine.on((event) => {
    // The thread only. Ash and sparks are the same pool's business but a different object, and
    // including them measured a falling flake's trail as if it were a gap in the smoke.
    if (event.kind === 'burst' && event.burst.kind === 'drift') pending.push(event.burst);
  });
  const pool = new ParticlePool(1400);
  const steps = Math.round((seconds * 1000) / STEP);
  for (let i = 0; i < steps; i++) {
    h.engine.advance(STEP);
    for (const burst of pending.splice(0, pending.length)) {
      intakeBurst(burst, pool, { densityScale: 1 });
    }
    pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, (i * STEP) / 1000, null);
  }

  const discs: { x: number; y: number; r: number }[] = [];
  pool.forEachActive((particle) => {
    // The radius the sprite is actually blitted at, in stage units — the same expression
    // `drawSmoke` uses. Reading the renderer's own constant rather than restating the product is
    // the point: this line used to leave out the spread and the depth scale, which measured a
    // thread about a third narrower than the one being drawn and called the difference a gap.
    discs.push({
      x: particle.x,
      y: particle.y,
      r:
        particle.radius *
        particle.scale *
        particle.size *
        (0.72 + particle.depth * 0.5) *
        PUFF_SPREAD,
    });
  });
  expect(discs.length, 'the cherry was still smoking').toBeGreaterThan(20);

  const ys = discs.map((disc) => disc.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const spine = discs.reduce((sum, disc) => sum + disc.x, 0) / discs.length;
  const radii = discs.map((disc) => disc.r).sort((a, b) => a - b);
  const medianRadius = radii[Math.floor(radii.length / 2)] ?? 0;
  const span = Math.max(bottom - top, 1e-6);
  let covered = 0;
  let run = 0;
  let widestRun = 0;
  for (let band = 0; band < BANDS; band++) {
    const centre = top + (span * (band + 0.5)) / BANDS;
    // Six radii, not three: a thread long enough to see also meanders far enough that its own mean
    // line is not where every band of it sits. Three counted a wandering column as a column with
    // holes in it, which is the opposite of what this is for.
    const hit = discs.some(
      (disc) => Math.abs(disc.y - centre) <= disc.r && Math.abs(disc.x - spine) <= disc.r * 6,
    );
    if (hit) {
      covered += 1;
      run = 0;
    } else {
      run += 1;
      widestRun = Math.max(widestRun, run);
    }
  }
  // One band of dark air is not a fixed distance: the same 1/24 of a 6-radius stub is a fifth of a
  // puff, while 1/24 of a 44-radius thread is two puffs. Converted back into radii the measure stops
  // depending on how the ruler happens to slice it, which is what the gap *count* used to depend on.
  return {
    continuity: covered / BANDS,
    live: discs.length,
    hole: (widestRun * span) / medianRadius / BANDS,
    heights: span / medianRadius,
  };
}

const ids = DEFAULT_CONTENT.cigarettes.map((cigarette) => cigarette.id);

describe('the thread is continuous (§15)', () => {
  it('measures every cigarette the content ships', () => {
    expect(ids.length).toBe(11);
  });

  it.each(ids)('%s draws one thread, not a row of dots', (id) => {
    const column = columnAfter(id, 6);
    console.log(
      `COLUMN ${id.padEnd(10)} continuity=${column.continuity.toFixed(2)} ` +
        `heights=${column.heights.toFixed(1)} hole=${column.hole.toFixed(2)} ` +
        `live=${String(column.live)}`,
    );
    // Continuous: no dark air between one puff and the next.
    expect(column.continuity).toBeGreaterThanOrEqual(0.9);
    // And the widest hole is measured in puffs, not in slices of the ruler. Two of them is the point
    // where a column stops reading as a line; the roster's worst today is 1.28 — `long`, whose thread
    // stands 30 puffs tall, so one slice of it is more air than one slice of a stub.
    // This one is a fence rather than the net, and it is worth being exact about why: at a quarter of
    // the shipped emission rate a thread does open up (`ember` measures 2.35 there), but that same
    // mutation also takes the coverage below 0.9, so the case reddens either way. Nothing milder opens
    // a hole at all — half the rate, or the same average delivered in pulses, leaves the column shorter
    // rather than broken, which is the honest consequence of being given less smoke, and is what
    // `heights` and the disc floor above are for.
    expect(column.hole).toBeLessThanOrEqual(2);
    // And long enough to read as a thread rather than a dot. Counted in the puff's own drawn
    // radius, because a floor in stage units is just a number: one disc is one height, so a
    // column under three of them is a smudge sitting on the cherry, however continuous it is.
    expect(column.heights).toBeGreaterThanOrEqual(3);
  });
});

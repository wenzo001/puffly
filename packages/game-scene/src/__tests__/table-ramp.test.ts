/**
 * The table's depth ramp — the band that carries the lower third of the frame.
 *
 * Before it, the table was one flat ink below the nosing, and the lower third of every frame read as
 * a cut-out void. Measured 2026-10-12 with `tests/smoke/scan-table.mjs` on the served build: the
 * phone portrait band was 33.3% of the stage at mean luminance 22.2 with 60% of its pixels in the
 * darkest bin, and the desktop band was 35.2% at mean 11.2 with 87% in the darkest bin. Making the
 * key light brighter moved those means to 28.6 and 18.5 without changing the bin shares — the band
 * was *flat*, which is why the light did not give it a surface.
 *
 * Three facts have to hold for the ramp to be a surface rather than a wash:
 *   it must stay *dark* — a lit table loses the room's mood, the table is the darkest surface in the
 *   room by design (`tableEdgeY`); it must rise *toward the player* at every venue, which is the
 *   only cue that says "this is a plane receding"; and the whole span must be well under the wall,
 *   so the ramp reads as depth and never as a second wall.
 */
import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS } from '@puffly/game-content';
import { backgroundStructure, tableSurfaceRgb } from '../backdrop';
import { harness } from '../../../game-core/src/__tests__/harness';
import { DEFAULT_CONTENT, ENVIRONMENTS } from '@puffly/game-content';
import { interiorEdgeInk } from '../room';

/** A phone in portrait, the composition the audit measured. */
const PHONE = { w: 393, h: 852 };

const INK = interiorEdgeInk([24, 23, 25]);
const WALL = [45, 42, 41] as const;
const sum = (rgb: readonly [number, number, number]) => rgb[0] + rgb[1] + rgb[2];

describe("the table's depth ramp stays a surface, not a wash", () => {
  it('holds the table below the wall it sits against at both ends of the ramp', () => {
    // A ramp brighter than the wall would read as a lit floor, not a table.
    const far = tableSurfaceRgb(INK, WALL, 0);
    const near = tableSurfaceRgb(INK, WALL, 1);
    for (const rgb of [far, near]) {
      expect(rgb[0]).toBeLessThan(WALL[0]!);
      expect(rgb[1]).toBeLessThan(WALL[1]!);
      expect(rgb[2]).toBeLessThan(WALL[2]!);
    }
    // And the whole span is short of the wall: 0.08 of the way at the wall edge, 0.26 at the near
    // edge. A ramp that reached the wall would measure as a second wall behind the first.
    expect(sum(near)).toBeLessThan(sum(WALL));
  });

  it('rises monotonically from the wall edge to the near edge, at every venue', () => {
    for (const room of ENVIRONMENTS) {
      const state = harness({ content: DEFAULT_CONTENT, environmentId: room.id }).state();
      const table = backgroundStructure(state, PHONE.w, PHONE.h).table;
      // A non-interior venue has no table, and the ramp simply does not exist there — that is not
      // a failure, so the guard is that every venue the audit measured has one.
      if (table === null) continue;
      expect(sum(table.nearRgb!), `${room.id} does not rise toward the player`).toBeGreaterThan(
        sum(table.farRgb!),
      );
      // The span has to be wide enough to be a gradient at all: a handful of counts is not a ramp.
      expect(
        sum(table.nearRgb!) - sum(table.farRgb!),
        `${room.id}'s ramp is too shallow to read`,
      ).toBeGreaterThanOrEqual(5);
      // The near edge must not outshine the nosing, the one bright line on the table.
      expect(sum(table.nearRgb!), `${room.id}'s ramp outshines its nosing`).toBeLessThan(
        sum(table.nosingRgb),
      );
    }
  });

  it('keeps the far end as the slab’s own ink, so the quad and the slab never disagree', () => {
    // The table mesh is still `interiorEdgeInk`. The ramp starts at exactly that colour and only
    // lifts toward the player, so a venue change moves both the same way and there is no seam at
    // the wall edge — a ramp that began already a few counts off the ink would show one.
    expect(tableSurfaceRgb(INK, WALL, 0)).toEqual(INK);
    // A black slab stays black at the far end: the ramp never invents light at the wall edge.
    expect(tableSurfaceRgb([0, 0, 0], WALL, 0)).toEqual([0, 0, 0]);
  });

  it('is monotone in between, and both ends are the formula the renderer writes', () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map((d) => sum(tableSurfaceRgb(INK, WALL, d)));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
    // The exact near end, so a change to the mix has to be a deliberate one: 0.42 of the way from the
    // ink to this wall, rounded per channel.
    expect(tableSurfaceRgb(INK, WALL, 1)).toEqual([29, 28, 28]);
  });

  it('never reads an unclamped depth, the way a fraction is still read as one', () => {
    expect(tableSurfaceRgb(INK, WALL, 2)).toEqual(tableSurfaceRgb(INK, WALL, 1));
    expect(tableSurfaceRgb(INK, WALL, -5)).toEqual(tableSurfaceRgb(INK, WALL, 0));
    expect(tableSurfaceRgb(INK, WALL, Number.NaN)).toEqual(tableSurfaceRgb(INK, WALL, 0));
  });

  it('hands the structure the two tones the renderer writes into the quad', () => {
    const state = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' }).state();
    const table = backgroundStructure(state, PHONE.w, PHONE.h).table!;
    // The far end is the slab's own ink, verbatim, and the near end is 42% of the way to the
    // wall — quiet-room's `night` variant (the harness's wall clock is 21:30): horizon rgb(52,50,48),
    // silhouette rgb(32,32,33), so wall rgb(42,41,41) and ink rgb(24,24,25). ink→wall at 0.42
    // = (24 + 0.42×18, 24 + 0.42×17, 25 + 0.42×16) = (31.6, 31.1, 31.7) → rgb(32,31,32).
    expect(table.ink).toEqual([24, 24, 25]);
    expect(table.farRgb).toEqual(table.ink);
    expect(table.nearRgb).toEqual([32, 31, 32]);
    expect(table.nearRgb).not.toEqual(table.farRgb);
  });
});

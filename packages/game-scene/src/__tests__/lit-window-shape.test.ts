/**
 * The lit window is a window: wider than it is tall, in CSS pixels.
 *
 * `Geometry.details` seeds five clutter pieces per place and `backgroundStructure` gives each kind a
 * shape of its own. Kind 2 is 「远处一扇亮着的窗」 (SPEC §22.z), and both of its axes came from the seed:
 * `w = min(0.09, detail.w)` against `h = min(0.12, detail.h)`. Those are two different units — a
 * fraction of the box's *width* and a fraction of its *height* — so on a 393 × 852 stage the pair
 * landed at 17.4 × 102 CSS px, a bar six times taller than wide.
 *
 * Measured off the served build on 2026-10-15 with `tests/smoke/probe-bar-owner.mjs`, which reads the
 * scene graph rather than the picture: the two kind-2 panels were the only meshes over
 * `x 222..239, y 254..469`, both `rgb(58,61,66)` at α 0.3, both 102.2 px tall. They were the brightest
 * marks on `quiet-room`'s wall (L 63.5 against the wall's 49.7) and read as two lit streaks, which is
 * #132 — "the clutter reads as bars" — for the one kind the spec gives a name and a shape.
 *
 * So the rule this file judges is not "is it pretty": the seed owns the window's place and its width,
 * and the height follows from the width at the window's own aspect. Reconnecting `h` to the seed's
 * `detail.h` puts the aspect back at 0.17 and goes red here.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, ENVIRONMENTS } from '@puffly/game-content';
import { backgroundStructure, geometryFor } from '../backdrop';
import { harness, type Harness } from '../../../game-core/src/__tests__/harness';

/** A phone in portrait — the composition the Demo drew, and the one the device suite drives. */
const PHONE = { w: 393, h: 852 };

const stateFor = (id: string, day: number): Harness =>
  harness({
    content: DEFAULT_CONTENT,
    environmentId: id,
    // One day per step of `day`: the clutter is seeded per day (§71), so this walks the vocabulary.
    wallClockMs: Date.UTC(2026, 8, 29 + day, 21, 30, 0),
  });

/**
 * The boxes a place paints for its lit windows, found by the seed's own anchor rather than by colour:
 * every detail is pushed at its seeded `(x, y)` unchanged, and the clutter layer is the only one at
 * α 0.3 (the furniture's tones are 0.45–0.86). Matching on `detailTone`'s rgb looked natural and was
 * wrong — `backgroundStructure` reads the *live* `state.world.light`, not `environment.lighting`, so
 * the two palettes differ and the filter silently returned nothing.
 */
function windowBoxes(h: Harness) {
  const state = h.state();
  const seeded = geometryFor(state).details.filter((detail) => detail.kind === 2);
  const boxes = backgroundStructure(state, PHONE.w, PHONE.h).boxes;
  const painted = boxes.filter(
    (box) => box.alpha === 0.3 && seeded.some((detail) => detail.x === box.x && detail.y === box.y),
  );
  return {
    seeded,
    painted,
    boxCount: boxes.length,
    // What a red here has to be read against: the clutter is seeded for every background kind, but
    // only the interior family paints it, so an outdoor place shows `painted 0 of seeded 2` while
    // painting nothing at all.
    context: `${state.environment.id}/${state.environment.background.kind} boxes=${boxes.length}`,
  };
}

describe('the lit window keeps a window’s proportions', () => {
  it('is wider than it is tall in CSS pixels, in every place that rolls one', () => {
    let pieces = 0;
    for (const env of ENVIRONMENTS) {
      for (let day = 0; day < 12; day++) {
        const h = stateFor(env.id, day);
        const { seeded, painted, boxCount, context } = windowBoxes(h);
        // Where the place paints clutter at all, every lit window the seed rolled has to be on the
        // wall. An outdoor place paints none (`backgroundStructure` returns before the clutter), and
        // that is judged by `boxCount`, not by the empty `painted` set — written against the total
        // this function returned rather than a `kind` list copied here, because a judgement with two
        // homes is how one condition goes missing.
        if (boxCount > 0) {
          expect(
            painted,
            `${context} day ${day}: seeded ${seeded.length} lit windows`,
          ).toHaveLength(seeded.length);
        }
        for (const box of painted) {
          const widthPx = box.w * PHONE.w;
          const heightPx = box.h * PHONE.h;
          pieces += 1;
          expect(
            widthPx / heightPx,
            `${env.id} day ${day}: ${widthPx.toFixed(1)} × ${heightPx.toFixed(1)} px`,
          ).toBeGreaterThan(1.25);
        }
      }
    }
    expect(
      pieces,
      'no place rolled a lit window, so the check above judged nothing',
    ).toBeGreaterThan(20);
  });

  it('stays on the wall and off the table edge', () => {
    for (const env of ENVIRONMENTS) {
      const { painted } = windowBoxes(stateFor(env.id, 3));
      for (const box of painted) {
        expect(box.y + box.h, `${env.id} window below the wall`).toBeLessThanOrEqual(0.7);
      }
    }
  });
});

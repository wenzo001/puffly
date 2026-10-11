/**
 * The tray's pile of tapped ash, §2's `132,486` box.
 *
 * The Demo draws the ash the tray is holding twice over: a gram figure on the tray (S5's 「2.1g」)
 * and a 126×22 stadium lying in its near lip. The number had a reader and the mound did not —
 * `PROP_INK.ashPile` sat in the ink table with nobody consuming it, which is how a constant goes
 * stale. These checks are the mound's arithmetic, taken from the Demo's own boxes rather than from
 * a fitted value: every span below is a fraction of the tray it lies in, so the pile rides the
 * prop scale without an anchor the layout never published.
 *
 * The squash is the part worth pinning. The scene draws the tray as an oblique ellipse
 * (`TRAY_FLATTEN` = 0.42) while the Demo draws it face-on, so a pile that keeps the Demo's 22 px
 * unsquashed hangs off the bottom of a tray it is supposed to be inside. Lying in the plane keeps
 * all three Demo numbers and the tray's own rim consistent — that is what the last check proves.
 */

import { describe, expect, it } from 'vitest';
import { ASH_PILE, PROP_INK, TRAY_FLATTEN, ashPileMetrics } from '../props';

describe('the tray’s ash pile (§2 S5)', () => {
  it('is the Demo’s 126×22 box in a 190 tray', () => {
    expect(ASH_PILE.widthShare).toBeCloseTo(126 / 190, 10);
    expect(ASH_PILE.heightShare).toBeCloseTo(22 / 190, 10);
  });

  it('drops by the Demo’s 80 px against the tray’s own half', () => {
    // Tray `100,322` of 190×190 → centre 417; pile `132,486` of 126×22 → centre 497.
    expect(ASH_PILE.dropShare).toBeCloseTo((497 - 417) / (190 / 2), 10);
  });

  it('scales with the tray it lies in', () => {
    const small = ashPileMetrics(50);
    const big = ashPileMetrics(100);
    expect(big.width / small.width).toBeCloseTo(2, 10);
    expect(big.height / small.height).toBeCloseTo(2, 10);
    expect(big.dy / small.dy).toBeCloseTo(2, 10);
  });

  it('sits in the tray’s plane, so the mound is horizontal and squashed like the tray', () => {
    const metrics = ashPileMetrics(100);
    // Across the tray the Demo's span holds exactly; along it, the same 22/190 seen end-on.
    expect(metrics.width).toBeCloseTo(200 * (126 / 190), 8);
    expect(metrics.height).toBeCloseTo(200 * (22 / 190) * TRAY_FLATTEN, 8);
    // A strip hugging the near rim, not a slab across the bowl: thinner than its own drop.
    expect(metrics.height).toBeLessThan(Math.abs(metrics.dy));
  });

  it('stays inside the tray it sits in', () => {
    const radius = 100;
    const metrics = ashPileMetrics(radius);
    const rim = radius * TRAY_FLATTEN;
    // The near edge of the mound and the near rim of the tray: a pile hanging outside the object
    // that holds it is the failure this line exists for, and it is what the Demo's 22 px would
    // become if it were taken unsquashed against a tray drawn obliquely.
    expect(Math.abs(metrics.dy) + metrics.height / 2).toBeLessThanOrEqual(rim);
  });

  it('is the two ends of the Demo’s ramp, and nothing in between invented', () => {
    // `linear-gradient(180deg,#4A453E,#2A2621)` — the convention this table already follows for the
    // lighter: a gradient over a flat-shaded band becomes its two ends, never a third colour.
    expect(PROP_INK.ashPile).toBe('#4a453e');
    expect(PROP_INK.ashPileDeep).toBe('#2a2621');
  });
});

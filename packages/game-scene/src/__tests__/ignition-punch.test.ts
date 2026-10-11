/**
 * The deck's 冲击感 (S7): 「点火瞬间整体画面轻微推近 + 边缘压暗」, judged as a shape.
 *
 * This suite is the successor of the Canvas 2D file of the same name, which retired with the raster
 * suites on 2026-10-10 while the picture it judged went missing with it — `IGNITION_IMPACT` was still
 * exported and read by nobody. The numbers below are the ones the accepted implementation produced
 * (peak 1.0349, 25 frames up, an exact return to 1.00000, edge alpha one punch per frame), so this
 * file re-pins a look that was already signed off rather than inventing a new one.
 *
 * The last group is the half that is easy to lose: the push-in pivots on the cherry *because* the
 * shell hit-tests against the anchors the core publishes (§37). A zoom that slid the ember would move
 * the thing under the player's thumb for the length of the punch, so "the ember does not move" is not
 * a nicety here — it is the constraint that decides which point the transform turns around.
 */
import { describe, expect, it } from 'vitest';
import {
  IGNITION_IMPACT,
  ignitionEdgeAlpha,
  ignitionPunch,
  ignitionZoom,
  punchPivot,
  stepIgnition,
} from '../paint';

/** The app's own cadence, so the frame count is the one a player gets. */
const FRAME_MS = 1000 / 60;

const run = (frames: number, reducedMotion = false): number[] => {
  let impact = 1;
  const seen: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    impact = stepIgnition(impact, FRAME_MS, reducedMotion);
    seen.push(ignitionPunch(impact));
  }
  return seen;
};

describe('the punch lands and then releases (§S7 冲击感)', () => {
  it('is already almost whole on the first drawn frame', () => {
    const first = run(1);
    expect(first[0] ?? 0).toBeGreaterThan(0.99);
    expect(ignitionZoom(first[0] ?? 0, 1)).toBeCloseTo(1.0349, 4);
  });

  it('never overshoots the authored peak', () => {
    const peak = Math.max(...run(30));
    expect(peak).toBeLessThanOrEqual(1);
    expect(1 + IGNITION_IMPACT.zoom * peak).toBeLessThanOrEqual(1.035);
  });

  it('stands off for about 25 frames and lets go of the last one', () => {
    const frames = Math.round(IGNITION_IMPACT.ttlMs / FRAME_MS);
    expect(frames).toBe(25);
    const seen = run(frames + 1);
    expect(seen[frames - 1] ?? 0).toBeGreaterThan(0);
    // The final frame is exactly still: a punch that leaves a residue would leave the picture
    // permanently 0.4% too close, and nothing would ever notice but the next break.
    expect(seen[frames]).toBe(0);
    expect(ignitionZoom(seen[frames] ?? 0, 1)).toBe(1);
  });

  it('falls the whole way down, so it reads as a hit rather than a slide', () => {
    const seen = run(26);
    for (let frame = 1; frame < seen.length; frame += 1) {
      expect(seen[frame] ?? 0, `frame ${String(frame)} rose`).toBeLessThanOrEqual(
        seen[frame - 1] ?? 0,
      );
    }
    // Eased, not linear: a constant release was the thing the original comment argued against.
    const mid = seen[12] ?? 0;
    expect(mid).toBeGreaterThan(1 - 13 / 25);
  });

  it('is not drawn at all when the player asked for less motion', () => {
    expect(run(26, true).every((punch) => punch === 0)).toBe(true);
    expect(ignitionZoom(0, 1)).toBe(1);
    expect(ignitionEdgeAlpha(0, 1)).toBe(0);
  });

  it('carries the edge darkening on the same punch, and the dial scales both halves', () => {
    const seen = run(10);
    for (const punch of seen) {
      expect(ignitionEdgeAlpha(punch, 1)).toBeCloseTo(IGNITION_IMPACT.edge * punch, 10);
    }
    // The cartoon side of the 80/20 rule: at the shipped split the punch is itself, and a dial
    // pinned to 写实 gives it to the simulation and nothing to the camera.
    expect(ignitionZoom(seen[0] ?? 0, 1)).toBeGreaterThan(ignitionZoom(seen[0] ?? 0, 0.5));
    expect(ignitionEdgeAlpha(seen[0] ?? 0, 0)).toBe(0);
  });
});

describe('the push-in turns on the cherry, not on the frame (§37)', () => {
  const ember: readonly [number, number] = [0.31, -0.22];

  it('leaves the ember exactly where the core put it', () => {
    const zoom = ignitionZoom(1, 1);
    const pivot = punchPivot(ember, zoom);
    // What the scene graph does: world = pivot + zoom · local, and the child started at the ember.
    expect(pivot.x + zoom * ember[0]).toBeCloseTo(ember[0], 12);
    expect(pivot.y + zoom * ember[1]).toBeCloseTo(ember[1], 12);
  });

  it('and moves everything else outward from it, by exactly the zoom', () => {
    const zoom = ignitionZoom(1, 1);
    const pivot = punchPivot(ember, zoom);
    const tray: readonly [number, number] = [-0.4, -0.62];
    const before = Math.hypot(tray[0] - ember[0], tray[1] - ember[1]);
    const after = Math.hypot(
      pivot.x + zoom * tray[0] - ember[0],
      pivot.y + zoom * tray[1] - ember[1],
    );
    expect(after).toBeCloseTo(before * zoom, 12);
    expect(after).toBeGreaterThan(before);
  });

  it('is no transform at all on a frame with no punch', () => {
    const pivot = punchPivot(ember, 1);
    // `toBeCloseTo` rather than `toBe(0)`: a negative coordinate times zero is −0, which the scene
    // graph draws identically — the claim is that nothing is offset, not which zero comes back.
    expect(pivot.x).toBeCloseTo(0, 12);
    expect(pivot.y).toBeCloseTo(0, 12);
  });
});

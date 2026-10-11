/**
 * The rain's machine-checked promises, after the painted layer's half retired with it (2026-10-10).
 *
 * Two things live here now: the shared generator still reads as motion, and the frame `rainLines`
 * hands the 3D layer carries the fields only the 3D side reads. The pixel claims that used to sit
 * between them (two-frame pairing, per-place streak counts, the indoor dust arm) drew through
 * `drawRain` / `drawDust` on a fake canvas; those went with the 2D renderer's raster suites, and
 * the 3D side's own proof is the real-device suite's rain check plus the contracts below.
 *
 * §59's original complaint — 背景的抖动，说不出哪里在动 — is why the ratios exist at all: whether
 * a moving mark reads as motion is a ratio, how far it goes in one frame against how long it is,
 * so that is what this measures.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { STEP_MS, type GameStateView } from '@puffly/game-core';
import { rainGeometry, rainLines } from '../weather';
import { harness } from '../../../game-core/src/__tests__/harness';

const FRAME_SECONDS = STEP_MS / 1000;
/** A phone in portrait, which is the layout the ratios are about. */
const STAGE_PX = 844;

describe('the rain falls instead of flickering (§59)', () => {
  it('gives every streak a length it can actually be seen moving', () => {
    const streaks = rainGeometry('neon-street', 'rain');
    expect(streaks.length).toBeGreaterThan(20);
    let worst = 0;
    for (const streak of streaks) {
      worst = Math.max(worst, (streak.speed * FRAME_SECONDS) / streak.length);
    }
    console.log(`RAIN step/length worst=${worst.toFixed(3)} n=${String(streaks.length)}`);
    // Shipped: 0.124. The old 0.02..0.07 lengths at 0.75..1.55 speed: 0.775, which is three quarters
    // of the streak gone between one frame and the next.
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.4);
  });

  it('still comes down, so the flicker was not cured by a freeze', () => {
    const streaks = rainGeometry('neon-street', 'rain');
    // `travel` is in stage units, so the stage height converts it to the pixels on a phone.
    const slowest = Math.min(...streaks.map((s) => s.speed)) * FRAME_SECONDS * STAGE_PX;
    const fastest = Math.max(...streaks.map((s) => s.speed)) * FRAME_SECONDS * STAGE_PX;
    console.log(`RAIN px/frame ${slowest.toFixed(1)}..${fastest.toFixed(1)}`);
    // Under ~2 px a frame reads as a still photograph with dust on it; over ~14 px a 1 px line
    // reads as a strobe again. The old streaks were at 11..22.
    expect(slowest).toBeGreaterThan(2);
    expect(fastest).toBeLessThan(14);
  });

  it('falls as one sheet, not as fifty-four separate random objects', () => {
    // 「别抖动 就是随机的…要不然让它慢慢地去动」. Speed is what reads as random here: a wide band of
    // speeds over the same height is fifty-four independent things to track, and a narrow band is
    // one weather front. The ratio is the shape of that difference, not an absolute tempo.
    const streaks = rainGeometry('neon-street', 'rain');
    const speeds = streaks.map((s) => s.speed);
    const ratio = Math.max(...speeds) / Math.min(...speeds);
    console.log(
      `RAIN speed spread ${Math.min(...speeds).toFixed(3)}..${Math.max(...speeds).toFixed(3)} ratio=${ratio.toFixed(3)}`,
    );
    expect(ratio).toBeGreaterThan(1);
    // Measured, not read off the formula: the fbm draws never reach the ends of their own range, so
    // the shipped band is 1.202 (0.274..0.329), the wider band before it was 1.356 (0.505..0.685),
    // and the original stutter was 1.623 (0.889..1.443). 1.4 would have been inside the noise —
    // it left the widened band green, which is how this line got moved down to 1.3.
    expect(ratio).toBeLessThan(1.3);
  });
});

/**
 * The frame `rainLines` hands out is what both painters draw: the canvas mapped it through
 * `viewport.px`, the 3D layer through the camera. These pin the fields the 3D side alone reads —
 * its axis is depth, and a streak of the wrong slant or an alpha of the wrong band would never
 * show up in a 2D pixel.
 */
describe('the frame the 3D layer reads (`rainLines`)', () => {
  const stateFor = (environmentId: string, weather: 'rain' | 'storm' | 'clear'): GameStateView => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId });
    const s = h.state() as GameStateView;
    return {
      ...s,
      nowMs: 40000,
      world: { ...s.world, weather, ambientGain: 0.6 },
      smoke: { ...s.smoke, drift: { ...s.smoke.drift, x: 0.4 } },
    } as GameStateView;
  };

  it('answers null where the painted layer paints nothing at all', () => {
    expect(rainLines(stateFor('neon-street', 'clear'), 40, false)).toBeNull();
    const indoors = DEFAULT_CONTENT.environments.find((e) => !e.background.weatherVisible);
    expect(rainLines(stateFor(indoors!.id, 'rain'), 40, false)).toBeNull();
  });

  it('carries the slant, alpha and width the streaks are drawn in', () => {
    const frame = rainLines(stateFor('neon-street', 'rain'), 40, false);
    expect(frame).not.toBeNull();
    expect(frame!.lines.length).toBeGreaterThan(20);
    // drift.x 0.4 at the painter's ×2.2 is 0.88, and every line's own rise has to carry it.
    const slant = Math.max(-0.5, Math.min(0.5, 0.4 * 2.2));
    for (const line of frame!.lines) {
      expect(line.y2 - line.y1).toBeGreaterThan(0);
      expect(line.x2 - line.x1).toBeCloseTo(slant * (line.y2 - line.y1), 10);
    }
    expect(frame!.alpha).toBeCloseTo(0.16 + 0.6 * 0.16, 10);
    expect(frame!.widthUnits).toBeCloseTo(0.0016, 10);
    // Reduced motion dims the sheet to its measured floor, not to nothing.
    const calm = rainLines(stateFor('neon-street', 'rain'), 40, true);
    expect(calm!.alpha).toBeCloseTo(0.1, 10);
  });
});

/**
 * §20's tray answers a drag — the three readings, stepped the way the retired 2D layer stepped them.
 *
 * This is the half of that behaviour that can be proved without a browser: what makes the tray rock,
 * how hard, how long it takes to settle, and what lights its rim. The pixels are the real-device
 * suite's job (it drags the rod and reads the meshes); the rules are this file's.
 *
 * Every number here is transcribed from `drawAshtray` and its caller in the layer that retired on
 * 2026-10-11 (`git show 0f39d48^:packages/game-renderer/src/{props,renderer}.ts`), not re-derived —
 * the claim being kept is 那格已验收的功能没有被重写掉, and a re-derived constant would be a new
 * opinion about how a tray moves.
 */

import { describe, expect, it } from 'vitest';
import {
  stepTrayFeedback,
  trayRock,
  TRAY_FEEDBACK,
  TRAY_FEEDBACK_START,
  type TrayFeedback,
} from '../props';

/** The frame the scene hands it: a clamped dt and the realism dial already scaled. */
function frame(over: Partial<Parameters<typeof stepTrayFeedback>[1]> = {}) {
  return { grams: 0, dropped: 0, dragged: false, dtMs: 16, cartoon: 1, ...over };
}

function run(feedback: TrayFeedback, frames: number, over = {}): TrayFeedback {
  let now = feedback;
  for (let i = 0; i < frames; i += 1) now = stepTrayFeedback(now, frame(over));
  return now;
}

describe('the mound reports what the tray is holding', () => {
  it('is the grams over the full figure, clamped at both ends', () => {
    expect(TRAY_FEEDBACK.fullGrams).toBe(0.36);
    expect(stepTrayFeedback(TRAY_FEEDBACK_START, frame({ grams: 0 })).load).toBe(0);
    expect(stepTrayFeedback(TRAY_FEEDBACK_START, frame({ grams: 0.18 })).load).toBeCloseTo(0.5, 6);
    expect(stepTrayFeedback(TRAY_FEEDBACK_START, frame({ grams: 0.36 })).load).toBeCloseTo(1, 6);
    expect(stepTrayFeedback(TRAY_FEEDBACK_START, frame({ grams: 5 })).load).toBe(1);
  });

  it('stays below the floor the 2D layer drew nothing above', () => {
    // `if (feedback.load > 0.02)` — a tray with a few milligrams is an empty tray on screen.
    expect(TRAY_FEEDBACK.moundFloor).toBe(0.02);
    const almost = stepTrayFeedback(TRAY_FEEDBACK_START, frame({ grams: 0.005 }));
    expect(almost.load).toBeGreaterThan(0);
    expect(almost.load > TRAY_FEEDBACK.moundFloor).toBe(false);
  });
});

describe('landing ash gives it weight', () => {
  it('takes no impulse on the first frame, when there is nothing to compare the count against', () => {
    // `lastDropped >= 0` was the guard: a session restored from a save lands nothing, and a tray that
    // rocked on load would be reporting an event nobody performed.
    const first = stepTrayFeedback(TRAY_FEEDBACK_START, frame({ dropped: 7 }));
    expect(first.wobble).toBe(0);
    expect(first.dropped).toBe(7);
  });

  it('kicks by the units that fell, and by nothing else', () => {
    const before: TrayFeedback = { ...TRAY_FEEDBACK_START, dropped: 7 };
    const one = stepTrayFeedback(before, frame({ dropped: 8 }));
    // Half, less this frame's own drain: the impulse and the settling are one rule, not two numbers.
    expect(one.wobble).toBeGreaterThan(0.4);
    expect(one.wobble).toBeLessThan(TRAY_FEEDBACK.perDrop);
    const two = stepTrayFeedback(before, frame({ dropped: 9 }));
    expect(two.wobble).toBeGreaterThan(one.wobble);
  });

  it('obeys the realism dial, because a rock is an exaggeration and not a measurement', () => {
    const before: TrayFeedback = { ...TRAY_FEEDBACK_START, dropped: 0 };
    const real = stepTrayFeedback(before, frame({ dropped: 1, cartoon: 0 }));
    const cartoon = stepTrayFeedback(before, frame({ dropped: 1, cartoon: 1 }));
    expect(real.wobble).toBe(0);
    expect(cartoon.wobble).toBeGreaterThan(0);
  });

  it('settles back to level on its own clock', () => {
    const now = run({ ...TRAY_FEEDBACK_START, wobble: 1 }, 40, { dropped: 0 });
    expect(now.wobble).toBe(0);
    // and not before roughly the drain window, so the settling is a duration and not a blink
    const half = run({ ...TRAY_FEEDBACK_START, wobble: 1 }, 10, { dropped: 0 });
    expect(half.wobble).toBeGreaterThan(0);
    expect(half.wobble).toBeLessThan(1);
  });
});

describe('the rim lights while the rod is being carried', () => {
  it('eases in rather than snapping, so a drag that stops does not leave a switch on', () => {
    const one = stepTrayFeedback(TRAY_FEEDBACK_START, frame({ dragged: true, dtMs: 16 }));
    expect(one.invited).toBeGreaterThan(0);
    expect(one.invited).toBeLessThan(0.3);
    const warm = run(TRAY_FEEDBACK_START, 40, { dragged: true });
    expect(warm.invited).toBeGreaterThan(0.95);
    const cold = run(warm, 40, { dragged: false });
    expect(cold.invited).toBeLessThan(0.05);
  });
});

describe('the rock is a released oscillator', () => {
  it('starts at full tilt and swings back through level', () => {
    const full: TrayFeedback = { ...TRAY_FEEDBACK_START, wobble: 1 };
    expect(trayRock(full, 0)).toBeCloseTo(TRAY_FEEDBACK.amplitude, 6);
    // Half a period is the other extreme: the argument is nowMs / period, so cos reaches -1 at
    // `period · π`, which is the swing a released oscillator makes on its way back through level.
    expect(trayRock(full, TRAY_FEEDBACK.periodMs * Math.PI)).toBeCloseTo(
      -TRAY_FEEDBACK.amplitude,
      6,
    );
  });

  it('is exactly level when nothing landed', () => {
    expect(trayRock(TRAY_FEEDBACK_START, 0)).toBe(0);
    expect(trayRock(TRAY_FEEDBACK_START, 1234)).toBe(0);
  });

  it('is scaled by the impulse, so a small landing tips the tray a little', () => {
    const half = trayRock({ ...TRAY_FEEDBACK_START, wobble: 0.5 }, 0);
    expect(half).toBeCloseTo(TRAY_FEEDBACK.amplitude * 0.5, 6);
  });
});

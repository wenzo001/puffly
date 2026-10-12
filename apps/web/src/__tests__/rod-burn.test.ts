/**
 * The rod's burning end, pinned to the core's own burn state.
 *
 * This file exists because the scene has no component harness: `placeRod` and whatever it draws can
 * only be judged from a screenshot, and "the burn line is where the simulation says it is" is not a
 * claim a person can make by looking. So the arithmetic lives in `rodBurn.ts` where a test can call
 * it, and these cases are the ones that would have caught the two ways it can silently stop being
 * true — a second definition of "burnt", and a constant.
 */
import { describe, expect, it } from 'vitest';
import {
  BURN_END_SHARE,
  GRAIN,
  paperGrainPixels,
  rodBurnLineAt,
  rodMouthShare,
  tipAshShare,
} from '../components/rodBurn';

describe('the burn line is the core’s own burn state, read once', () => {
  it('two different burn amounts give two different positions', () => {
    const fresh = rodBurnLineAt(1);
    const half = rodBurnLineAt(0.5);
    const spent = rodBurnLineAt(0.05);
    // Printed, because "it moved" is the weakest form of this claim — how far it moved is the fact.
    console.log(`BURN line fresh=${fresh.toFixed(3)} half=${half.toFixed(3)} spent=${spent.toFixed(3)}`);
    expect(fresh).toBe(0);
    expect(half).toBeCloseTo(0.5, 6);
    expect(spent).toBeCloseTo(0.95, 6);
    // Strictly forward, so a rod never un-burns between two readings.
    expect(spent).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(fresh);
  });

  it('the same burn amount twice gives the same value (the positive control)', () => {
    // Without this, a `rodBurnLineAt` that returned a clock or a random draw would pass the case
    // above — both of those give two different answers for two different inputs as well.
    for (const remaining of [1, 0.73, 0.5, 0.314, 0.05, 0]) {
      expect(rodBurnLineAt(remaining), String(remaining)).toBe(rodBurnLineAt(remaining));
    }
  });

  it('an out-of-range or unreadable reading clamps instead of leaving the rod', () => {
    // A resumed break can hand back a hair over 1 (`engine.ts`'s `restoreOpenBreak` spends the wall
    // clock on the rod) and a burnt-out one a hair under 0. A front outside its own tube would draw
    // the burn line past the lit end, which is worse than one pinned to it.
    expect(rodBurnLineAt(1.02)).toBe(0);
    expect(rodBurnLineAt(-0.02)).toBe(1);
    expect(rodBurnLineAt(Number.NaN)).toBe(0);
  });

  it('advances monotonically across the whole band, with no dead zone', () => {
    // The failure this catches is a ramp that saturates early: `1 - min(1, remaining * 2)` would
    // have the line stop moving for the entire second half of the rod.
    let previous = -1;
    for (let step = 0; step <= 40; step += 1) {
      const value = rodBurnLineAt(1 - step / 40);
      expect(value, `step ${String(step)}`).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe('the paper grain is baked, longitudinal, and identical every run', () => {
  it('is the same bytes twice, so the texture is not a second source of §71 drift', () => {
    expect(Array.from(paperGrainPixels())).toEqual(Array.from(paperGrainPixels()));
  });

  it('is the declared size, all opaque, and never a flat fill', () => {
    const pixels = paperGrainPixels();
    expect(pixels.length).toBe(GRAIN.columns * GRAIN.rows * 4);
    let min = 255;
    let max = 0;
    for (let at = 0; at < pixels.length; at += 4) {
      expect(pixels[at + 3], `texel ${String(at / 4)} alpha`).toBe(255);
      // Grey on purpose: the paper's own ink decides the colour, this only multiplies it.
      expect(pixels[at]).toBe(pixels[at + 1]);
      expect(pixels[at]).toBe(pixels[at + 2]);
      min = Math.min(min, pixels[at] ?? 255);
      max = Math.max(max, pixels[at] ?? 0);
    }
    console.log(`GRAIN columns=${String(GRAIN.columns)} min=${String(min)} max=${String(max)}`);
    // "Subtle" is a number: a spread that vanishes is a texture nobody can see, and one that fills
    // the range is dirt on the lens rather than paper.
    expect(max - min).toBeGreaterThanOrEqual(8);
    expect(max - min).toBeLessThanOrEqual(40);
  });

  it('varies along the rod far more than around it, which is what paper looks like', () => {
    const { columns, rows } = GRAIN;
    const pixels = paperGrainPixels();
    const at = (x: number, y: number): number => pixels[(y * columns + x) * 4] ?? 0;
    let alongSpread = 0;
    let acrossSpread = 0;
    for (let x = 0; x < columns; x += 1) {
      alongSpread += Math.abs(at(x, 0) - at((x + 1) % columns, 0));
    }
    for (let y = 0; y < rows; y += 1) {
      acrossSpread += Math.abs(at(0, y) - at(0, (y + 1) % rows));
    }
    console.log(
      `GRAIN along=${String(alongSpread)} across=${String(acrossSpread)} (rows=${String(rows)})`,
    );
    // The whole point of the field: fibres run down the tube. If this inverts, the grain has become
    // isotropic and the rod reads as concrete — which is the mistake the shapes are here to stop.
    expect(alongSpread).toBeGreaterThan(acrossSpread);
  });
});

describe('the tip’s collar grows with the ash the core says has accumulated', () => {
  it('a fuller column is a bigger collar, and zero ash is still a lit collar', () => {
    const bare = tipAshShare(0, 1);
    const half = tipAshShare(0.5, 1);
    const full = tipAshShare(1, 1);
    console.log(
      `ASH collar bare=${bare.toFixed(3)} half=${half.toFixed(3)} full=${full.toFixed(3)}`,
    );
    // Not a constant: three readings of one function, three different sizes.
    expect(half).toBeGreaterThan(bare);
    expect(full).toBeGreaterThan(half);
    // A just-lit cigarette has a glowing tip before it has any ash, so the floor is not zero —
    // and it is the floor rather than a second number written down twice.
    expect(bare).toBeGreaterThan(0);
  });

  it('a dark rod wears no collar, whatever the column says', () => {
    // The other half: `ash.ratio` can still be non-zero on the frame a rod is put out, and a dead
    // rod showing a glowing collar is the same lie as a cherry that keeps glowing while it burns.
    expect(tipAshShare(1, 0)).toBe(0);
  });

  it('reads the ratio it was handed rather than re-deriving one', () => {
    // Positive control for the same claim as the burn line's: same input twice, same output.
    for (const ratio of [0, 0.25, 0.6, 1]) {
      expect(tipAshShare(ratio, 0.8), String(ratio)).toBe(tipAshShare(ratio, 0.8));
    }
  });
});

describe('the crimp is at the mouth, not at the burning end', () => {
  it('narrows the mouth and leaves the whole lit end alone', () => {
    // `t` is the rod's own parametrisation: 0 at the mouth, 1 at the lit tip. A cigarette is rolled
    // shut at the end you put your lips on, so the narrow end is `t` near 0.
    const mouth = rodMouthShare(0);
    const inside = rodMouthShare(BURN_END_SHARE * 0.5);
    const nearTip = rodMouthShare(0.95);
    const tip = rodMouthShare(1);
    console.log(
      `MOUTH share t0=${mouth.toFixed(3)} t${(BURN_END_SHARE * 0.5).toFixed(2)}=${inside.toFixed(3)} t.95=${nearTip.toFixed(3)} t1=${tip.toFixed(3)}`,
    );
    // The mouth is measurably narrower than the tube.
    expect(mouth).toBeLessThan(0.8);
    // The lit end is untouched — that is the bug this pins: the crimp used to be written
    // `t >= 1 - crimpSpan`, which pinched the end the cherry, the burn line and the ash collar
    // all land on (`pointAt(1)`), so the burning end read as the mouth.
    expect(tip).toBe(1);
    expect(nearTip).toBe(1);
    expect(rodMouthShare(0.99)).toBe(1);
    expect(rodMouthShare(BURN_END_SHARE)).toBe(1);
    // And it closes cosinely rather than stepping: a point inside the easing span sits between the
    // mouth and the tube, rather than the whole span being one size.
    expect(inside).toBeGreaterThan(mouth);
    expect(inside).toBeLessThan(1);
  });

  it('the narrowing is monotone outward from the mouth', () => {
    let widest = 0;
    for (let t = 0; t <= BURN_END_SHARE; t += BURN_END_SHARE / 12) {
      const share = rodMouthShare(t);
      expect(share).toBeGreaterThanOrEqual(widest - 1e-9);
      widest = Math.max(widest, share);
    }
    expect(widest).toBe(1);
  });

  it('is a pure function of its input (positive control for the same claim)', () => {
    for (const t of [0, 0.01, 0.08, 0.16, 0.3, 1]) {
      expect(rodMouthShare(t), String(t)).toBe(rodMouthShare(t));
    }
    // A nonsense `t` cannot put the crimp outside the tube: it lands at the lit end.
    expect(rodMouthShare(Number.NaN)).toBe(1);
    expect(rodMouthShare(2)).toBe(1);
    expect(rodMouthShare(-1)).toBe(rodMouthShare(0));
  });
});

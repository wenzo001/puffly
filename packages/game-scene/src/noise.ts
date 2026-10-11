/**
 * Noise and velocity fields — SPEC.md §15.
 *
 * A cheap hash-based value noise with fractal sums, plus a curl of it. Curl gives the
 * smoke a swirling, divergence-free drift that never looks like a sprite scrolling past:
 * it is the difference between "a smoke PNG" and "smoke".
 *
 * Deterministic for a given seed, which is what lets §71 replay look identical too.
 */

const UNIT = 1 / 4294967296;

function hash2(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) * UNIT;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise on a unit lattice, returning -1..1. */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return (top + (bottom - top) * yf) * 2 - 1;
}

/** Three octaves: enough texture to look organic, cheap enough for 1400 particles. */
export function fbm2(x: number, y: number, seed = 0): number {
  return (
    noise2(x, y, seed) * 0.6 +
    noise2(x * 2.1, y * 2.1, seed + 17) * 0.28 +
    noise2(x * 4.3, y * 4.3, seed + 41) * 0.12
  );
}

/**
 * Curl of a 2D scalar field: `(dF/dy, -dF/dx)`. Sampling a small epsilon keeps it stable
 * at any particle count.
 */
export function curl2(
  x: number,
  y: number,
  seed: number,
  epsilon = 0.35,
): { vx: number; vy: number } {
  const n1 = fbm2(x, y + epsilon, seed);
  const n2 = fbm2(x, y - epsilon, seed);
  const n3 = fbm2(x + epsilon, y, seed);
  const n4 = fbm2(x - epsilon, y, seed);
  return {
    vx: (n1 - n2) / (2 * epsilon),
    vy: -(n3 - n4) / (2 * epsilon),
  };
}

/** Slow, bounded wander used for ember flicker and ash tremble (§17, §18, §59). */
export function wander(tSeconds: number, seed: number): number {
  return fbm2(tSeconds * 0.9, tSeconds * 0.37, seed);
}

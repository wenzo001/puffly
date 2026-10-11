/**
 * Weather and air life — SPEC.md §22, §24, §25 — the **frame** half.
 *
 * This module used to be two painters' shared copy, then one painter and the scene; since the
 * painted layer retired (2026-10-10) what is here is the data the scene draws from: seeded streaks
 * that fall with the wind, and the room's slow dust motes. Geometry is generated once per
 * (environment, weather) and reused, so a frame costs a handful of numbers instead of a
 * random-number fight.
 *
 * The stroke colour and line width ride in the frame (`RAIN_TINT`, `widthUnits`) rather than in a
 * painter, so the slant/alpha/width contract cannot drift between readers.
 */

import { clamp01 } from '@puffly/shared';
import type { GameStateView } from '@puffly/game-core';
import { fbm2 } from './noise';

export interface Streak {
  x: number;
  phase: number;
  speed: number;
  length: number;
}

interface Mote {
  x: number;
  y: number;
  drift: number;
  size: number;
  seed: number;
}

/**
 * How far a streak falls before it is recycled, in stage units. A streak starts at `stage.y - 0.1`
 * and is clipped once its head is 0.05 past the bottom, so the whole of the wrap happens off-screen:
 * recycling a streak is invisible, which is why there is no fade to soften it.
 */
const RAIN_TRAVEL = 1.4;

const cache = new Map<string, { streaks: Streak[]; motes: Mote[] }>();

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function geometryFor(environmentId: string, weather: string) {
  const key = `${environmentId}:${weather}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashOf(environmentId);
  const heavy = weather === 'storm' ? 1 : weather === 'rain' ? 0.6 : 0;
  const streaks: Streak[] = [];
  const count = Math.round(heavy * 90);
  for (let i = 0; i < count; i++) {
    streaks.push({
      x: (fbm2(i * 1.7, seed, 3) + 1) / 2,
      phase: ((fbm2(i * 2.9, seed, 7) + 1) / 2) * RAIN_TRAVEL,
      // A streak has to be several times longer than the distance it travels in one frame, or
      // consecutive frames share nothing and the eye reads teleporting dashes rather than falling
      // water. At the old 0.75..1.55 with a length of 0.02..0.07 a streak moved 11..22 px per
      // frame while being 17..59 px long: it stuttered, and that stutter is the thing in the
      // background the player could not name an algorithm for.
      //
      // The band is kept narrow on purpose. Fifty-four speeds that differ by a factor of two do not
      // read as weather, they read as fifty-four separate random objects, and 「别那么随机」 is about
      // that: one sheet, drifting down at nearly the same pace, is what rain through a window is.
      speed: 0.26 + ((fbm2(i * 0.7, seed, 11) + 1) / 2) * 0.08,
      length: 0.1 + ((fbm2(i * 1.3, seed, 13) + 1) / 2) * 0.06,
    });
  }

  const motes: Mote[] = [];
  for (let i = 0; i < 26; i++) {
    motes.push({
      x: (fbm2(i * 2.2, seed, 17) + 1) / 2,
      y: 0.12 + ((fbm2(i * 1.1, seed, 19) + 1) / 2) * 0.62,
      drift: (fbm2(i * 3.3, seed, 23) + 1) / 2,
      size: 0.0012 + ((fbm2(i * 4.1, seed, 29) + 1) / 2) * 0.0026,
      seed: i,
    });
  }

  const built = { streaks, motes };
  cache.set(key, built);
  return built;
}

/** The generated rain of one scene, for the guard that measures the fall against the streak. */
export const rainGeometry = (environmentId: string, weather: 'rain' | 'storm'): Streak[] =>
  geometryFor(environmentId, weather).streaks;

/** The stroke every rain line is drawn in, sRGB — the one colour both the scene and any older reader use. */
export const RAIN_TINT: [number, number, number] = [206, 218, 232];

/** One streak of rain in stage fractions, top point to bottom point. */
export interface RainLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RainFrame {
  lines: RainLine[];
  alpha: number;
  widthUnits: number;
}

/**
 * One frame of rain, in stage fractions — the one copy every reader draws from. `null` is the
 * field's own answer to "this venue has no sky in frame or no weather to show", which is a state a
 * venue change can leave standing for a whole session.
 *
 * `y` starts at −0.1 without the painted layer's `stage.y` term: `stageBoxFor` centres on x only,
 * so `stage.y` is 0 in every box the game can make, and this is the same number that layer was
 * adding.
 */
export function rainLines(
  state: GameStateView,
  seconds: number,
  reducedMotion: boolean,
): RainFrame | null {
  if (state.world.weather !== 'rain' && state.world.weather !== 'storm') return null;
  // Streaks are the sky seen from somewhere. A stairwell, a desk or a room has no sky in frame, so
  // drawing water across it puts particles in a place they cannot be — which is exactly the thing a
  // player ends up describing as "背景的抖动，我不知道是什么". Inside, the weather still arrives the
  // other ways: the light drops, the wind still pushes the column, the room still sounds like rain.
  if (!state.environment.background.weatherVisible) return null;
  const { streaks } = geometryFor(state.environment.id, state.world.weather);
  if (streaks.length === 0) return null;

  const slant = Math.max(-0.5, Math.min(0.5, state.smoke.drift.x * 2.2));
  const alpha = reducedMotion ? 0.1 : 0.16 + clamp01(state.world.ambientGain) * 0.16;
  const lines: RainLine[] = [];
  for (const streak of streaks) {
    const travel = (seconds * streak.speed + streak.phase) % RAIN_TRAVEL;
    const y = -0.1 + travel;
    if (y > 1.05) continue;
    const x = streak.x + slant * travel;
    lines.push({ x1: x, y1: y, x2: x + slant * streak.length, y2: y + streak.length });
  }
  return { lines, alpha, widthUnits: 0.0016 };
}

/**
 * One frame of the room's dust, in stage fractions and stage-unit radii — the one copy every reader
 * draws from. Always on: the room's own light is what it hangs in, and a talk of weather does not
 * switch it off. The visible half of `smoke.turbulence` — the field is a slow weather (guarded in
 * §22), so swinging the motes wider with it cannot shiver, which is what dust actually does when
 * the air starts turning.
 */
export function dustMotes(
  state: GameStateView,
  seconds: number,
  reducedMotion: boolean,
): Array<{ x: number; y: number; radius: number; alpha: number }> {
  const { motes } = geometryFor(state.environment.id, state.world.weather);
  const light = 0.25 + state.world.light.ambient * 0.75;
  const speed = reducedMotion ? 0 : 1;
  const churn = 1 + clamp01(state.smoke.turbulence) * 0.6;
  const out: Array<{ x: number; y: number; radius: number; alpha: number }> = [];
  for (const mote of motes) {
    const wobble = fbm2(seconds * 0.08 * speed + mote.seed, mote.drift * 10, 31);
    const x = (mote.x + wobble * 0.05 * churn + seconds * 0.004 * speed * state.world.wind) % 1;
    const y = mote.y + Math.sin(seconds * 0.21 * speed + mote.seed) * 0.012 * churn;
    const radius = mote.size * (1 + Math.abs(wobble) * 0.6);
    const alpha = clamp01(0.05 + light * 0.12 + wobble * 0.05);
    if (alpha <= 0.01) continue;
    out.push({ x, y, radius, alpha });
  }
  return out;
}

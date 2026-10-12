/**
 * The backdrop as data — moved here with the painted layer's retirement (2026-10-10).
 *
 * This is the painted picture told as shapes: the sky's three stops, the wall band, the table
 * edge, the seeded clutter and furniture, and the two pools of light — so the scene stands the
 * room up without a second copy of any number. The interior family (room / desk / stairwell /
 * corner) is what this covers; the outdoor families still owe the scene their blocks, ridge,
 * steps and neon.
 */

import { mixRgb, type Rgb } from '@puffly/shared';
import type { CigaretteStateId, GameStateView } from '@puffly/game-core';
import { fbm2 } from './noise';
import { interiorEdgeInk, skyPalette, type StageBoxFrac } from './room';

export interface Geometry {
  blocks: { x: number; y: number; w: number; h: number; lights: number[] }[];
  ridge: number[];
  bokeh: { x: number; y: number; r: number; warm: boolean }[];
  neon: { x: number; y: number; w: number; h: number; hue: number }[];
  /** The overhead flight of a stairwell: each entry is one tread's rising edge, left to right. */
  steps: number[];
  /**
   * The things that make a room a particular room: a pipe, a hanging flex, a lit window nobody is
   * in, a stain. Seeded per scene *and per day*, so the corner you sit in tomorrow has its bin on
   * the other side, while a replay of today's break puts every one of them back exactly where it
   * was (§71).
   */
  details: { x: number; y: number; w: number; h: number; kind: number }[];
}

const cache = new Map<string, Geometry>();

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** Exported so the 3D layer renders the same seeded room rather than seeding its own (§71). */
export function geometryFor(state: GameStateView): Geometry {
  const environmentId = state.environment.id;
  const background = state.environment.background;
  // The day is part of the seed, so the room's clutter moves tomorrow and not between two
  // frames of the same break. A per-frame salt would be the shiver §59 says a picture must not have.
  const salt = state.progress.level + state.progress.dayNumber * 31;
  const key = `${environmentId}:${background.kind}:${salt}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashOf(environmentId) + salt * 7919;
  const blocks: Geometry['blocks'] = [];
  if (background.kind === 'city' || background.kind === 'street' || background.kind === 'window') {
    const count = background.kind === 'window' ? 9 : 16;
    for (let i = 0; i < count; i++) {
      const x = ((fbm2(i * 1.7, seed, 3) + 1) / 2) * 0.98;
      const w = 0.03 + ((fbm2(i * 2.3, seed, 7) + 1) / 2) * 0.07;
      const h = 0.1 + ((fbm2(i * 0.9, seed, 11) + 1) / 2) * 0.34;
      const lights: number[] = [];
      const lit = Math.floor(((fbm2(i, seed, 13) + 1) / 2) * 8);
      for (let j = 0; j < lit; j++) lights.push((fbm2(j * 3.1, i * 2 + seed, 17) + 1) / 2);
      blocks.push({ x, y: 0.72 - h, w, h, lights });
    }
  }

  const ridge: number[] = [];
  if (background.kind === 'mountain') {
    for (let i = 0; i <= 64; i++) {
      ridge.push(0.6 + fbm2(i * 0.09, seed, 5) * 0.13 + Math.sin(i * 0.21 + seed) * 0.03);
    }
  }

  const bokeh: Geometry['bokeh'] = [];
  if (background.kind === 'window' || background.kind === 'street') {
    for (let i = 0; i < 26; i++) {
      bokeh.push({
        x: (fbm2(i * 1.1, seed, 23) + 1) / 2,
        y: 0.3 + ((fbm2(i * 2.7, seed, 29) + 1) / 2) * 0.5,
        r: 0.008 + ((fbm2(i, seed, 31) + 1) / 2) * 0.02,
        warm: fbm2(i * 4, seed, 37) > 0,
      });
    }
  }

  const steps: number[] = [];
  if (background.kind === 'stairwell') {
    // Eight treads climbing out of frame, each a little narrower than the last, which is what a
    // flight looks like from below the landing you are standing on.
    for (let i = 0; i < 8; i++) steps.push(0.62 - i * 0.062 - ((fbm2(i, seed, 59) + 1) / 2) * 0.02);
  }

  const details: Geometry['details'] = [];
  for (let i = 0; i < 5; i++) {
    details.push({
      x: 0.04 + ((fbm2(i * 1.9, seed, 61) + 1) / 2) * 0.92,
      y: 0.1 + ((fbm2(i * 2.4, seed, 67) + 1) / 2) * 0.5,
      w: 0.006 + ((fbm2(i * 3.2, seed, 71) + 1) / 2) * 0.1,
      h: 0.02 + ((fbm2(i * 4.1, seed, 73) + 1) / 2) * 0.16,
      kind: Math.floor(((fbm2(i * 5.3, seed, 79) + 1) / 2) * 4) % 4,
    });
  }

  const neon: Geometry['neon'] = [];
  if (background.kind === 'street') {
    for (let i = 0; i < 5; i++) {
      neon.push({
        x: 0.06 + i * 0.19 + ((fbm2(i, seed, 41) + 1) / 2) * 0.05,
        y: 0.28 + ((fbm2(i * 1.3, seed, 43) + 1) / 2) * 0.3,
        w: 0.012 + ((fbm2(i * 2, seed, 47) + 1) / 2) * 0.05,
        h: 0.008 + ((fbm2(i * 3, seed, 53) + 1) / 2) * 0.02,
        hue: i,
      });
    }
  }

  const built: Geometry = { blocks, ridge, bokeh, neon, steps, details };
  cache.set(key, built);
  return built;
}

export type FeatureTone = 'ink' | 'soft' | 'edge' | 'glow' | 'warm';

/** The room's wall: horizon and silhouette, half and half. */
export function interiorWall(horizon: Rgb, silhouette: Rgb): Rgb {
  return mixRgb(horizon, silhouette, 0.5);
}

/** Everything below the table edge: silhouette, a quarter of the way to black. */
export function interiorNosing(horizon: Rgb): Rgb {
  return mixRgb(horizon, [255, 255, 255], 0.12);
}

/**
 * How far a wall mark is held off the wall's own luminance, as a WCAG-style ratio of the lighter to
 * the darker. 1.25 is the floor every tone mixed from a room's own palette is built to clear.
 *
 * Two tones violated it, by the same mistake: a mix *made of* the wall cannot be *distinguishable
 * from* the wall.
 *
 * `detailTone`'s lit window mixed the silhouette half way to the horizon — and the wall is
 * `mixRgb(horizon, silhouette, 0.5)`, the identical colour. Measured 2026-10-12 across every room in
 * `ENVIRONMENTS`: 21 of 21 at ratio 1.000, so the one wall mark meant to be the brightest thing on
 * the wall could never be seen. The furniture's `ink` mixed the silhouette 45 % toward black, which
 * is a real push but not enough of one in a room whose silhouette is already near-black: `night-city`
 * 1.223, `neon-street` 1.249, `late-night-desk` 1.193 — all under the floor.
 *
 * `horizon` is also the wrong place to push a lit window *to*: the wall is already half the horizon,
 * so the furthest a horizon mix can ever reach is 1.14 in `quiet-room` — short of the floor in 10 of
 * the 21 rooms. Light is what a lit window is made of, so that is what it is mixed toward.
 */
export const DETAIL_MIN_RATIO = 1.25;

/** The colour a lit window is pushed toward: light, not another wall tone. */
const WINDOW_LIGHT: Rgb = [226, 232, 244];

/** WCAG's contrast ratio between two colours, on their relative luminances. 1.0 means identical. */
export function luminanceRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function relativeLuminance(rgb: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/**
 * Push `from` toward `toward` until it clears `DETAIL_MIN_RATIO` against `wall`, starting at `t`.
 *
 * One rule and two callers (`detailTone` and the furniture's `ink`), because the failure was one
 * failure: a colour mixed from the room's palette landing on the room's own wall. Written once so a
 * third caller cannot invent a third behaviour.
 */
function pushedToClear(wall: Rgb, from: Rgb, toward: Rgb, start: number): Rgb {
  let t = start;
  for (let step = 0; step < 64; step += 1) {
    const candidate = mixRgb(from, toward, t);
    if (luminanceRatio(wall, candidate) >= DETAIL_MIN_RATIO) return candidate;
    if (t >= 1) break;
    t = Math.min(1, t + 0.02);
  }
  // Nothing left to push toward: the room's palette is flat enough that no mix of it clears the
  // floor. The mark still has to be *something*, so it takes the extreme the push reached.
  return mixRgb(from, toward, 1);
}

/**
 * A tone the room's furniture is drawn in, held off the wall it stands against.
 *
 * `ink` mixed the silhouette 45 % toward black, which is a darker mark — but in a room whose
 * silhouette is nearly black already, 45 % of not much is still the wall. A shape drawn in a colour
 * the room does not have reads as a hole rather than as an object, and the furniture the design
 * names is the furniture a player is meant to recognise: cubicle doors, an elevator, a wall of
 * screens.
 */
export function featureToneColours(
  silhouette: Rgb,
  horizon: Rgb,
): Record<FeatureTone, { rgb: Rgb; alpha: number }> {
  const wall = interiorWall(horizon, silhouette);
  return {
    ink: { rgb: pushedToClear(wall, silhouette, [0, 0, 0], 0.45), alpha: 0.86 },
    soft: { rgb: mixRgb(silhouette, [0, 0, 0], 0.3), alpha: 0.6 },
    edge: { rgb: mixRgb(silhouette, horizon, 0.55), alpha: 0.45 },
    glow: { rgb: mixRgb(silhouette, [226, 232, 244], 0.62), alpha: 0.5 },
    warm: { rgb: mixRgb(silhouette, [255, 186, 104], 0.68), alpha: 0.55 },
  };
}

/** The seeded clutter's tone, by its kind (kind 2 is the lit window). */
export function detailTone(silhouette: Rgb, horizon: Rgb, kind: number): Rgb {
  const wall = interiorWall(horizon, silhouette);
  // Kind 2 is the lit window: the one mark that gives light back, so it is pushed toward light; the
  // rest are marks the room's own light made, so they are pushed toward black. A push in the wrong
  // direction is the same bug wearing the other sign.
  return kind === 2
    ? pushedToClear(wall, silhouette, WINDOW_LIGHT, 0.5)
    : pushedToClear(wall, silhouette, [0, 0, 0], 0.22);
}

/**
 * The room's own sky as the scene's key light, normalised to unit luminance.
 *
 * The backdrop is an *already-exposed* picture — `skyPalette` multiplied the room's palette by its
 * exposure before any of it reached a material — which is why every backdrop material is unlit
 * (`MeshBasicMaterial`). The props cannot be: a lighter and a pack are solids and need a shaded
 * face, so they are `MeshStandardMaterial` and they answer to the scene's lights. The two halves
 * have to agree on one exposure or the props fall out of the picture, and they did not.
 *
 * The key light was the room's sky *as it stood*, colour and all, and the sky of a night room is
 * linear ≈0.026. `MeshStandardMaterial` multiplies the light's colour into the result per channel,
 * so a light that dark delivers almost no energy: the pack's `#191612` ink rendered `rgb(1,1,1)` at
 * every N·L while the wall behind it stayed `rgb(44,42,42)`. Measured on the shipped build
 * (2026-10-12) with `tests/smoke/scan-black-boxes.mjs`: the lighter and the pack were the only two
 * axis-aligned solid rectangles in the frame, both at fill 1.0 and 13–29× darker than the wall
 * around them. All 21 rooms did it; the least bad was `mountain` at 13.3×.
 *
 * Normalising keeps what was right — the light still carries the room's own cast, so a warm room
 * lights its props warm and a cool one cools them — and drops only the accidental part, which was
 * that a room's *darkness* also divided its own props down to nothing. A dark room is dark because
 * of its palette, and its palette is already in the backdrop; it must not also be a power cut.
 *
 * WHAT THIS DOES NOT FIX, measured 2026-10-12 so nobody mistakes the repair for the cure. It moves
 * the pack from `rgb(2,2,1)` to `rgb(3,2,2)` on the served build — real, and nowhere near enough.
 * The reason is arithmetic, not tuning: the pack's ink `#191612` is linear 0.0097, so reaching the
 * wall's own `rgb(44,42,42)` needs the key to deliver 14–23× a unit-intensity white light, and
 * merely reaching the scanner's `rgb(26)` floor needs 4.4–9.2×. Measured across that range:
 *
 *   key ×1  pack 15,12,9    rod 174,166,155      key ×5  rod 255,242,225  <- rod starts clipping
 *   key ×5  pack 28,23,19   rod 255,242,225      key ×9  pack 36,31,26    <- pack clears 26
 *
 * There is no intensity that clears the pack without blowing out the rod `#f0e8da` and the chimney
 * `#6d6259`, which share this light — at ×9 the rod is pure white. So the lever a legible prop needs
 * is its own albedo (`PROP_INK`), not the light; this function is the prerequisite that makes such a
 * change behave the same in every room, and it is kept because it is correct on its own terms.
 */
export function keyLightInk(sky: Rgb): { rgb: Rgb; intensity: number } {
  // Normalise in LINEAR space, where luminance is what multiplies: scale so the sky's own linear
  // triple has luminance exactly 1, then re-encode. Doing this after the sRGB transfer (the `sqrt`
  // this replaces) only half-corrected — it held the *encoded* value rather than the luminance, so
  // the delivered energy still spread 2.8× across the deck, bright rooms getting more light.
  const key = sky.map(srgbToLinearChannel);
  const luminance = Math.max(1e-4, 0.2126 * key[0]! + 0.7152 * key[1]! + 0.0722 * key[2]!);
  const scale = 1 / luminance;
  const lift = (value: number): number => value * scale;
  return {
    // No clamp: a sky whose luminance is 1 or more cannot occur (the brightest content palette is
    // `mountain` at 0.13), and clamping would silently reintroduce the room-dependence this exists
    // to remove. If one ever did, `scale` would simply under-drive it — which is visible, not silent.
    rgb: [lift(key[0]!), lift(key[1]!), lift(key[2]!)].map(linearToSrgbChannel) as unknown as Rgb,
    intensity: KEY_INTENSITY,
  };
}

function srgbToLinearChannel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, c * 255));
}

/**
 * How much of the normalised key reaches a surface facing it. With `FILL_SHARE` the two add to one,
 * which is what puts a prop at its own ink rather than at some multiple of it: the backdrop is the
 * exposed picture, so the props must render at the ink the design drew, not brighter or darker.
 */
export const KEY_INTENSITY = 0.65;

/** The share of the room's light that arrives from everywhere, so no prop is lit on one face only. */
export const FILL_SHARE = 0.35;

/** One rectangle of furniture, in canvas fractions, in one of the five named tones. */
export interface FeatureBox {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: FeatureTone;
}

/**
 * The place's own furniture as rectangles.
 *
 * `drawFeatures` walks this list and fills; the 3D layer walks the same list and stands the same
 * furniture up. The rects and the order are the painter's own — this is that switch, transcribed.
 */
export function featureBoxes(
  feature: string,
  index: number,
  seeded: readonly { x: number }[],
): FeatureBox[] {
  /** Where this feature sits, so two places with the same id do not draw it in the same spot. */
  const at = (i: number, fallback: number): number => (seeded[i]?.x ?? fallback) % 0.7;
  const x = at(index, 0.12 + index * 0.18);
  const ground = 0.72;
  const boxes: FeatureBox[] = [];
  const box = (bx: number, by: number, bw: number, bh: number, tone: FeatureTone): void => {
    boxes.push({ x: bx, y: by, w: bw, h: bh, tone });
  };
  switch (feature) {
    case 'screens': {
      // A wall of monitors: the only light some rooms have, so this is the one feature that gives
      // brightness back rather than taking it away.
      box(x - 0.02, 0.38, 0.5, 0.16, 'soft');
      for (let i = 0; i < 4; i++) box(x + i * 0.12, 0.4, 0.1, 0.07, 'glow');
      for (let i = 0; i < 4; i++) box(x + i * 0.12, 0.47, 0.1, 0.008, 'edge');
      break;
    }
    case 'partitions': {
      // Cubicle doors, with the gap under them the deck's 「只能虚掩」 actually leaves.
      for (const door of [0.1, 0.42]) {
        box(door, 0.4, 0.17, ground - 0.42, 'ink');
        box(door, 0.4, 0.17, 0.006, 'edge');
      }
      break;
    }
    case 'extractor': {
      // A square of dead air high on the wall, slatted.
      box(0.72, 0.16, 0.11, 0.09, 'ink');
      for (let i = 0; i < 4; i++) box(0.72, 0.17 + i * 0.02, 0.11, 0.005, 'edge');
      break;
    }
    case 'roof': {
      // A roof line and its beam, from a tin shelter to a courtyard's eaves. The underside is the
      // lighter band: a flat black bar across the top reads as a censor bar, and an edge with a
      // highlight on it reads as something built.
      box(0, 0.05, 1, 0.05, 'ink');
      box(0, 0.1, 1, 0.008, 'edge');
      box(0, 0.108, 1, 0.004, 'soft');
      box(0.18, 0.112, 0.012, 0.3, 'ink');
      box(0.78, 0.112, 0.012, 0.3, 'ink');
      break;
    }
    case 'clothesline': {
      // Three short spans that sag, and three things on them.
      for (let i = 0; i < 3; i++) box(0.2 + i * 0.2, 0.22 + i * 0.012, 0.2, 0.004, 'edge');
      for (let i = 0; i < 3; i++) box(0.26 + i * 0.16, 0.24 + i * 0.01, 0.05, 0.07, 'ink');
      break;
    }
    case 'counter': {
      box(0.08, 0.56, 0.62, 0.03, 'ink');
      for (let i = 0; i < 4; i++) box(0.12 + i * 0.16, 0.59, 0.05, 0.12, 'soft');
      break;
    }
    case 'hearth': {
      // The fire is the room's key light, so it is the one place a feature sits *under* the
      // silhouette rather than below it.
      box(0.62, 0.5, 0.24, 0.2, 'ink');
      box(0.66, 0.56, 0.16, 0.13, 'warm');
      break;
    }
    case 'low-tables': {
      for (let i = 0; i < 3; i++) {
        box(0.1 + i * 0.26, 0.62, 0.16, 0.02, 'ink');
        box(0.12 + i * 0.26, 0.64, 0.12, 0.06, 'soft');
      }
      break;
    }
    case 'parasol': {
      // A canopy that steps down at the ends, so it is an octagon seen edge-on rather than a
      // horizontal bar, which is the difference between a parasol and a signpost.
      box(0.2, 0.28, 0.38, 0.016, 'ink');
      box(0.15, 0.296, 0.48, 0.014, 'ink');
      box(0.38, 0.31, 0.012, 0.29, 'ink');
      for (const table of [0.18, 0.56]) {
        box(table, 0.58, 0.14, 0.015, 'edge');
        box(table + 0.055, 0.595, 0.02, 0.11, 'soft');
      }
      break;
    }
    case 'elevator': {
      box(0.56, 0.34, 0.2, ground - 0.36, 'ink');
      box(0.655, 0.34, 0.01, ground - 0.36, 'edge');
      box(0.24, 0.42, 0.16, 0.1, 'soft');
      break;
    }
    case 'pumps': {
      for (const pump of [0.22, 0.52]) {
        box(pump, 0.44, 0.1, 0.26, 'ink');
        box(pump + 0.02, 0.47, 0.06, 0.05, 'glow');
      }
      box(0.32, 0.6, 0.2, 0.012, 'soft');
      break;
    }
    case 'bins': {
      box(0.06, 0.56, 0.12, 0.14, 'ink');
      box(0.2, 0.58, 0.1, 0.12, 'ink');
      box(0.44, 0.6, 0.4, 0.03, 'soft');
      for (let i = 0; i < 3; i++) box(0.46 + i * 0.12, 0.53, 0.08, 0.07, 'ink');
      break;
    }
    case 'glass-box': {
      // Two seams and a rail: the glass itself is the light it keeps back.
      box(0.16, 0.24, 0.008, ground - 0.26, 'edge');
      box(0.7, 0.24, 0.008, ground - 0.26, 'edge');
      box(0.16, 0.24, 0.548, 0.012, 'edge');
      box(0.16, 0.252, 0.548, ground - 0.272, 'soft');
      break;
    }
    case 'shutters': {
      for (let i = 0; i < 3; i++) {
        box(0.1 + i * 0.3, 0.36, 0.22, 0.18, 'ink');
        for (let s = 0; s < 4; s++) box(0.1 + i * 0.3, 0.38 + s * 0.04, 0.22, 0.004, 'edge');
      }
      break;
    }
    default:
      break;
  }
  return boxes;
}

/** One backdrop rectangle in canvas fractions, with the colour and alpha the painter would use. */
export interface StageGlowFrac {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rgb: Rgb;
  alpha: number;
}

export interface BackgroundStructure {
  sky: readonly { at: number; rgb: Rgb }[];
  wall: { rgb: Rgb; alpha: number } | null;
  table: { edgeY: number; ink: Rgb; nosingRgb: Rgb; nosingAlpha: number } | null;
  boxes: StageBoxFrac[];
  glows: StageGlowFrac[];
}

/**
 * §2's warm pool, one row per screen of the Demo's core loop.
 *
 * The Demo paints the pool as the stage's own background, and its numbers move with the screen the
 * frame is about: 待机 puts it on the table under the props (`90% 55% at 50% 78%`, 16 %), 点着 pulls it
 * in onto the flame (`70% 45% at 50% 68%`, 22 %), 吸入 and 力度 lift it to the column
 * (`80% 60% at 50% 40%`, 12 %, and `70% 50% at 50% 46%`, 9 %), 磕灰 drops it on the tray
 * (`70% 50% at 50% 60%`, 10 %). Read straight out of `SmokeRitual-UI-Demo.html` on 2026-10-11: its
 * phone stage is 388 × 575 px, the same box the app's stage element gets at 390 × 844, so these are
 * the file's own fractions and not a translation of it.
 *
 * `rx` is a fraction of the box's width and `ry` of its height (CSS's own two-value size), and the
 * falloff stop (62 % for the two table screens, 66 % for the three rod screens) lives in the sprite
 * the scene builds — the two numbers are within a hair of each other and the profile is not a fact
 * this table can carry.
 */
export const WARM_POOL = {
  idle: { cx: 0.5, cy: 0.78, rx: 0.9, ry: 0.55, alpha: 0.16 },
  light: { cx: 0.5, cy: 0.68, rx: 0.7, ry: 0.45, alpha: 0.22 },
  puff: { cx: 0.5, cy: 0.4, rx: 0.8, ry: 0.6, alpha: 0.12 },
  force: { cx: 0.5, cy: 0.46, rx: 0.7, ry: 0.5, alpha: 0.09 },
  tray: { cx: 0.5, cy: 0.6, rx: 0.7, ry: 0.5, alpha: 0.1 },
} as const;

export type WarmPoolScreen = keyof typeof WARM_POOL;

/**
 * Which of the Demo's five screens this state is drawing.
 *
 * The three the Demo never framed continue the screen they visually sit in — a rod smouldering
 * between draws is still the column, and putting it out / dropping it is still the tray — rather
 * than inventing a sixth number.
 */
export function warmPoolScreen(state: CigaretteStateId): WarmPoolScreen {
  if (state === 'LIGHTING') return 'light';
  if (state === 'RESTING') return 'force';
  if (state === 'ASH_READY') return 'tray';
  if (state === 'PUFFING' || state === 'BURNING' || state === 'NEAR_END') return 'puff';
  if (state === 'EXTINGUISHING' || state === 'EXTINGUISHED' || state === 'DISCARDED') return 'tray';
  return 'idle';
}

/**
 * §2's bloom, in the two sizes the Demo draws it.
 *
 * S1 puts a 280 × 170 ellipse (`closest-side, rgba(255,138,61,.20)`, blurred 26 px) over the table —
 * `rx 140/388 / ry 85/575` of the stage box. S2, the frame with the lighter open, draws the same
 * idea tighter and hotter: 190 × 190 at `.34`. So the bloom has two rows, and the one fact that
 * picks between them is whether the rod is alight.
 *
 * Its *centre* stays the venue's key direction rather than the Demo's fixed spot, because the thirteen
 * rooms each name a direction and the file draws only ever one of them; what the Demo anchors is the
 * size and the strength.
 */
export const WARM_BLOOM = {
  table: { rx: 140 / 388, ry: 85 / 575, alphaAtQuiet: 0.2 },
  alight: { rx: 95 / 388, ry: 95 / 575, alphaAtQuiet: 0.34 },
  /** ... and the Demo's own room is the one its numbers were read in: `ambient: 0.42`. */
  quietAmbient: 0.42,
} as const;

export type WarmBloomRow = Exclude<keyof typeof WARM_BLOOM, 'quietAmbient'>;

/**
 * The row in effect.
 *
 * S2's hotter bloom is the frame with the lighter open and the rod at it, so the fact that picks the
 * row is the rod being alight — from the strike until it is out. The screens the Demo drew without a
 * glow at all (吸入 / 力度 / 磕灰) keep the alight row rather than switching the room's light off in
 * the middle of a break, which the file never shows and would read as a flicker.
 */
export function warmBloomScreen(state: CigaretteStateId): WarmBloomRow {
  if (
    state === 'IDLE' ||
    state === 'PICKED_UP' ||
    state === 'EXTINGUISHED' ||
    state === 'DISCARDED'
  )
    return 'table';
  return 'alight';
}

/** The bloom as the venue's exposure moves it, with the Demo's number as the anchor it scales from. */
export function bloomAlpha(row: WarmBloomRow, ambient: number): number {
  return WARM_BLOOM[row].alphaAtQuiet * ((0.4 + ambient) / (0.4 + WARM_BLOOM.quietAmbient));
}

export function backgroundStructure(
  state: GameStateView,
  cssWidth: number,
  cssHeight: number,
): BackgroundStructure {
  const light = state.world.light;
  const background = state.environment.background;
  const { skyTop, skyBottom, horizon, silhouette } = skyPalette(light, background);
  const sky = [
    { at: 0, rgb: skyTop },
    { at: 0.62, rgb: skyBottom },
    { at: 1, rgb: mixRgb(skyBottom, silhouette, 0.45) },
  ] as const;

  const interior =
    background.kind === 'room' ||
    background.kind === 'desk' ||
    background.kind === 'stairwell' ||
    background.kind === 'corner';
  if (!interior) return { sky, wall: null, table: null, boxes: [], glows: [] };

  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const geometry = geometryFor(state);
  const wallRgb = interiorWall(horizon, silhouette);
  const poolLight = state.style.scene.pool;
  const layout = state.stage.layout;
  const edgeY = layout.tableEdgeY;

  const boxes: StageBoxFrac[] = [];
  for (const detail of geometry.details) {
    const rgb = detailTone(silhouette, horizon, detail.kind);
    if (detail.kind === 0) {
      // A pipe along the wall.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: 0.34,
        h: Math.max(1, h * 0.006) / h,
        rgb,
        alpha: 0.3,
      });
    } else if (detail.kind === 1) {
      // A flex hanging from the ceiling with nothing on the end of it.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: Math.max(1, w * 0.004) / w,
        h: 0.12,
        rgb,
        alpha: 0.3,
      });
    } else if (detail.kind === 2) {
      // A window further off, lit by someone else's evening.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: Math.min(0.09, detail.w),
        h: Math.min(0.12, detail.h),
        rgb,
        alpha: 0.3,
      });
    } else {
      // A stain: a short, hard-edged mark, not a blob.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: Math.min(0.05, detail.w),
        h: Math.max(1, h * 0.004) / h,
        rgb,
        alpha: 0.3,
      });
    }
  }

  const wanted = background.features ?? [];
  const tones = featureToneColours(silhouette, horizon);
  wanted.forEach((feature, index) => {
    for (const part of featureBoxes(feature, index, geometry.details)) {
      const tone = tones[part.tone];
      // `Math.max(1, …)` is the painter's own floor, kept in pixels the way it wrote it.
      boxes.push({
        x: part.x,
        y: part.y,
        w: Math.max(1, part.w * w) / w,
        h: Math.max(1, part.h * h) / h,
        rgb: tone.rgb,
        alpha: tone.alpha,
      });
    }
  });

  // The two warm lights §2 draws: the venue's own bloom, and the pool of the screen being shown.
  // Both are fractions of the stage box, because that is what the Demo writes them as — the old
  // version of this block mixed px into a fraction field (`box.x + spot.x * box.width`,
  // `box.width * w * 0.8`), so the pool landed 149 canvas-widths to the right of the frame and read
  // as nothing at all. Measured 2026-10-11 on the served build: no mesh with a pool-sized scale was
  // in the scene, and the only warm quad on screen was the pill's own glow.
  const radians = (light.keyDirectionDeg * Math.PI) / 180;
  const pool = WARM_POOL[warmPoolScreen(state.cigarette.state)];
  const bloomRow = warmBloomScreen(state.cigarette.state);
  const bloom = WARM_BLOOM[bloomRow];
  const glows: StageGlowFrac[] = [
    {
      x: 0.5 + Math.cos(radians) * 0.3,
      y: 0.2 + Math.sin(radians) * 0.25,
      rx: bloom.rx,
      ry: bloom.ry,
      rgb: mixRgb(wallRgb, poolLight, 0.5),
      alpha: bloomAlpha(bloomRow, light.ambient),
    },
    {
      x: pool.cx,
      y: pool.cy,
      rx: pool.rx,
      ry: pool.ry,
      rgb: mixRgb(silhouette, poolLight, 0.62),
      alpha: pool.alpha,
    },
  ];

  return {
    sky,
    wall: { rgb: wallRgb, alpha: 0.85 },
    table: {
      edgeY,
      ink: interiorEdgeInk(silhouette),
      nosingRgb: interiorNosing(horizon),
      nosingAlpha: 0.5,
    },
    boxes,
    glows,
  };
}

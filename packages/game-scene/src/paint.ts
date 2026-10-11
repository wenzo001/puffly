/**
 * The painted layer's numbers, kept after its paint retired (2026-10-10).
 *
 * Everything here used to live inside the Canvas 2D renderer: the puff's four formulas, the
 * cartoon dial, the near/far depth split, the film-grain tile and the §60 effect bookkeeping. The
 * scene reads them now, and they stay formulas rather than becoming scene locals for the reason
 * they were extracted in the first place — a second copy of a formula is how this repository's
 * picture grew a second, different picture.
 */

import { clamp01, mixRgb, type Rgb } from '@puffly/shared';
import { emberHeat, ventDraught } from '@puffly/game-core';
import type { Burst, QualityMode, SkinPalette } from '@puffly/game-core';
import type { IntakeOptions } from './intake';
import type { SceneEffect } from './effects';

/** Anything longer than this is a stalled tab, not a frame; smoke must not teleport. */
export const MAX_FRAME_MS = 50;
/** A single puff may never cover the stage, whatever the lifetime maths says (§54, §58). */
export const MAX_SMOKE_RADIUS_PX = 220;

/**
 * The deck's 冲击感, from the 20% side of its 80/20 rule (S7): 「点火瞬间整体画面轻微推近 + 边缘压暗」.
 *
 * `zoom` is deliberately small — 3.5% at the peak, which at 390 px is 14 px at the frame's edge and
 * nothing at all where the camera pivots. The pivot is the cherry itself, and that is not a
 * cinematography preference: the shell hit-tests against the anchors the core publishes, so a zoom
 * that moved the ember would move the thing under the player's thumb for the length of the punch.
 * Pivoting there keeps §37's rule true by construction rather than by tolerance.
 */
export const IGNITION_IMPACT = { ttlMs: 420, zoom: 0.035, edge: 0.22 } as const;

/**
 * The punch's own clock: 1 on the frame the rod catches, then a linear release over `ttlMs`.
 * Reduced motion is not a smaller punch — it is no punch, so the whole picture holds still.
 */
export function stepIgnition(impact: number, frameMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return Math.max(0, impact - frameMs / IGNITION_IMPACT.ttlMs);
}

/**
 * The eased shape the frame actually draws with. A release that leaves at a constant rate reads as a
 * slow slide; `impact · (2 − impact)` keeps the first frames near the peak so the hit lands.
 */
export const ignitionPunch = (impact: number): number => impact * (2 - impact);

/** How much closer the world stands: at the peak, 3.5% at the frame's edge and nothing at the pivot. */
export const ignitionZoom = (punch: number, cartoon: number): number =>
  1 + IGNITION_IMPACT.zoom * punch * cartoon;

/** The other half of the same hit — the room closing in, on the very same punch. */
export const ignitionEdgeAlpha = (punch: number, cartoon: number): number =>
  IGNITION_IMPACT.edge * punch * cartoon;

/**
 * Where the pushed-in world has to sit for the ember to stay exactly where the core put it.
 *
 * The scene graph computes `world = position + scale · local`, so scaling a group by `zoom` about the
 * ember means offsetting it by `ember · (1 − zoom)`. Everything off the pivot then moves outward by
 * exactly the zoom, while the point under the player's thumb does not move at all (§37).
 */
export function punchPivot(
  ember: readonly [number, number],
  zoom: number,
): { x: number; y: number } {
  return { x: ember[0] * (1 - zoom), y: ember[1] * (1 - zoom) };
}

/** The deck's split, as a number: S6 writes 写实 80% / 卡通 20%. */
export const DECK_SPLIT = 0.8;

/**
 * How far above the core's own alpha the breath sits at one unit of cartoon. 0.5 is a step, not a
 * doubling: measured on the shipped classic at full intensity, the brightest disc of the breath goes
 * from 0.0758 to 0.1137, which lifts it just past the rod's own idle thread (0.0975) — visible, and
 * nowhere near the white ball a larger factor makes. plume-lift.test.ts（2026-10-10 随 2D 光栅套件退役） bounds both ends.
 */
export const EXHALE_LIFT = 0.5;

/**
 * S6's 写实度, as the scene reads it: how much of the cartoon side is left in the frame.
 *
 * Written around the deck's own split so `0.8` multiplies everything by exactly 1 — the shipped
 * look is a detent on the dial, not a special case above or below it. Above it the feedback drains
 * toward pure physics: at 1 there is no push-in, no edge, no rock, a spark lands and stays landed,
 * and the breath keeps the alpha the simulation authored for it. Below it the cartoon side grows up
 * to double, which is where 「比真实更脆」 earns its keep.
 *
 * Nothing in the simulation may consult this. `realism-purity.test.ts` (in `game-core`) runs a whole break
 * at each detent and compares the entire state, because that is the difference between a look and a cheat.
 */
export const cartoonScale = (realism: number): number => {
  const level = Number.isFinite(realism) ? Math.min(1, Math.max(0, realism)) : DECK_SPLIT;
  return level >= DECK_SPLIT
    ? (1 - level) / (1 - DECK_SPLIT)
    : 1 + (DECK_SPLIT - level) / DECK_SPLIT;
};

/**
 * Particles at or past this depth draw in front of the props, the rest behind them. The pool's
 * `depth` is simulation, not a z; every reader maps the two halves onto its own ladder.
 */
export const NEAR_DEPTH = 0.55;

/** Overlap instead of opacity: see the plume's own draw, now the scene's. */
export const PUFF_SPREAD = 1.34;

/**
 * The film grain's own amount: `null` when there is nothing to put on (reduced motion is the first
 * thing grain gives up — it is texture, not information — and a venue may declare none at all).
 * §23, §56, §63.
 */
export function grainAlpha(grain: number, reducedMotion: boolean): number | null {
  if (reducedMotion || grain <= 0) return null;
  return Math.min(0.14, grain * 0.09);
}

const PUFF_ALPHA = 0.62;
/** A puff is not a circle: the drawn ellipse is this much shorter than it is wide. */
export const PUFF_FLATTEN = 0.74;

/**
 * One puff's four drawn numbers — heat, tint, spread, alpha — as functions instead of as locals
 * inside the plume's draw, because two readers of one pool is exactly where a look drifts apart.
 */
/** How hot a puff still is: full at birth, gone by a fifth of its life. */
export function puffHeat(particle: { heat: number; age: number }): number {
  return particle.heat * clamp01(1 - particle.age * 5);
}

/** A puff's colour: the core's tint, whitened by how visible smoke is here, warmed while hot (§24). */
export function puffTint(rgb: Rgb, heat: number, visibility: number): Rgb {
  const lit = mixRgb(rgb, [255, 255, 255], (visibility - 0.5) * 0.12);
  return mixRgb(lit, [255, 176, 96], heat * 0.55);
}

/**
 * The cherry's colour band, deep ember orange to near white, by the core's own temperature band
 * (`emberHeat`). The light on the smoke cannot read hotter than the thing it comes from
 * (§4 声音跟画面连接's colour twin).
 */
export function cherryHot(temperature: number): Rgb {
  return mixRgb([255, 120, 32], [255, 236, 190], emberHeat(temperature));
}

/**
 * The venue's share of the puff's width (S21 通风系数): a sealed place lets the ribbon hang, a
 * forecourt tears it out sideways. Anchored at 1 and only ever adding, because the core's
 * `smoke.dispersion` also carries the rod and the ashtray — taking that straight into the radius
 * would shrink the calibrated picture of every room at once. The brightness half of the same
 * coefficient arrives through `field.visibility`.
 */
/**
 * A flint spark as a streak — the same three numbers every reader draws: the colour mixed off the
 * particle's own tint, an alpha that rides `× 3` (a spark lives two frames and has to be seen in
 * them), and the stroke's width in stage units. From/to are the particle's own previous and
 * current positions; each reader maps those its own way.
 */
export function sparkStreak(particle: { alpha: number; radius: number; tint: Rgb }): {
  alpha: number;
  widthUnits: number;
  colour: Rgb;
} {
  return {
    alpha: clamp01(particle.alpha * 3),
    widthUnits: particle.radius * 0.9,
    colour: mixRgb(particle.tint, [255, 214, 150], 0.7),
  };
}

export function puffSpread(ventilation: number): number {
  return 1 + ventDraught(ventilation) * 0.45;
}

/**
 * What one puff's authored alpha becomes on screen.
 *
 * `far` is the painted layer's old depth split (§16): the half of the cloud drawn behind the props
 * was dimmed to 0.72. The scene has real depth and does not use it.
 */
export function puffAlpha(
  particleAlpha: number,
  styleOpacity: number,
  visibility: number,
  highContrast: boolean,
  far = false,
): number {
  return clamp01(
    particleAlpha *
      styleOpacity *
      (0.35 + visibility * 0.8) *
      (highContrast ? 1.35 : 1) *
      PUFF_ALPHA *
      (far ? 0.72 : 1),
  );
}

/** What `plumeIntakeOptions` reads off the player's settings. */
export interface IntakeSettings {
  reducedMotion: boolean;
  quality: QualityMode;
  skin: SkinPalette | null;
  realism: number;
}

/**
 * The options a burst is taken in with — the plume's density, tint and lift, from the settings.
 * One writer, and the scene is its reader.
 */
export function plumeIntakeOptions(settings: IntakeSettings): IntakeOptions {
  return {
    densityScale: densityScaleFor(settings),
    plumeTint: settings.skin?.smoke,
    plumeLift: 1 + EXHALE_LIFT * cartoonScale(settings.realism),
  };
}

function densityScaleFor(settings: Pick<IntakeSettings, 'reducedMotion' | 'quality'>): number {
  if (settings.reducedMotion) return 0.28;
  switch (settings.quality) {
    case 'light':
      return 0.5;
    case 'balanced':
      return 0.75;
    default:
      return 1;
  }
}

/** How much louder the picture gets when the sound is not there to speak. */
const VISUAL_CUE_BOOST = 1.45;

/**
 * Where a burst should leave a mark on the scene. Only the physical bursts do: the smoke
 * itself is the feedback for a puff, and drawing a ring around every wisp would be noise.
 */
function accentFor(burst: Burst, atMs: number): SceneEffect | null {
  const tint: Rgb = [255, 196, 128];
  switch (burst.kind) {
    case 'extinguish':
      return {
        kind: 'flash',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 420,
        strength: 0.85,
        reach: 0.16,
        tint: [255, 236, 208],
      };
    case 'impact':
      return {
        kind: 'ripple',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 520,
        strength: 0.7,
        reach: 0.14,
        tint,
      };
    case 'flare':
      return {
        kind: 'flash',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 300,
        strength: 0.5,
        reach: 0.07,
        tint: [255, 150, 60],
      };
    case 'ash':
      return {
        kind: 'ripple',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 380,
        strength: 0.35,
        reach: 0.05,
        tint: [214, 214, 220],
      };
    case 'ember':
      // The cherry catching has a sound of its own and never had a mark of its own: with the
      // volume down it was the one moment of the break nobody could tell had happened.
      return {
        kind: 'ring',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 460,
        strength: 0.55,
        reach: 0.075,
        tint: [255, 168, 74],
      };
    case 'lighter':
      return {
        kind: 'ring',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 300,
        strength: 0.3,
        reach: 0.05,
        tint: [255, 224, 176],
      };
    default:
      return null;
  }
}

/** §60's feedback for the most repeated gesture: the ring the table gets when the rod leaves it. */
export function pickUpRing(at: { x: number; y: number }, atMs: number): SceneEffect {
  return {
    kind: 'ring',
    x: at.x,
    y: at.y,
    bornMs: atMs,
    ttlMs: 360,
    strength: 0.45,
    reach: 0.075,
    tint: [255, 214, 150],
  };
}

export function effectFor(burst: Burst, atMs: number, visualCues: boolean): SceneEffect | null {
  const effect = accentFor(burst, atMs);
  if (effect === null || !visualCues) return effect;
  // The same accent, not a new language: bigger and a beat longer, so the eye is where the
  // ear would have been.
  return {
    ...effect,
    strength: Math.min(1, effect.strength * VISUAL_CUE_BOOST),
    reach: effect.reach * VISUAL_CUE_BOOST,
    ttlMs: effect.ttlMs * VISUAL_CUE_BOOST,
  };
}

/**
 * A film-grain tile, as raw RGBA. §23 lets an environment declare `grain`, and §56 asks for a
 * cinematic rather than a clean-rendered look; a single baked tile, repeated, is the cheap way to
 * get texture without drawing thousands of dots per frame.
 *
 * It used to bake through an offscreen canvas; since the painted layer retired it hands the bytes
 * back directly — same integer LCG, same 128 px, same values, so the tile the eye knows survives
 * the pipeline change. Premultiplied nothing: straight RGBA, alpha in 0.05..0.15 like the canvas
 * fillStyle always carried.
 */
export function createGrainTile(size = 128, density = 0.55, seed = 0x9e3779b9): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  // Integer LCG so the tile is identical on every platform and every run.
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (next() > density) continue;
      const value = Math.round(120 + next() * 135);
      const alpha = Math.round((0.05 + next() * 0.1) * 255);
      const i = (y * size + x) * 4;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = alpha;
    }
  }
  return pixels;
}

/**
 * Burst recipes — SPEC.md §15, §16.
 *
 * Game Core does not own particles (that is the renderer's job, §47) but it does own
 * *what kind of smoke this puff is*: a seeded recipe with explicit variance envelopes,
 * so every puff looks different (§16) while still being reproducible from the session
 * seed alone (§71).
 */

import { clamp, clamp01, mixRgb, type Rgb } from '@puffly/shared';
import { SMOKE } from '../constants';
import { PUFF_TIERS, type PuffTier, type PuffTierId } from '../puffTier';
import type { Burst, BurstKind } from '../types/events';
import type { SmokeCharacter } from '../types/content';
import type { Point } from '../types/geometry';
import type { EngineRuntime } from '../runtime';

export interface BurstOptions {
  kind: BurstKind;
  origin: Point;
  /** Base particle count before variance and quality scaling (§54 budget). */
  count: number;
  directionDeg: number;
  spreadDeg: number;
  speed: [number, number];
  radius: [number, number];
  lifeMs: [number, number];
  alphaPeak: number;
  rise: number;
  turbulence: number;
  /**
   * How the puff's light is spent across its own life. Left unset it is the §16 random envelope,
   * which is right for a clump of ash and wrong for a column: smoke that is meant to thin as it
   * rises has to be authored to fade, not to hold.
   */
  alphaDecay?: number;
  scaleGrowth?: number;
  gravity?: number;
  tint?: Rgb;
  heat?: number;
  /** The §puffAnimations tier this breath settled on; copied onto the burst for the renderer. */
  tierRecipe?: {
    tier: PuffTierId;
    volumeMl: number;
    smokeLayers: readonly [number, number];
    spreadRadiusPx: number;
    riseSeconds: number;
  };
}

function qualityScale(rt: EngineRuntime): number {
  if (rt.settings.reducedMotion) return 0.28;
  switch (rt.settings.quality) {
    case 'light':
      return 0.5;
    case 'balanced':
      return 0.75;
    case 'high':
      return 1;
    default:
      return 1;
  }
}

/**
 * How a rod's character reshapes every puff it produces. Multipliers, not overrides:
 * the rod's own `smokeProfile` numbers still lead, so two rods of the same character
 * differ, and the same rod in two environments differs again (§16, §77).
 */
export interface PlumeShape {
  count: number;
  spread: number;
  speed: number;
  radius: number;
  life: number;
  alpha: number;
  rise: number;
  turbulence: number;
  gravity: number;
}

const PLAMES: Record<SmokeCharacter, PlumeShape> = {
  column: {
    count: 0.95,
    spread: 0.6,
    speed: 1.0,
    // A column should not be *thinner* than the base recipe it multiplies.
    radius: 1.05,
    life: 1.15,
    alpha: 1.0,
    rise: 1.25,
    turbulence: 0.7,
    gravity: 0,
  },
  haze: {
    count: 1.15,
    spread: 1.5,
    speed: 0.7,
    radius: 1.2,
    life: 1.4,
    alpha: 0.7,
    rise: 0.7,
    turbulence: 1.0,
    gravity: 0,
  },
  curls: {
    count: 1.0,
    spread: 1.15,
    speed: 1.05,
    radius: 1.0,
    life: 1.0,
    alpha: 0.95,
    rise: 1.0,
    turbulence: 1.7,
    gravity: 0,
  },
  curtain: {
    count: 1.3,
    spread: 1.9,
    speed: 0.8,
    radius: 1.15,
    life: 1.5,
    alpha: 0.85,
    rise: -0.45,
    turbulence: 1.1,
    gravity: 0.3,
  },
  bloom: {
    count: 1.4,
    spread: 1.35,
    speed: 1.4,
    radius: 1.1,
    life: 0.75,
    alpha: 1.1,
    rise: 1.15,
    turbulence: 1.25,
    gravity: -0.06,
  },
};

export function plumeFor(character: SmokeCharacter): PlumeShape {
  return PLAMES[character] ?? PLAMES.haze;
}

/** Every numeric envelope gets its own sample, which is what §16 asks for. */
export function makeBurst(rt: EngineRuntime, options: BurstOptions): Burst {
  const rng = rt.rng;
  const v = SMOKE.variance;
  const density = clamp01(rt.state.smoke.density);
  const plume = plumeFor(rt.state.smoke.character);

  const count = Math.max(
    1,
    Math.round(
      options.count * plume.count * qualityScale(rt) * rng.range(1 - v.speed, 1 + v.speed),
    ),
  );
  const directionDeg = options.directionDeg + rng.range(-v.directionDeg, v.directionDeg);
  const speedFactor = plume.speed * rng.range(1 - v.speed * 0.5, 1 + v.speed);
  const radiusFactor = plume.radius * rng.range(1 - v.scale * 0.4, 1 + v.scale);
  const lifeFactor = plume.life * rng.range(1 - v.life * 0.5, 1 + v.life);
  const turbulence =
    options.turbulence * plume.turbulence * rng.range(1 - v.turbulence * 0.4, 1 + v.turbulence);

  return {
    id: rt.ids.next('burst'),
    kind: options.kind,
    seed: rng.int(1, 0x7ffffffe),
    origin: { x: options.origin.x, y: options.origin.y },
    count,
    directionDeg,
    spreadDeg: options.spreadDeg * plume.spread * rng.range(0.85, 1.2),
    speed: { min: options.speed[0] * speedFactor, max: options.speed[1] * speedFactor },
    radius: { min: options.radius[0] * radiusFactor, max: options.radius[1] * radiusFactor },
    lifeMs: { min: options.lifeMs[0] * lifeFactor, max: options.lifeMs[1] * lifeFactor },
    alphaPeak: clamp01(
      options.alphaPeak * plume.alpha * (0.75 + density * 0.5) * rng.range(0.9, 1.1),
    ),
    // Drawn every time, so authoring it cannot shift the random stream behind it.
    alphaDecay: options.alphaDecay ?? rng.range(0.55, 0.95),
    rise: options.rise * plume.rise * rng.range(0.85, 1.15),
    turbulence,
    scaleGrowth: options.scaleGrowth ?? 2.4,
    gravity: (options.gravity ?? 0) + plume.gravity,
    tint: options.tint ?? rt.state.smoke.tint,
    heat: options.heat ?? 0,
    ...(options.tierRecipe === undefined
      ? {}
      : {
          tier: options.tierRecipe.tier,
          volumeMl: options.tierRecipe.volumeMl as 8 | 24 | 35,
          smokeLayers: {
            min: options.tierRecipe.smokeLayers[0],
            max: options.tierRecipe.smokeLayers[1],
          },
          spreadRadiusPx: options.tierRecipe.spreadRadiusPx as 24 | 52 | 86,
          riseSeconds: options.tierRecipe.riseSeconds,
        }),
  };
}

/**
 * The tier-shaped breath, §puffAnimations exhale table.
 *
 * The table itself is the Demo's own numbers (8 / 24 / 35 ml, 24 / 52 / 86 px, 0.6 / 1.2 / 2.5 s);
 * the only arithmetic here is reading those CSS figures as stage units, against the envelope the
 * inhaled breath used to ship:
 *
 * - `M` **is the legacy envelope** — the `44 + 86·intensity` disc count, radius 0.01…0.03, life
 *   3.6…8.2 s, the intensity-driven ejection speed, buoyancy and turbulence. Every calibrated
 *   plume file measures a 1.4 s breath, which is M, so M cannot move without re-tuning the room.
 * - `S` and `L` are that envelope scaled by the Demo's own ratios: radius ∝ 24 / 52 and 86 / 52
 *   (the same result as dividing 24 / 52 / 86 CSS px by the 844 px stage and the breath's own
 *   growth, `scaleGrowth` × mean depth × `PUFF_SPREAD` ≈ 2.0), and life ∝ 0.6 / 1.2 and 2.5 / 1.2.
 *   L's ratio is capped at 1.6 rather than 2.08: discs authored to ~17 s would outlive the
 *   ashtray phase itself and hang in the room the player has left.
 * - ejection speed, buoyancy and turbulence stay on the intensity formulas at every tier. They are
 *   not columns of the Demo's table, so the tier may not author them; the table's rise time is
 *   expressed through the life envelope — L discs simply keep climbing long after S's have gone.
 */
/**
 * The M-tier reference count is the inhaled recipe the plume was calibrated with
 * (`44 + 86·intensity`): M is a 1.0…2.0 s draw and every calibrated file measures one, so its
 * authored count cannot move. S and L take that same draw scaled by the table's own volume
 * ratio (8 / 24 and 35 / 24 ml).
 */
const M_VOLUME_ML = 24;
const mCount = (intensity: number, volumeMl: number): number =>
  Math.round((44 + 86 * intensity) * (volumeMl / M_VOLUME_ML));
const M_RADIUS: readonly [number, number] = [0.01, 0.03];
const M_LIFE_MS: readonly [number, number] = [3600, 8200];
const RADIUS_SCALE: Record<PuffTierId, number> = {
  S: 24 / 52,
  M: 1,
  L: 86 / 52,
};
const LIFE_SCALE: Record<PuffTierId, number> = {
  S: 0.6 / 1.2,
  M: 1,
  L: 1.6,
};

export function tieredExhaleOptions(
  tierRecord: PuffTier,
  intensity: number,
): Omit<BurstOptions, 'kind' | 'origin' | 'directionDeg'> {
  const radiusScale = RADIUS_SCALE[tierRecord.id];
  const lifeScale = LIFE_SCALE[tierRecord.id];
  return {
    count: mCount(intensity, tierRecord.volumeMl),
    spreadDeg: 13,
    speed: [0.01, 0.028 + 0.04 * intensity],
    radius: [M_RADIUS[0] * radiusScale, M_RADIUS[1] * radiusScale],
    lifeMs: [M_LIFE_MS[0] * lifeScale, M_LIFE_MS[1] * lifeScale],
    alphaPeak: 0.08 + 0.1 * intensity,
    alphaDecay: 1.9,
    rise: 1.3 + intensity * 1.3,
    turbulence: 0.3 + intensity * 0.35,
    scaleGrowth: 1.45,
    heat: clamp01(intensity * 0.35),
    tierRecipe: {
      tier: tierRecord.id,
      volumeMl: tierRecord.volumeMl,
      smokeLayers: tierRecord.smokeLayers,
      spreadRadiusPx: tierRecord.spreadRadiusPx,
      riseSeconds: tierRecord.riseSeconds,
    },
  };
}

const tipAngle = (rt: EngineRuntime): number => rt.state.cigarette.pose.angleDeg - 90;

/**
 * The hand that just let go says where the breath goes: release travelling right lays the plume
 * right. Capped hard, because this is a nudge and not a joystick — the world has to answer the
 * gesture without becoming something the player steers (§66).
 */
const RELEASE_STEER_DEG = 24;

function releaseSteer(rt: EngineRuntime): number {
  if (!rt.drag.pressed) return 0;
  return clamp(rt.drag.velocity.x * 20, -RELEASE_STEER_DEG, RELEASE_STEER_DEG);
}

/** A wisp escaping the cherry while the draw is held (§14). */
export function puffBurst(rt: EngineRuntime): Burst {
  const smoke = rt.cigarette.smokeProfile;
  const intensity = rt.state.cigarette.puff.intensity;
  // The cherry's smoke in the design is a ribbon, not a haze: it leaves the tip almost straight
  // up, stays narrow for most of its life, and only wanders at the top. A wide spread, a fast
  // lateral speed and a high turbulence are what turned it into fog.
  return makeBurst(rt, {
    kind: 'puff',
    origin: rt.state.cigarette.pose.tip,
    count: 3 + Math.round(6 * intensity),
    directionDeg: tipAngle(rt),
    spreadDeg: 11,
    speed: [0.004, 0.022],
    radius: [0.005, 0.014],
    lifeMs: [1600, 3400],
    // Dim per particle: the ribbon is built by overlap, and an opaque particle shows its own edge.
    alphaPeak: 0.09 + 0.16 * intensity,
    alphaDecay: 1.1,
    rise: smoke.riseSpeed * (0.95 + 1.45 * intensity),
    turbulence: smoke.turbulence * 0.5,
    scaleGrowth: 1.25,
    heat: clamp01(rt.state.cigarette.ember.brightness),
  });
}

/** Release: the drawn smoke expands outward and up (§14 "smoke expands"). */
export function exhaleBurst(
  rt: EngineRuntime,
  intensity = rt.state.cigarette.puff.intensity,
): Burst {
  const smoke = rt.cigarette.smokeProfile;
  const modifier = rt.environment.smokeModifier;
  const directionDeg = tipAngle(rt) + 8 + releaseSteer(rt);
  // 品鉴型（雪茄 / 小雪茄 / 斗烟 / 水烟）are not drawn into the lungs, so §puffAnimations' tier
  // library is not theirs: the smoke was held in the mouth and leaves on its own slow rhythm
  // （含住两秒再缓缓吐）. The tier table is the inhaled rods' branch below.
  const savourMs = rt.cigarette.puffProfile.savourMs;
  if (savourMs > 0) {
    // The same cloud, given a longer life and less speed and lift — content decides how slow.
    // No `tierRecipe` is attached: this branch deliberately carries no tier fields, so a renderer
    // cannot mistake a mouthed slow cloud for a tiered 柱.
    const slow = 1 + savourMs / 2500;
    const ease = 1 / slow;
    return makeBurst(rt, {
      kind: 'exhale',
      origin: rt.state.cigarette.pose.tip,
      count: Math.round((44 + 86 * intensity) * slow),
      directionDeg,
      spreadDeg: 13,
      speed: [0.01 * ease, (0.028 + 0.04 * intensity) * ease],
      radius: [0.01, 0.03],
      lifeMs: [3600 * slow, 8200 * slow],
      alphaPeak: 0.08 + 0.1 * intensity,
      alphaDecay: 1.9,
      rise: smoke.riseSpeed * modifier.riseSpeed * (1.3 + intensity * 1.3) * ease,
      turbulence: smoke.turbulence * modifier.turbulence * (0.3 + intensity * 0.35),
      scaleGrowth: 1.45,
      heat: clamp01(intensity * 0.35),
    });
  }
  // Inhaled rods: the breath is whatever tier the released press measured — S 细线 / M 团 / L 柱.
  // Nothing here reads intent or a setting, and nothing rolls again: the tier was settled in
  // `endPuff` from the press's own held time, which is exactly what §71 replays.
  const recipe = tieredExhaleOptions(PUFF_TIERS[rt.state.cigarette.puff.lastTier], intensity);
  return makeBurst(rt, {
    ...recipe,
    kind: 'exhale',
    origin: rt.state.cigarette.pose.tip,
    directionDeg,
    rise: recipe.rise * smoke.riseSpeed * modifier.riseSpeed,
    turbulence: recipe.turbulence * smoke.turbulence * modifier.turbulence,
  });
}

/** The lazy column that rises from a smouldering cherry (§15 continuous drift). */
export function driftBurst(rt: EngineRuntime, count = 18): Burst {
  const smoke = rt.cigarette.smokeProfile;
  return makeBurst(rt, {
    kind: 'drift',
    origin: rt.state.cigarette.pose.tip,
    count,
    directionDeg: tipAngle(rt),
    // A smouldering cherry throws a thread, not a cloud. This column is what the player watches for
    // the whole of a rod's burn, and it had drifted to 40 degrees of spread with lobes up to 0.042
    // growing 2.6x — which is the fog the picture does not have.
    spreadDeg: 4,
    speed: [0.003, 0.008],
    radius: [0.005, 0.013],
    lifeMs: [3200, 7800],
    alphaPeak: 0.18,
    alphaDecay: 1.25,
    rise: smoke.riseSpeed * 1.35,
    turbulence: smoke.turbulence * 0.22,
    scaleGrowth: 1.3,
  });
}

export function flareBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'flare',
    origin: rt.state.cigarette.pose.tip,
    count: 8,
    directionDeg: tipAngle(rt),
    spreadDeg: 90,
    speed: [0.02, 0.08],
    radius: [0.004, 0.014],
    lifeMs: [700, 1800],
    alphaPeak: 0.34,
    rise: rt.cigarette.smokeProfile.riseSpeed * 1.4,
    turbulence: rt.cigarette.smokeProfile.turbulence * 1.6,
    heat: 1,
  });
}

export function sparkBurst(rt: EngineRuntime, heat: number): Burst {
  return makeBurst(rt, {
    kind: 'ember',
    origin: rt.state.cigarette.pose.tip,
    count: 14,
    directionDeg: tipAngle(rt),
    spreadDeg: 120,
    speed: [0.03, 0.12],
    radius: [0.002, 0.007],
    lifeMs: [260, 900],
    alphaPeak: 0.7,
    rise: 0.12,
    turbulence: 1.4,
    gravity: 0.35,
    heat,
    tint: rt.cigarette.palette.filter,
  });
}

/** Ash letting go: gritty fragments plus a small grey puff (§18). */
export function ashDustBurst(rt: EngineRuntime, origin: Point, ratio: number): Burst {
  return makeBurst(rt, {
    kind: 'ash',
    origin,
    count: 6 + Math.round(16 * ratio),
    directionDeg: 100,
    spreadDeg: 70,
    speed: [0.004, 0.03],
    radius: [0.0015, 0.006],
    lifeMs: [900, 2400],
    alphaPeak: 0.5,
    rise: -0.02,
    turbulence: 0.7,
    gravity: 0.5,
    tint: rt.cigarette.palette.ash,
    scaleGrowth: 1.1,
  });
}

/** §19: burst first, then a thin trail. */
export function extinguishBurst(rt: EngineRuntime): Burst {
  const style = rt.smokeStyle;
  return makeBurst(rt, {
    kind: 'extinguish',
    origin: rt.state.cigarette.pose.tip,
    count: 46,
    directionDeg: tipAngle(rt) - 10,
    spreadDeg: 110,
    speed: [0.05, 0.18],
    radius: [0.014, 0.06],
    lifeMs: [1400, 3600],
    alphaPeak: 0.34,
    rise: 0.34,
    turbulence: 2.1 * style.swirl,
    scaleGrowth: 2.4,
    tint: mixRgb(rt.state.smoke.tint, [255, 255, 255], 0.2),
  });
}

export function wispBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'drift',
    origin: rt.state.cigarette.pose.tip,
    count: 7,
    directionDeg: tipAngle(rt) - 6,
    spreadDeg: 22,
    speed: [0.004, 0.016],
    radius: [0.008, 0.03],
    lifeMs: [2400, 5200],
    alphaPeak: 0.1,
    rise: 0.1,
    turbulence: 0.8,
  });
}

/** §20: the small puff of dust when it lands in the tray. */
export function discardImpactBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'impact',
    origin: rt.state.anchors.ashtray,
    count: 10,
    directionDeg: -90,
    spreadDeg: 120,
    speed: [0.01, 0.05],
    radius: [0.003, 0.012],
    lifeMs: [500, 1600],
    alphaPeak: 0.3,
    rise: 0.05,
    turbulence: 0.9,
    gravity: 0.4,
    tint: rt.ashtray.material.base,
  });
}

export function lighterBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'lighter',
    origin: rt.state.stage.layout.lighter,
    count: 6,
    directionDeg: -90,
    spreadDeg: 60,
    speed: [0.02, 0.07],
    radius: [0.002, 0.007],
    lifeMs: [220, 700],
    alphaPeak: 0.5,
    rise: 0.2,
    turbulence: 1.2,
    heat: 0.9,
    gravity: -0.1,
  });
}

/** A gust visibly pushes the whole column sideways (§6 wind). */
export function windGustBurst(rt: EngineRuntime, strength: number): Burst {
  return makeBurst(rt, {
    kind: 'drift',
    origin: rt.state.cigarette.pose.tip,
    count: Math.round(12 + 30 * strength),
    directionDeg: rt.state.world.windDirectionDeg,
    spreadDeg: 120,
    speed: [0.04, 0.14 + 0.1 * strength],
    radius: [0.012, 0.05],
    lifeMs: [1800, 4200],
    alphaPeak: 0.3,
    rise: 0.12,
    turbulence: 2.4 * strength,
  });
}

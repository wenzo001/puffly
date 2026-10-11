/**
 * Event models — SPEC.md §21, §22, §69.
 */

import type { CigaretteStateId, SmokeField, WorldSnapshot } from './state';
import type { Point, Range, Rgb } from './geometry';
import type { PuffTierId } from '../puffTier';

/** §69 examples plus the rest of the loop. Wire shape is free-form on purpose. */
export const SessionEventType = {
  SESSION_START: 'SESSION_START',
  SESSION_END: 'SESSION_END',
  /** The §31 countdown finished on its own — a handled craving, not a walked-away one. */
  SESSION_TARGET: 'SESSION_TARGET',
  PICK_UP: 'PICK_UP',
  LIGHT: 'LIGHT',
  LIGHT_FAIL: 'LIGHT_FAIL',
  PUFF: 'PUFF',
  ASH: 'ASH',
  ASH_FALL: 'ASH_FALL',
  WIND: 'WIND',
  RAIN: 'RAIN',
  SMOKE_SWIRL: 'SMOKE_SWIRL',
  EMBER_FLARE: 'EMBER_FLARE',
  ENVIRONMENT_NOISE: 'ENVIRONMENT_NOISE',
  LIGHT_CHANGE: 'LIGHT_CHANGE',
  SHADOW_CHANGE: 'SHADOW_CHANGE',
  AMBIENT_EVENT: 'AMBIENT_EVENT',
  EXTINGUISH: 'EXTINGUISH',
  DISCARD: 'DISCARD',
  CRAVING: 'CRAVING',
  TRIGGER: 'TRIGGER',
  UNLOCK: 'UNLOCK',
  /** A box entered the collection: a fact about the archive, not the scene. */
  PACK: 'pack',
} as const;

export type SessionEventTypeValue = (typeof SessionEventType)[keyof typeof SessionEventType];

/** SPEC.md §69 — field names and optionality kept exactly as specified. */
export interface SessionEvent {
  id: string;

  type: string;

  timestamp: number;

  payload?: Record<string, unknown>;
}

/** §21 — the ids that may appear in an `eventPool`. */
export const WorldEventId = {
  WIND: 'wind',
  RAIN: 'rain',
  ASH_FALL: 'ash_fall',
  EMBER_FLARE: 'ember_flare',
  SMOKE_SWIRL: 'smoke_swirl',
  LIGHTER_FAILURE: 'lighter_failure',
  ENVIRONMENT_NOISE: 'environment_noise',
  LIGHT_CHANGE: 'light_change',
  SHADOW_CHANGE: 'shadow_change',
  AMBIENT_EVENT: 'ambient_event',
} as const;

export type WorldEventIdValue = (typeof WorldEventId)[keyof typeof WorldEventId];

export const WORLD_EVENT_IDS: readonly WorldEventIdValue[] = Object.values(WorldEventId);

/** A live world event: §22 wants these small and mostly unrecognisable as "system events". */
export interface WorldEventOccurrence {
  id: string;
  type: WorldEventIdValue;
  startedAtMs: number;
  endsAtMs: number;
  /** 0..1 — how strong the effect peaks in the middle of its window. */
  strength: number;
  /** Stage position the event is anchored to, when it has one. */
  at?: Point;
  payload?: Record<string, unknown>;
}

/**
 * Scheduling parameters for one world event. `minGapMs`/`maxGapMs` are sampled,
 * never a fixed period — §81 (8) forbids events firing on a schedule.
 */
export interface WorldEventRule {
  id: WorldEventIdValue;
  weight: number;
  gapMs: Range;
  durationMs: Range;
  strength: Range;
  /** Only fires while the cigarette is in one of these states. */
  states?: readonly CigaretteStateId[];
  /** Only while the weather matches. */
  weathers?: readonly string[];
  /** Only during these parts of the day (§24). */
  times?: readonly string[];
}

/** Continuous visuals: the renderer reads this every frame (§48). */
export type BurstKind =
  | 'puff'
  | 'exhale'
  | 'drift'
  | 'ember'
  | 'flare'
  | 'ash'
  | 'extinguish'
  | 'lighter'
  | 'discard'
  | 'impact';

/**
 * A discrete "emit this much smoke/ash/spark now" command.
 *
 * Particles themselves live in the renderer; Game Core only hands over a seeded
 * recipe, which keeps §15's per-particle fields reproducible for §71 replay while
 * still letting §16's variance do its work.
 */
export interface Burst {
  id: string;
  kind: BurstKind;
  /** Renderer derives a per-particle RNG from this — same seed, same smoke. */
  seed: number;
  origin: Point;
  count: number;
  directionDeg: number;
  spreadDeg: number;
  speed: Range;
  radius: Range;
  lifeMs: Range;
  alphaPeak: number;
  alphaDecay: number;
  rise: number;
  turbulence: number;
  scaleGrowth: number;
  gravity: number;
  tint: Rgb;
  /** 0..1 ember heat at emission time, for the first few particles. */
  heat: number;
  /**
   * §puffAnimations, carried only by an `exhale`: the tier the released press landed on, with the
   * tier table's own numbers so a renderer can draw 细线 / 团 / 柱 without re-deriving any of them.
   * The breath's geometry above (`count` / `radius` / `lifeMs` / `rise`) is already shaped by the
   * same tier; these fields are the readable copy of what shaped it, not a second opinion.
   */
  tier?: PuffTierId;
  volumeMl?: 8 | 24 | 35;
  smokeLayers?: Range;
  spreadRadiusPx?: 24 | 52 | 86;
  riseSeconds?: number;
}

/** What adapters subscribe to. Deliberately small (§45): state is continuous, these are discrete. */
export type EngineEvent =
  | { kind: 'burst'; atMs: number; burst: Burst }
  | { kind: 'world'; atMs: number; occurrence: WorldEventOccurrence }
  | { kind: 'session'; event: SessionEvent }
  | {
      kind: 'transition';
      atMs: number;
      from: CigaretteStateId;
      to: CigaretteStateId;
    }
  | { kind: 'unlock'; atMs: number; category: string; id: string };

/** Snapshot view handed to renderers/audio — never a live handle into engine internals. */
export interface WorldView {
  world: WorldSnapshot;
  smoke: SmokeField;
}

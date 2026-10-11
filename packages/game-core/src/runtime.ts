/**
 * The engine's private model.
 *
 * `state` is the observable snapshot (what adapters read); everything the simulation
 * needs but a renderer must not touch lives beside it. Systems receive this object and
 * mutate only what they own — the public view is assembled from it (SPEC.md §48).
 */

import type { IdGenerator, Rng } from '@puffly/shared';
import { clamp01 } from '@puffly/shared';
import { ASH, THRESHOLDS, TIMING } from './constants';
import { levelFor, sessionsToNextLevel } from './levels';
import type { StageLayout } from './stage';
import { CIGARETTE_LENGTH, type Point } from './types/geometry';
import { refreshPose } from './systems/pose';
import type { ContentLookup } from './content/lookup';
import type {
  AshtrayContent,
  CigaretteContent,
  Environment,
  LighterContent,
  SmokeStyleContent,
} from './types/content';
import type { EngineEvent, SessionEvent, WorldEventOccurrence } from './types/events';
import type { GameInput } from './types/input';
import type { InputTarget } from './types/input';
import type { CollectionCategoryValue, Progress } from './types/progress';
import type { Settings } from './types/settings';
import type { GameState } from './types/state';
import type { CigarettePose, CigaretteSnapshot, Readouts } from './types/state';
import type { CollectionSnapshot, ProgressSnapshot, UiHints } from './types/state';

export interface SessionLog {
  id: string;
  seed: number;
  /** Wall clock, matching `Session.startedAt`. */
  startedAt: number;
  startedAtEngineMs: number;
  targetMs: number;
  events: SessionEvent[];
  /** Stored with `timestamp` relative to `startedAt` so replay is portable (§71). */
  inputs: GameInput[];
  triggers: string[];
  cravingBefore?: number;
  cravingAfter?: number;
}

export interface Timers {
  lighterHeldMs: number;
  /** Time since the lighter last flourished, in milliseconds. See `tickFlourish`. */
  flourishMs: number;
  lighterAttempts: number;
  ignitionMs: number;
  ignitionTargetMs: number;
  /** A tap on the lighter keeps the flame going by itself (§0: see it, tap it, it lights). */
  lighterAutoHold: boolean;
  restMs: number;
  extinguishMs: number;
  extinguishBurstDone: boolean;
  /** Set when the rod burned out on its own and the sequence must not abort (§11 NEAR_END). */
  extinguishAuto: boolean;
  puffMs: number;
  puffPlannedMs: number;
  waningMs: number;
  newRodMs: number;
  discardMs: number;
  emberFlareCheckMs: number;
  nextWorldEventMs: number;
  wobblePhaseMs: number;
}

export type EngineListener = (event: EngineEvent) => void;

export interface DragState {
  pointer: Point | null;
  pressed: boolean;
  velocity: Point;
  lastPointer: Point;
  lastPointerAtMs: number;
  pressTarget: InputTarget | null;
  pressAtMs: number;
}

export interface EngineRuntime {
  state: GameState;
  /** Completed fixed steps; the clock is derived from it so replay can match (§71). */
  steps: number;
  /** Wall clock at step 0, so `nowMs` and the real time never drift apart. */
  wallStartMs: number;
  settings: Settings;
  content: ContentLookup;
  rng: Rng;
  ids: IdGenerator;
  cigarette: CigaretteContent;
  environment: Environment;
  lighter: LighterContent;
  ashtray: AshtrayContent;
  smokeStyle: SmokeStyleContent;
  progress: Progress;
  session: SessionLog | null;
  /** Wall clock of the moment the cherry caught, or null before it is lit. */
  litAtWallMs: number | null;
  /**
   * Whether the player has pointed at anything since this engine was created. Before they have,
   * the chrome stays awake: an untouched table is not a moment to be left in, and fading the
   * nudge out of it is how a player ends up staring at a dark screen (§10, §28).
   */
  everTouched: boolean;
  listeners: Set<EngineListener>;
  timers: Timers;
  drag: DragState;
  /** Ash that has not yet rounded up into a visible column. */
  ashCarry: number;
  /** Per-rod smoulder rate variation (§12: two identical cigarettes differ). */
  burnJitter: number;
  activeEvents: WorldEventOccurrence[];
  /** A discard that must land as soon as the cherry is properly out (§20). */
  pendingDiscardMethod: 'drop' | 'flick' | null;
  /**
   * Inputs arrive between steps but are applied *on* a step boundary, with their
   * timestamp snapped to it. That is what makes a recorded session replayable (§71);
   * without it the same inputs would land in different steps on another machine.
   */
  pendingInputs: { atStep: number; input: GameInput }[];
  /** Prop layout in force; swapped by `setStageAspect` when the window changes shape. */
  layout: StageLayout;
  /** Stage box width / height in pixels, for the anisotropic hit metric. */
  stageAspect: number;
  /** What the currently running world events are adding to the scene this tick. */
  worldBoost: WorldBoost;
  /** Fractional particle budget so the ambient column stays even (§15). */
  smokeEmissionCarry: number;
  /**
   * The wind's current gust, eased. A gust is a minute of weather rather than a frame of dice,
   * and holding it here is what lets the scene rest instead of shivering (§66).
   */
  windGust: number;
}

/** Summed contribution of live world events (SPEC.md §21-23, §25). */
export interface WorldBoost {
  wind: number;
  turbulence: number;
  flash: number;
  shadow: number;
  ambient: number;
  rain: number;
}

export function createWorldBoost(): WorldBoost {
  return { wind: 0, turbulence: 0, flash: 0, shadow: 0, ambient: 0, rain: 0 };
}

export function createTimers(nowMs: number): Timers {
  return {
    lighterHeldMs: 0,
    flourishMs: 0,
    lighterAttempts: 0,
    ignitionMs: 0,
    ignitionTargetMs: 0,
    lighterAutoHold: false,
    restMs: Number.POSITIVE_INFINITY,
    extinguishMs: 0,
    extinguishBurstDone: false,
    extinguishAuto: false,
    puffMs: 0,
    puffPlannedMs: 0,
    waningMs: 0,
    newRodMs: 0,
    discardMs: 0,
    emberFlareCheckMs: 0,
    nextWorldEventMs: nowMs,
    wobblePhaseMs: 0,
  };
}

export function createPose(
  state: CigaretteSnapshot['state'],
  angleDeg: number,
  layout: StageLayout,
): CigarettePose {
  const pivot: Point =
    state === 'IDLE'
      ? { ...layout.table }
      : state === 'DISCARDED'
        ? { ...layout.ashtray }
        : { ...layout.restPivot };
  const pose: CigarettePose = {
    pivot,
    tip: { ...pivot },
    ashTip: { ...pivot },
    angleDeg,
    wobbleDeg: 0,
    rodLength: CIGARETTE_LENGTH,
    ashLength: 0,
    length: CIGARETTE_LENGTH,
    thickness: 0.016,
    visible: true,
    inTray: state === 'DISCARDED',
    dragged: false,
    atFlame: 0,
  };
  refreshPose(pose, 1, 0);
  return pose;
}

/**
 * The millimetres and grams the interface reads off the stick. One function, called wherever the
 * rod's geometry just changed, so a phone, a desktop window and a replayed session all say the
 * same number about the same column of ash (§79). Rounded to what a person could notice.
 */
/**
 * 2026-10-08 拍板 ②: the grammes of ash a stick has made by now.
 *
 * One home for the formula, because two numbers have to agree with it: the readout the player reads
 * off the rod, and the mass a flicked column carries into the tray. The tray can never hold more than
 * the stick produced, and a stick's whole output is the one figure its content names.
 */
export function ashProducedGrams(type: CigaretteContent, rodRemaining: number): number {
  return clamp01(1 - rodRemaining) * type.physical.ashGrams;
}

export function deriveReadouts(
  type: CigaretteContent,
  rodRemaining: number,
  ashLength: number,
): Readouts {
  const { lengthMm } = type.physical;
  const tenth = (value: number): number => Math.round(value * 10) / 10;
  return {
    puffsTarget: type.physical.puffs.target,
    ashMm: tenth(clamp01(ashLength / CIGARETTE_LENGTH) * lengthMm),
    rodMm: tenth(clamp01(rodRemaining) * lengthMm),
    // Ash is what the burn has already turned into, whether it is still leaning on the rod or
    // lying in the tray — so it only ever grows, and a finished stick reports its full figure.
    ashGrams: Math.round(ashProducedGrams(type, rodRemaining) * 100) / 100,
    savourMs: type.puffProfile.savourMs,
  };
}

export function createCigaretteSnapshot(
  type: CigaretteContent,
  rng: Rng,
  angleDeg: number,
  poseState: CigaretteSnapshot['state'],
  layout: StageLayout,
): CigaretteSnapshot {
  const burnMsTotal = rng.range(type.burnDuration.min, type.burnDuration.max);
  const snapshot: CigaretteSnapshot = {
    state: poseState,
    typeId: type.id,
    smokeStyleId: type.smokeStyleId,
    soundProfileId: type.soundProfileId,
    rodRemaining: 1,
    lengthRemaining: 1,
    burnMsTotal,
    burnMsElapsed: 0,
    ember: {
      brightness: 0,
      flare: 0,
      flicker: 0,
      temperature: 0,
      glowRadius: 0,
      lit: false,
    },
    ash: {
      length: 0,
      maxLength: type.ashProfile.maxLength,
      criticalLength: type.ashProfile.maxLength * THRESHOLDS.ashCriticalRatio,
      ratio: 0,
      bend: 0,
      ready: false,
      falling: [],
      dropped: 0,
      droppedGrams: 0,
    },
    puff: {
      active: false,
      progress: 0,
      intensity: 0,
      lastDraw: 0,
      heldMs: 0,
      // Not `Infinity`: that would turn into `null` on the way through JSON, and §51 makes a
      // save file out of this model. One settle-window means "there was no previous puff".
      sinceReleaseMs: TIMING.restSettleMs,
      lipAction: null,
      // No draw has happened yet; a short sip is what the tier table starts at.
      lastTier: 'S',
      count: 0,
      load: 0,
    },
    pose: createPose(poseState, angleDeg, layout),
    readouts: deriveReadouts(type, 1, 0),
    extinguishProgress: 0,
    discardProgress: 0,
  };
  return snapshot;
}

export function createEmptyProgress(startedAt: number, dayKey: string): Progress {
  return {
    version: 1,
    startedAt,
    dayNumber: 1,
    sessions: 0,
    puffs: 0,
    ashDropped: 0,
    longestStreakDays: 1,
    unlocked: {
      cigarettes: [],
      lighters: [],
      environments: [],
      ashtrays: [],
      smoke: [],
      sounds: [],
    },
    acknowledgedUnlocks: [],
    lastActiveDayKey: dayKey,
    activeDays: [dayKey],
  };
}

export function emptyCollection(): CollectionSnapshot {
  const unlocked = {} as Record<CollectionCategoryValue, string[]>;
  // Recomputed from the bundle on the first tick; nothing is unlocked at zero.
  return { unlocked, fresh: [], unlockedSkins: [] };
}

export function projectProgress(progress: Progress, smokeFreeDays: number): ProgressSnapshot {
  return {
    dayNumber: progress.dayNumber,
    smokeFreeDays,
    sessionCount: progress.sessions,
    level: levelFor(progress.sessions),
    sessionsToNextLevel: sessionsToNextLevel(progress.sessions),
    collectedPacks: [...(progress.collectedPacks ?? [])],
    puffs: progress.puffs,
    ashDropped: progress.ashDropped,
    // Optional on the way in for the same reason the cabinet is: a save written before 拍板 ② has no
    // gram figure, and zero ash is a fact about that save rather than a missing field.
    ashGrams: progress.ashGrams ?? 0,
  };
}

export function createUiHints(nowMs: number, targetMs: number): UiHints {
  return {
    lastInputMs: 0,
    idleMs: nowMs,
    controlsVisible: true,
    chromeFolded: false,
    sessionActive: false,
    sessionRemainingMs: targetMs,
    sessionTargetMs: targetMs,
    // The engine opens on a rod lying on the table, and that is already a suggestion: the first
    // frame must not be the one moment the scene has nothing to say (§28).
    affordance: 'pick',
  };
}

export const ASH_FRAGMENT_SCALE = ASH.fragmentsPerFlick;

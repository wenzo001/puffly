import type { EngineEvent } from './types/events';
import type { GameInput } from './types/input';
import type { Settings } from './types/settings';
import type { GameStateView } from './engine';

/**
 * Game Core public surface — SPEC.md §45, §47, §86.
 *
 * This layer is TypeScript only: no Vue, no DOM, no Canvas, no IndexedDB, no Tauri, no
 * Web Audio. Everything platform-shaped leaves through an adapter interface that the
 * renderer, audio and storage packages implement.
 */

export * from './types/geometry';
export * from './types/content';
export * from './types/events';
export * from './types/input';
export * from './types/progress';
export * from './types/save';
export * from './types/session';
export * from './types/settings';
export * from './types/state';

export {
  AMBIENT_STATES,
  CIGARETTE_STATES,
  TRANSITIONS,
  allowedNext,
  canTransition,
  deriveAmbientState,
  isHeld,
  isLit,
  type AmbientSignals,
} from './stateMachine';

export { rollPack } from './packs';
export {
  LIP_ACTIONS,
  PUFF_TIERS,
  lipActionsFor,
  pickLipAction,
  puffTierFor,
  showsLipLine,
  type AirflowShape,
  type LipAction,
  type LipActionId,
  type LipShape,
  type PuffTier,
  type PuffTierId,
} from './puffTier';

export {
  ASH,
  ANGLES,
  BURN,
  EMBER,
  HIT,
  LAYOUT,
  PUFF,
  SMOKE,
  THRESHOLDS,
  TIME_OF_DAY_HOURS,
  TIMING,
  WORLD,
  STEP_MS,
} from './constants';

export {
  ACHIEVEMENTS,
  DECK_PACING,
  achievementsFor,
  reachedCount,
  twoMonthTotal,
  type Achievement,
  type AchievementAxis,
  type AchievementLedger,
  type AchievementRung,
} from './achievements';

export { createContentLookup, ContentError, type ContentLookup } from './content/lookup';
export {
  anchorForTarget,
  computeAnchors,
  hitCandidates,
  inputPoint,
  isInside,
  resolveTarget,
} from './anchors';
export {
  STAGE_LAYOUTS,
  CHROME_BAND_PX,
  CHROME_CLEAR_Y,
  CHROME_EDGE_PX,
  chromeClearY,
  STAGE_MAX_ASPECT,
  STAGE_MIN_ASPECT,
  TOUCH_HIT_PAD,
  TOUCH_HIT_TOLERANCE,
  TALL_ASPECT_MAX,
  WIDE_ASPECT_MIN,
  hitToleranceFor,
  layoutFor,
  stageBoxFor,
  stageDistance,
  touchReach,
  type StageBox,
  type StageLayout,
} from './stage';

export {
  createEngine,
  type EngineOptions,
  type GameEngine,
  type GameStateView,
  type Affordance,
} from './engine';
export { replaySession, sessionEventTypes, type ReplayOptions, type ReplayResult } from './replay';
export { deriveSmokeCharacter, ventDraught } from './systems/smoke';
export { emberHeat, emberPresence } from './systems/ember';
export { plumeFor, type PlumeShape } from './systems/emissions';

export {
  collectionSnapshot,
  evaluateUnlocks,
  initialUnlocks,
  itemKey,
  ruleSatisfied,
  smokeFreeDays,
  takeSubstitute,
  unlockablesFrom,
  type Unlockable,
} from './progress';
export { LEVEL_THRESHOLDS, levelFor, sessionsToNextLevel } from './levels';
export {
  closeSession,
  isSessionTargetReached,
  openSession,
  recordCraving,
  recordTrigger,
  sessionWasLit,
} from './session';

/** Adapter contracts: the seams a platform implements (SPEC.md §45, §50, §79, §86). */
export interface RendererAdapter {
  /** Called once per animation frame by the shell. Must not mutate state (§48). */
  render(state: GameStateView, dtMs: number): void;
  resize(widthPx: number, heightPx: number, devicePixelRatio: number): void;
  dispose(): void;
}

export interface AudioAdapter {
  /** Reacts to the discrete half of the model: bursts and world events (§26). */
  handle(event: EngineEvent, state: GameStateView): void;
  setSettings(settings: Settings): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export interface InputSink {
  /** The shell converts native events into `GameInput`s and hands them over (§49). */
  send(input: GameInput): void;
}

export interface ClockSource {
  now(): number;
}

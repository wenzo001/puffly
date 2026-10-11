/**
 * Runtime state — SPEC.md §11, §12, §17-20, §23-25, §48.
 *
 * This is the only thing an adapter is allowed to look at. It is continuous (read
 * every frame), while discrete happenings travel as `EngineEvent`s.
 */

import type { Rgb } from '@puffly/shared';
import type { Environment, SmokeCharacter, TimeOfDayId, WeatherId } from './content';
import type { StageLayout } from '../stage';
import type { WorldEventOccurrence } from './events';
import type { Point } from './geometry';
import type { LipActionId, PuffTierId } from '../puffTier';

/**
 * SPEC.md §11 — the eleven lifecycle states.
 *
 * `LIGHTING`, `PUFFING`, `EXTINGUISHING` are interaction-driven (sticky: they last
 * as long as the player is doing the thing). `BURNING`, `RESTING`, `ASH_READY`,
 * `NEAR_END` are derived from the simulation, in that priority order, so a cigarette
 * that is long-asked-for *and* nearly gone still reads as `NEAR_END`.
 */
export type CigaretteStateId =
  | 'IDLE'
  | 'PICKED_UP'
  | 'LIGHTING'
  | 'BURNING'
  | 'PUFFING'
  | 'RESTING'
  | 'ASH_READY'
  | 'NEAR_END'
  | 'EXTINGUISHING'
  | 'EXTINGUISHED'
  | 'DISCARDED';

/** §17. */
export interface EmberState {
  /** 0..1 logical brightness. */
  brightness: number;
  /** Transient spike from a flare, decaying back to `brightness` (§17: "突然亮了一下"). */
  flare: number;
  /** -1..1 low-frequency noise, so the ember never looks mechanical (§59). */
  flicker: number;
  /** 0..1 "temperature illusion" ramp the renderer maps onto colour. */
  temperature: number;
  glowRadius: number;
  lit: boolean;
}

/** One piece of ash already let go of the rod (§18). */
export interface AshFragment {
  id: string;
  seed: number;
  origin: Point;
  /** Half-thickness of the piece, normalised units. A grain is the whole body; a flake is its edge. */
  size: number;
  /**
   * S7's 「先从灰柱断裂」: the length of a piece that broke off as a body, in normalised units, or `0`
   * for a grain. It is the column's own length rather than a drawing choice, because a renderer that
   * invented one would put the ash's tip somewhere the core has never heard of.
   */
  length: number;
  /**
   * The frame this piece stops being one body. `0` means it never breaks — which is what a grain is.
   */
  breaksAtMs: number;
  /** How many grains a piece becomes when its time comes. `0` for a grain. */
  shards: number;
  /**
   * 2026-10-08 拍板 ②: the grammes this piece carries, and `0` once it has been accounted for. It is
   * state rather than something the renderer works out, because the tray's number and the drawn mound
   * have to be the same ash — and a piece that lands outside the tray is ash nobody has swept up.
   */
  grams: number;
  rotation: number;
  spin: number;
  /** Normalised units per second. */
  vx: number;
  vy: number;
  settledAtMs: number;
}

/** §18. */
export interface AshState {
  length: number;
  /** Ash this long is about to let go on its own. */
  maxLength: number;
  /** Ash this long is the "please flick me" threshold (`ASH_READY`). */
  criticalLength: number;
  ratio: number;
  /** Radians of lean that grows with `ratio` (§18: 轻微弯曲). */
  bend: number;
  ready: boolean;
  falling: AshFragment[];
  /** Count of ash pieces dropped, for §33 style derivation. */
  dropped: number;
  /**
   * Grammes this stick has already let go of. With `readouts.ashGrams` (what the burn has made) it
   * closes the book on 拍板 ②: what is standing on the rod is exactly the difference, so a flick
   * cannot report a mass the stick never had, and the tray cannot gain more than the rod lost.
   */
  droppedGrams: number;
}

/** §14. */
export interface PuffState {
  active: boolean;
  /** 0..1 through this puff's planned duration. */
  progress: number;
  /**
   * 0..1 draw strength, gameified from `puffProfile.intensityMin/Max`. It is the *live* value: it
   * fades to 0 after the release, which is what the plume thins on. What the interface reads for
   * the exhale is `lastDraw`, because a reading of a finished draw must not move.
   */
  intensity: number;
  /**
   * 0..1 the strength of the draw that last ended, held from the release until the next draw begins.
   * The exhale screen reads this (稿子 S4 环内力度): `intensity` cannot be read there, because it is
   * on its way to zero while the smoke is still on screen.
   */
  lastDraw: number;
  heldMs: number;
  /**
   * The lip action this draw is on — one of §puffAnimations' nine, drawn from the tier the
   * held time has reached and never the one just shown. This is the only state the no-repeat
   * rule needs: the tier itself is read off `heldMs`, and the action has to survive the draw
   * ending, because the next roll is the next draw. `null` before the first one.
   */
  lipAction: LipActionId | null;
  /**
   * The tier the draw that just ended landed on, measured from its own held time. Held from the
   * release until the next draw begins, the same way `lastDraw` is, because the exhale's *shape*
   * (§puffAnimations: volume, layers, spread, rise time) is decided by the tier, and `heldMs` is
   * already back to zero while that smoke is still on screen.
   */
  lastTier: PuffTierId;
  /** Since the previous release; drives `RESTING` and the exhale shape. */
  sinceReleaseMs: number;
  count: number;
  /** Rolling 0..1 "how full are the lungs", quietly raises burn rate. */
  load: number;
}

/** Where the cigarette is drawn and hit-tested. Core owns it so every platform agrees (§79). */
export interface CigarettePose {
  pivot: Point;
  /** Boundary between rod and ember. */
  tip: Point;
  /** Far end of the ash column. */
  ashTip: Point;
  angleDeg: number;
  /** Slow organic lean, degrees (SPEC.md §59: slightly imperfect). */
  wobbleDeg: number;
  rodLength: number;
  ashLength: number;
  /** rod + ash, what the renderer measures. */
  length: number;
  thickness: number;
  visible: boolean;
  inTray: boolean;
  dragged: boolean;
  /**
   * 0..1 how far the burning end sits inside the lighter's flame. Lighting is a motion rather than
   * a state transition, so the fire has to be able to say "not yet": this is the one number both
   * the ignition gate and any cue that points at the moment agree on.
   */
  atFlame: number;
}

/**
 * The measurements the interface reads off the stick. Core owns this arithmetic so a phone, a
 * desktop and a replayed session all say the same number about the same column of ash (§79);
 * the shell only formats it. Rounded to what a person could actually notice.
 */
export interface Readouts {
  /** Draws this rod is planned for — the denominator of "6 / 12". */
  puffsTarget: number;
  /** Millimetres of ash standing on the rod right now. */
  ashMm: number;
  /** Millimetres of rod still unburnt. */
  rodMm: number;
  /** Grammes of ash this stick has made so far, whether it is still leaning on the rod or in the tray. */
  ashGrams: number;
  /**
   * How long this rod wants its smoke held in the mouth, in milliseconds — `0` for a rod that is
   * inhaled. It is a measurement of the rod rather than a mode, so the pill can name the gesture
   * the way the rod asks for it without the interface being told which category it is holding.
   */
  savourMs: number;
}

export interface CigaretteSnapshot {
  state: CigaretteStateId;
  typeId: string;
  smokeStyleId: string;
  soundProfileId: string;
  /** 0..1 unburnt paper portion (the "stub" feel). */
  rodRemaining: number;
  /** Visible column (rod + ash) as a fraction of a pristine cigarette. */
  lengthRemaining: number;
  burnMsTotal: number;
  burnMsElapsed: number;
  ember: EmberState;
  ash: AshState;
  puff: PuffState;
  pose: CigarettePose;
  readouts: Readouts;
  /** 0..1 through §19's pressure interaction. */
  extinguishProgress: number;
  /** 0..1 through §20's discard animation. */
  discardProgress: number;
}

/** §15/§16: continuous smoke behaviour the renderer's particle system consumes. */
export interface SmokeField {
  density: number;
  turbulence: number;
  riseSpeed: number;
  dispersion: number;
  /** Velocity field offset from wind, normalised units per second. */
  drift: Point;
  /**
   * The rod's plume personality. Derived from `smokeProfile` when content does not name
   * one, and consumed by both the burst recipes and the renderer, which is what makes a
   * Mist pour while an Ember blooms (§13, §16).
   */
  character: SmokeCharacter;
  visibility: number;
  tint: Rgb;
  /** Particles per second the ambient emitter should produce right now. */
  emissionRate: number;
}

export interface LightingField {
  ambient: number;
  warmth: number;
  keyDirectionDeg: number;
  contrast: number;
  /** How strongly smoke reads against this background (§23, §24). */
  smokeVisibility: number;
  /** Momentary brightening from `light_change` / passing traffic (§22). */
  flash: number;
}

export interface WorldSnapshot {
  environmentId: string;
  timeOfDay: TimeOfDayId;
  weather: WeatherId;
  wind: number;
  windDirectionDeg: number;
  light: LightingField;
  /**
   * 0..1, from `shadow_change`. The darkening it causes is already folded into
   * `light.ambient` (see `tickWorld`), so a reader must not subtract it a second time; it is
   * kept as the reported fact of the event, which is what makes the event replayable.
   */
  shadow: number;
  ambientGain: number;
  activeEvents: WorldEventOccurrence[];
}

/**
 * Which tray is on the table, in the only sense the audio adapter needs. The picture already gets
 * the material from `style.ashtray`; without the ids here the four of them are one object to the
 * half of the game that has to make their sound.
 *
 * `grams` is the fifth sense: what the tray is actually holding. The deck puts a gram figure on the
 * ashtray itself (S5 的 2.1 g), so the number belongs to the tray rather than to the stick — and the
 * drawn mound reads the same field, so the pile and the number cannot disagree (§15).
 */
export interface AshtraySnapshot {
  typeId: string;
  soundProfileId: string;
  extinguishProfileId: string;
  /** Grammes that have landed in this tray. Emptied only by the tray being changed. */
  grams: number;
}

/**
 * The pack. One field, and it is the same kind of field as `lighter.fidget`: a decaying impulse, so
 * a tapped pack is a *happening* rather than a mode the scene can get stuck in. It is state and not
 * a drawing trick for the same reason the lid is: the nudge, the rods shifting inside it, and the
 * answer to a tap that has no work to do all have to agree on when it happened.
 */
export interface PackSnapshot {
  fidget: number;
}

export interface LighterSnapshot {
  typeId: string;
  engaged: boolean;
  /** 0..1 flame size while held. */
  flame: number;
  /** Milliseconds this attempt has been held for — the "0.4s" the ignition ring counts up. */
  heldMs: number;
  flicker: number;
  /** 1 for a moment when `lighter_failure` bites (§21). */
  sputter: number;
  /**
   * 0..1 impulse of a flourish: the cap flicked and the wheel thrown once. Decays on its own, so
   * it is a *happening* rather than a mode — which is what lets the same field carry a player's
   * idle flick of the wrist and the room doing it to itself.
   */
  fidget: number;
  /**
   * 0..1 how far the hinged lid has thrown back. This is state and not a drawing trick because
   * the flip-top's whole identity is the moment the lid is mid-way open — and the picture, the
   * click it should make, and the idle flourishes all have to agree on when that is.
   */
  lid: number;
}

/**
 * The one place the core decides "should chrome be on screen?" so web, desktop and
 * mobile all fade their controls on the same rule (SPEC.md §10, §81 (5)).
 */
export interface UiHints {
  lastInputMs: number;
  idleMs: number;
  controlsVisible: boolean;
  /**
   * The player asked for the interface away — a swipe down over nothing. The scene keeps living
   * and the rod keeps burning; only the chrome, the sheets and the hint word fold. The next touch
   * on a thing brings them back (§10: the fade is the player's, not a timer's).
   */
  chromeFolded: boolean;
  sessionActive: boolean;
  sessionRemainingMs: number;
  sessionTargetMs: number;
  /** What the player is most likely about to do — used to nudge one affordance only. */
  affordance: 'pick' | 'lighter' | 'puff' | 'flick' | 'extinguish' | 'discard' | 'none';
}

/** The stage the scene is laid out on: shape, and the prop table that fits it. */
export interface StageFrame {
  /** Stage box width / height, in pixels. */
  aspect: number;
  layout: StageLayout;
}

export interface StageAnchors {
  lighter: Point;
  ashtray: Point;
  /** The pack on the table — where 取烟 comes from, and now a thing a tap can be aimed at. */
  pack: Point;
  body: Point;
  ember: Point;
  ash: Point;
  /** Where the rod starts, so the whole rod answers a tap and not only its middle. */
  rodStart: Point;
  /** The far end of the ash column, which is where a flick should land. */
  ashEnd: Point;
  ashtrayRadius: number;
}

/**
 * Everything the renderer needs to *draw*, flattened into one block by the engine so a
 * renderer only ever consumes state — never a content object (SPEC.md §48, §79). The
 * numbers are content-derived, but the engine is the single place that reads content.
 */
export interface SceneStyle {
  cigarette: { paper: Rgb; band: Rgb; filter: Rgb; ash: Rgb };
  /**
   * The two colours the renderer used to carry in its own source: the cherry's hot core and the
   * pool of light the table sits in. They live here so a skin (§ S15) has somewhere to write —
   * four layers, all of them colour, none of them a number the simulation reads.
   */
  scene: { ember: Rgb; pool: Rgb };
  lighter: { flameHeight: number; hue: Rgb; sparkles: number };
  ashtray: { base: Rgb; rim: Rgb; reflect: number };
  smoke: { opacity: number; blur: number; swirl: number };
}

export interface GameState {
  /** Bumped on every tick; adapters may skip work when it is unchanged. */
  revision: number;
  /** What the scene should look like, assembled from content by the engine. */
  style: SceneStyle;
  /** Stage shape and the prop layout chosen for it (SPEC.md §55). */
  stage: StageFrame; /** Engine clock: ms since the engine was created. */
  nowMs: number;
  /** Wall clock of the same instant, for time-of-day and statistics. */
  wallClockMs: number;
  seed: number;
  cigarette: CigaretteSnapshot;
  smoke: SmokeField;
  world: WorldSnapshot;
  lighter: LighterSnapshot;
  ashtray: AshtraySnapshot;
  pack: PackSnapshot;
  ui: UiHints;
  anchors: StageAnchors;
  progress: ProgressSnapshot;
  collection: CollectionSnapshot;
  environment: Environment;
}

export interface ProgressSnapshot {
  dayNumber: number;
  smokeFreeDays: number;
  sessionCount: number;
  /** 1-based rung of `LEVEL_THRESHOLDS` this ledger sits on. */
  level: number;
  /** Breaks still needed to reach the next rung, or 0 at the top of the ladder. */
  sessionsToNextLevel: number;
  puffs: number;
  ashDropped: number;
  /**
   * 拍板 ②'s lifetime number: every gramme of ash that has fallen, in the tray or on the floor. The
   * tray holds a part of it, the ledger holds all of it, and 统计与将来的成就读的是这一条。
   */
  ashGrams: number;
  /** The boxes the collection holds, mirrored for the cabinet (S19). */
  collectedPacks: string[];
}

export interface CollectionSnapshot {
  unlocked: Record<string, string[]>;
  /** Items that just unlocked: fade them in, never a dialog (§39, §62). */
  fresh: string[];
  /**
   * S18: which skins the ladder has let through. Kept apart from `unlocked` because a skin is
   * never collected — it is applied, and the thing that gates it is the same rule read against a
   * different ledger (§6.1).
   */
  unlockedSkins: string[];
}

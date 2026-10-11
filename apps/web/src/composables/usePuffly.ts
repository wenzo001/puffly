/**
 * The shell's only place that knows about engines, adapters and storage (SPEC.md §45).
 *
 * Vue deliberately does *not* drive the simulation: the rAF loop calls `engine.tick`, the
 * the scene draws, and a summary is republished a few times per second so components
 * re-render on a human scale instead of once per particle (§54, §81 (9), §81 (10)).
 */

import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';
import { formatClock } from '@puffly/shared';
import {
  anchorForTarget,
  createDefaultSettings,
  createEngine,
  SessionEventType,
  type CollectionItem,
  type EngineEvent,
  type GameEngine,
  type ContrastMode,
  type GameStateView,
  type QualityMode,
  type Selection,
  type Session,
  type Settings,
} from '@puffly/game-core';
import { buildCollectionItems, createDefaultLookup, DEFAULT_IDS } from '@puffly/game-content';
import { createViewport } from '@puffly/game-scene';
import {
  deriveJourney,
  deriveReduction,
  deriveStatistics,
  deriveTodayView,
  deriveTriggerBreakdown,
  type JourneyStop,
  type Statistics,
  type ReductionView,
  type TodayView,
  type TriggerCount,
} from '@puffly/game-statistics';
import { createAudioBridge, type AudioBridge } from '../services/audio';
import { createPersistence, type Persistence } from '../services/persistence';
import {
  createKeyboardAdapter,
  createPointerAdapter,
  toCanvasFraction,
  createSurfaceGuard,
  targetForAffordance,
} from './useInputAdapters';
import type { ScenePalette, SkinPalette } from '@puffly/game-core';

/**
 * What the scene is told about looks. It used to be the Canvas renderer's own settings type — the
 * name and the field set are kept because the scene wants exactly these seven answers, and
 * `realism-row.test.ts` reads the Pick union on `rendererLook` as the wiring proof.
 */
export interface RendererSettings {
  reducedMotion: boolean;
  quality: QualityMode;
  /** §64: raised smoke opacity and a lit rim on the rod, for a readable silhouette. */
  contrast: ContrastMode;
  /** S6's 写实度 row (0 = 卡通, 1 = 写实, 0.8 = the deck's own split). */
  realism: number;
  /** The applied skin's palette, or null for the content's own colours (§47). */
  skin: SkinPalette | null;
  /** The player's own room colours, or null to keep the place's own. */
  customBackground: ScenePalette | null;
  /** §63: nothing can be heard, so the discrete cues have to be seen. */
  visualCues: boolean;
}
import { HINT_KEYS, createI18n, resolveLocale, type I18n, type LocaleCode } from '../i18n';
import { anchorAtLight } from '../anchor';
import { isOverLimit } from '../limit';
import { phaseOf, type Phase } from '../phase';

const AIM_KEYS = ['body', 'ember', 'lighter', 'ashtray', 'pack'] as const;

/**
 * The five points a check outside the page aims with, in fractions of the canvas element.
 *
 * The props are not at fixed numbers: the table lifts clear of the chrome (§55) and the canvas
 * letterboxes the stage inside it, so a position is a function of the window. This is why the
 * browser layer reads them instead of carrying a copy — the copy it used to carry had gone stale
 * twice over and reported a working game as eight broken ones.
 */
function aimOf(
  state: GameStateView,
  box: {
    cssWidth: number;
    cssHeight: number;
    stage: { x: number; y: number; width: number; height: number };
  },
): string {
  const round = (value: number): number => Math.round(value * 1e4) / 1e4;
  return AIM_KEYS.map((key) => {
    const at = state.anchors[key];
    const fraction = toCanvasFraction(at.x, at.y, box);
    return `${key}:${String(round(fraction.x))},${String(round(fraction.y))}`;
  }).join(' ');
}

/** The stage rectangle inside the canvas, as fractions of the canvas. */
function boxOf(box: {
  cssWidth: number;
  cssHeight: number;
  stage: { x: number; y: number; width: number; height: number };
}): string {
  const round = (value: number): number => Math.round(value * 1e4) / 1e4;
  const w = Math.max(1, box.cssWidth);
  const h = Math.max(1, box.cssHeight);
  return [box.stage.x / w, box.stage.y / h, box.stage.width / w, box.stage.height / h]
    .map((v) => String(round(v)))
    .join(',');
}

/** How often chrome is allowed to re-render (§54). */
const SUMMARY_INTERVAL_MS = 200;
/** A break is over when nothing is burning and the player has gone quiet this long. */
const IDLE_CLOSE_MS = 90_000;
/**
 * How much of a hidden tab's elapsed time is handed back to the simulation.
 *
 * A phone that sleeps with a lit rod must wake to a rod that kept burning: the simulation is a
 * function of time, not of animation frames, and browsers stop calling `requestAnimationFrame`
 * in a background tab. The cap is generous enough to burn a whole rod (about 190 s) and small
 * enough that a tab reopened a week later catches up in milliseconds instead of minutes.
 */
const CATCH_UP_MIN_MS = 500;
/** How long an interrupted break is still worth resuming: longer than any rod's life. */
const INTERRUPTED_MAX_AGE_MS = 30 * 60_000;
/** The record is rewritten at most this often while a break runs. */
const BREAK_WRITE_MS = 1500;
const CATCH_UP_MAX_MS = 8 * 60_000;
/** Keep the canvas from costing more than it can show. */
const MAX_DPR = 3;

/**
 * The pixel-ratio cap the interface has always promised (§54): 2 on a finger, 3 on a cursor.
 * Exported because the scene canvas is the only canvas now, and it has to take the same medicine —
 * an uncapped 3x backing store on a phone is exactly the cost this rule exists to refuse.
 */
export function preferredDpr(): number {
  return Math.min(
    window.devicePixelRatio || 1,
    matchMedia('(pointer: coarse)').matches ? MAX_DPR_COARSE : MAX_DPR,
  );
}

/** A phone at 3x is 3.4 million pixels of smoke per frame; it cannot show the difference. */
const MAX_DPR_COARSE = 2;

/**
 * Frame time → quality tier, for a player who never chose one (§54, §64).
 *
 * `auto` is not a promise that something is fast: the only honest way to keep 60 FPS on an
 * unknown device is to look at the frames that actually arrived. The ladder goes down twice
 * as eagerly as it comes back up, so a single dropped frame cannot make the scene flicker
 * between budgets.
 */
const AUTO_TIERS: readonly QualityMode[] = ['high', 'balanced', 'light'];
/** Below this an average frame is late; above it, the device has room to spare. */
const SLOW_FRAME_MS = 22;
const FAST_FRAME_MS = 13.5;
/** ~1/8 of a second of frames, so one stall from a background tab is not a trend. */
const FRAME_SMOOTHING = 0.06;

function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** A phone or tablet starts a tier down: its GPU is real, and so is its pixel count. */
function startingTier(): QualityMode {
  if (!coarsePointer()) return 'high';
  const cores = typeof navigator === 'undefined' ? 8 : (navigator.hardwareConcurrency ?? 8);
  return cores <= 4 ? 'light' : 'balanced';
}

/** The device's own list, preferred language first. Empty on a shell with no navigator. */
function deviceLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  const listed = navigator.languages ?? [];
  const out = [...listed];
  if (typeof navigator.language === 'string') out.push(navigator.language);
  return out;
}

/**
 * Where the scene's one piece of guidance sits, in CSS pixels on the stage, above the thing it names:
 * a word where the tier has one, and the diagram S15 asked for where it has none.
 */
export interface HintWord {
  /** '' in the wordless tier — the picture is what gets shown then. */
  word: string;
  picture: HintPicture | null;
  x: number;
  y: number;
}

export type { ArchiveFacts, BoxArchiveFacts, RodArchiveFacts } from '../archiveModel';
import { archiveFacts as factsFor, type ArchiveFacts } from '../archiveModel';
import { SWELL_RUNGS, hapticPattern, shapeForEvent, swellRung, type HapticShape } from '../haptics';
import { hintPictureFor, type HintPicture } from '../hintArt';

export interface Summary {
  state: GameStateView | null;
  /** The break's countdown, mm:ss — what is left of the time the player asked for. */
  clock: string;
  /** 已燃: how long this rod has actually been burning, mm:ss. */
  burned: string;
  sessionActive: boolean;
  controlsVisible: boolean;
  affordance: string;
  /** Which of the design's three phases the rail and the HUD are reading (§9.2). */
  phase: Phase;
  /** `.stage[data-aim]`: where the touchable things are, in fractions of the canvas. */
  aim: string;
  /**
   * `.stage[data-stage-box]`: the stage rectangle inside the canvas (letterboxed by the aspect
   * rule), as fractions. A scene that only knew the canvas could not tell where the stage begins —
   * the same reason the anchors are published rather than recomputed.
   */
  stageBox: string;
  /**
   * `.stage[data-prop-scale]`: the ashtray's radius in stage units, straight off the core's anchors.
   * A prop's size is a fact about the layout, so it travels the same road as the anchors.
   */
  propScale: string;
  /**
   * S20's `onReach`: the ceiling has been passed, so the ring goes grey and its digits become a
   * mark. The break is not stopped, locked or annotated — the interface just stops advertising it.
   */
  overLimit: boolean;
  hint: HintWord | null;
  /**
   * Which channel is carrying the cues right now (§63). Mirrored onto the stage as
   * `data-cues`, because "did the shell notice the mute" is otherwise only inferable from
   * pixels, and a flat pixel reading does not say which half went quiet.
   */
  cueChannel: 'audio' | 'visual';
  targetReached: boolean;
  fresh: string[];
  dayNumber: number;
  puffs: number;
  ashDropped: number;
  smokeFreeDays: number;
}

export interface Puffly {
  ready: Ref<boolean>;
  summary: Ref<Summary>;
  settings: Ref<Settings>;
  /** Which of §9's three tiers the interface is on right now. */
  locale: ComputedRef<LocaleCode>;
  /** Every word the shell is allowed to use, resolved once so all of them agree (§9). */
  copy: ComputedRef<I18n>;
  /** The boxes in the collection, newest last. */
  progressPacks: ComputedRef<string[]>;
  /** S20's numbers, restated from the log. */
  reduction: Ref<ReductionView>;
  /** S17's card data for whatever is burning right now. */
  archive: ComputedRef<ArchiveFacts | null>;
  /** The same card for any rod in the cabinet, asked for by id. */
  archiveOf(id: string): ArchiveFacts | null;
  stats: Ref<Statistics>;
  today: Ref<TodayView | null>;
  journey: Ref<JourneyStop[]>;
  triggers: Ref<TriggerCount[]>;
  items: Ref<CollectionItem[]>;
  unlocked: Ref<Record<string, readonly string[]>>;
  audioAvailable: Ref<boolean>;
  storageDegraded: Ref<boolean>;
  /** Whether a vibration motor exists to be asked for one (§30). */
  canVibrate: Ref<boolean>;
  attach(surface: HTMLElement): Promise<void>;
  /**
   * Drive the scene from a control instead of a finger on it: the same input the space bar sends,
   * aimed at the same anchor (§65). A pill that faked the gesture would be the one thing §28
   * forbids, so this is a handle on the real thing, not a picture of it.
   */
  gesture(kind: 'hold' | 'tap' | 'release'): void;
  /**
   * What the scene is being told about looks — reduced motion, quality, contrast, realism, the
   * skin's palette. The 3D stage consumes the same bursts with the same look, so it reads this
   * rather than assembling a second set of the same six fields.
   */
  rendererLook(): Pick<
    RendererSettings,
    | 'reducedMotion'
    | 'quality'
    | 'contrast'
    | 'skin'
    | 'customBackground'
    | 'realism'
    | 'visualCues'
  >;
  /** Subscribe to the engine's own events; returns an unsubscribe. */
  onEvent(listener: (event: EngineEvent) => void): () => void;
  setSettings(patch: Partial<Settings>): void;
  /**
   * The four colours the room is painted with right now, or `null` before the first frame exists.
   * The picker asks for this the moment the player takes the room over, so that what they start
   * from is the place they chose rather than four black squares.
   */
  sceneColours(): ScenePalette | null;
  select(selection: Partial<Selection>): void;
  setCraving(level: number, phase: 'before' | 'after'): void;
  addTrigger(tag: string): void;
  acknowledgeUnlocks(): void;
  endBreak(): void;
  /** S23: the player did one of the three 替代动作. Counted today, and nothing else. */
  takeSubstitute(id: string): void;
  exportJson(): Promise<string>;
  importJson(json: string): Promise<{ ok: boolean; errors: string[] }>;
  resetData(): Promise<void>;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function freshSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const box = new Uint32Array(1);
    crypto.getRandomValues(box);
    return (box[0] ?? 0) || 1;
  }
  return Date.now() >>> 0 || 1;
}

export function createPuffly(): Puffly {
  const content = createDefaultLookup();
  const items = ref<CollectionItem[]>(buildCollectionItems(content.bundle));
  const ready = ref(false);
  const settings = ref<Settings>(createDefaultSettings(-new Date().getTimezoneOffset()));
  const summary = ref<Summary>({
    state: null,
    clock: formatClock(0),
    burned: formatClock(0),
    aim: '',
    stageBox: '',
    propScale: '',
    sessionActive: false,
    controlsVisible: true,
    affordance: 'none',
    phase: 'light',
    overLimit: false,
    hint: null,
    cueChannel: 'visual',
    targetReached: false,
    fresh: [],
    dayNumber: 1,
    puffs: 0,
    ashDropped: 0,
    smokeFreeDays: 0,
  });
  const stats = ref<Statistics>(deriveStatistics([], { nowMs: Date.now(), utcOffsetMinutes: 0 }));
  const today = ref<TodayView | null>(null);
  const journey = ref<JourneyStop[]>([]);
  const triggers = ref<TriggerCount[]>([]);
  const reduction = ref<ReductionView>(
    deriveReduction([], { nowMs: Date.now(), utcOffsetMinutes: 0 }),
  );
  const unlocked = ref<Record<string, readonly string[]>>({});
  const audioAvailable = ref(false);
  const storageDegraded = ref(false);
  const canVibrate = ref(typeof navigator !== 'undefined' && 'vibrate' in navigator);

  /**
   * §9's three tiers, resolved from the player's own request and the device's list. Read from
   * `settings.language` only — a language is a preference, and the engine never sees it (§73).
   */
  const locale = computed<LocaleCode>(() =>
    resolveLocale(settings.value.language, deviceLanguages()),
  );
  const copy = computed<I18n>(() => createI18n(locale.value));

  const archiveOf = (id: string): ArchiveFacts | null => factsFor(content, id);

  const progressPacks = computed<string[]>(() => [
    ...(summary.value.state?.progress.collectedPacks ?? []),
  ]);

  const archive = computed<ArchiveFacts | null>(() =>
    archiveOf(
      summary.value.state?.cigarette.typeId ??
        settings.value.selection?.cigarette ??
        DEFAULT_IDS.cigarette,
    ),
  );

  /**
   * A vibration is the one feedback a phone can give that a monitor cannot (§30). The deck names
   * three shapes for it (S6): 点火 短促, 吸入 渐强, 烟灰 细碎 — and S7 adds the two ending beats.
   *
   * The 渐强 is the one that used to be deliberately absent: an earlier rule here said "nothing in
   * between, because a motor on every puff stops meaning anything". The answer is not a motor — it is
   * four steps up the draw, fired only when the step rises (`swellRung`), so one long inhale is a
   * crescendo of four pulses and a tremulous thumb is still four pulses.
   */
  const feel = (shape: HapticShape, level = 1): void => {
    const pattern = hapticPattern(shape, settings.value.haptics, level);
    if (pattern === null || !canVibrate.value) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers only allow it during a user gesture; a missing buzz is not an error.
      canVibrate.value = false;
    }
  };

  let engine: GameEngine | null = null;
  let audio: AudioBridge | null = null;
  let persistence: Persistence | null = null;
  let sessions: Session[] = [];
  let stop: (() => void)[] = [];
  let raf = 0;
  let lastFrameMs = 0;
  /**
   * Wall time the frame loop already accounted for while the page was hidden. A desktop tab that
   * is merely throttled keeps calling `requestAnimationFrame` at 1 Hz, and those frames are real
   * simulation — subtracting them is what stops a catch-up counting the same second twice.
   */
  let simulatedWhileHiddenMs = 0;
  let summaryAccumulator = 0;
  let saveTimer: number | undefined;

  /** Shared with the pointer adapter, so hit-testing and drawing agree on the letterbox (§55). */
  const viewport = createViewport({ width: 640, height: 960, dpr: 1 });

  /** The tier `quality: 'auto'` has settled on; the player's own choice is never overwritten. */
  let autoTier: QualityMode = startingTier();
  let frameEmaMs = 1000 / 60;
  /** Frames spent at the current tier, so a tier cannot be swapped on the very next frame. */
  let tierHeldFrames = 0;

  const effectiveQuality = (): QualityMode =>
    settings.value.quality === 'auto' ? autoTier : settings.value.quality;

  /** The palette the applied skin asks for; `null` leaves the scene as the content made it. */
  const skinPalette = (): SkinPalette | null =>
    content.bundle.skins.find((skin) => skin.id === settings.value.skin)?.palette ?? null;

  /**
   * One place assembles what the scene is told. Three call sites used to spell four fields out
   * by hand, which is how a fifth field gets applied by the loop and forgotten by the resize.
   */
  const rendererSettings = (
    quality: QualityMode = effectiveQuality(),
  ): Pick<
    RendererSettings,
    | 'reducedMotion'
    | 'quality'
    | 'contrast'
    | 'skin'
    | 'customBackground'
    | 'realism'
    | 'visualCues'
  > => ({
    reducedMotion: settings.value.reducedMotion,
    quality,
    contrast: settings.value.contrast,
    realism: settings.value.realism,
    skin: skinPalette(),
    customBackground: settings.value.customBackground,
    // The same flag the scene reads on the summary beat — one value, or its
    // accents would answer a different question than the canvas's.
    visualCues: cuesAreVisual,
  });

  const applyEffectiveQuality = (): void => {
    const quality = effectiveQuality();
    engine?.setSettings({ ...settings.value, quality });
  };

  /**
   * One pass of the ladder, from the frame time that just arrived. Deliberately dumb: no
   * sampling windows, no percentiles, nothing that needs a tuning session on a real device.
   */
  const watchFrames = (dt: number): void => {
    if (settings.value.quality !== 'auto') return;
    frameEmaMs += (dt - frameEmaMs) * FRAME_SMOOTHING;
    tierHeldFrames += 1;
    if (tierHeldFrames < 90) return;

    const index = AUTO_TIERS.indexOf(autoTier);
    let next = index;
    if (frameEmaMs > SLOW_FRAME_MS && index < AUTO_TIERS.length - 1) next = index + 1;
    else if (frameEmaMs < FAST_FRAME_MS && index > 0) next = index - 1;
    if (next === index) return;

    autoTier = AUTO_TIERS[next] ?? autoTier;
    tierHeldFrames = 0;
    // Re-aim the average at the new tier so the next decision is about the new budget.
    frameEmaMs = 1000 / 60;
    applyEffectiveQuality();
  };

  const deriveOptions = () => ({
    nowMs: Date.now(),
    utcOffsetMinutes: settings.value.utcOffsetMinutes,
    // The 替代动作 ledger rides along so the page's three rows read from the one place that keeps
    // counts, rather than the panel keeping a second tally of its own (§70).
    substitutes: engine?.progressSnapshot().substitutes ?? [],
    ...(settings.value.quitAnchorTimestamp
      ? { quitAnchorTimestamp: settings.value.quitAnchorTimestamp }
      : {}),
  });

  /** Today's sticks against the ceiling the player chose; false when they never chose one. */
  const overLimit = (): boolean =>
    isOverLimit(reduction.value.todaySticks, settings.value.dailyLimitSticks);

  const recompute = (): void => {
    const options = deriveOptions();
    stats.value = deriveStatistics(sessions, options);
    today.value = deriveTodayView(sessions, options);
    reduction.value = deriveReduction(sessions, options);
    triggers.value = deriveTriggerBreakdown(sessions);
    journey.value = engine ? deriveJourney(sessions, engine.progressSnapshot()) : [];
  };

  /**
   * The one thing the scene is allowed to say about the next gesture, sitting above the object it is
   * about. It follows the same awake/asleep rule as the halo it labels, and settings can take it away
   * (§28, §64).
   *
   * S15's order is 目标语言 → 英文 → 纯图标, and the strip used to obey it only halfway: where the tier
   * had no word, `t()` answered with nothing and the strip disappeared, so 纯图标 — the tier that most
   * needs a picture — was the one left with none. The wordless tier now carries the diagram the deck
   * names (纸面塌陷示意图), and only for the gesture the deck drew one for.
   */
  const hintWord = (state: GameStateView): HintWord | null => {
    if (!settings.value.hints || !state.ui.controlsVisible) return null;
    const key = HINT_KEYS[state.ui.affordance];
    const found = key === undefined ? null : copy.value.t(key);
    const picture = hintPictureFor(state.ui.affordance, found);
    if (found === null && picture === null) return null;
    const anchor = anchorForTarget(state.anchors, targetForAffordance(state));
    if (anchor === null) return null;
    const at = viewport.px(anchor);
    const floor = viewport.cssHeight - (coarsePointer() ? 104 : 76);
    return {
      word: found ?? '',
      picture,
      x: at.x,
      y: Math.max(30, Math.min(at.y - viewport.len(0.085), floor)),
    };
  };

  const refreshSummary = (): void => {
    if (!engine) return;
    const state = engine.getState();
    summary.value = {
      state,
      clock: formatClock(state.ui.sessionRemainingMs),
      burned: formatClock(state.cigarette.burnMsElapsed),
      sessionActive: state.ui.sessionActive,
      controlsVisible: state.ui.controlsVisible,
      affordance: state.ui.affordance,
      phase: phaseOf(state.cigarette.state),
      aim: aimOf(state, viewport),
      stageBox: boxOf(viewport),
      propScale: String(Math.round(state.anchors.ashtrayRadius * 1e4) / 1e4),
      overLimit: overLimit(),
      hint: hintWord(state),
      cueChannel: audio?.audible() ? 'audio' : 'visual',
      targetReached: state.ui.sessionActive && state.ui.sessionRemainingMs <= 0,
      fresh: [...state.collection.fresh],
      dayNumber: state.progress.dayNumber,
      puffs: state.progress.puffs,
      ashDropped: state.progress.ashDropped,
      smokeFreeDays: state.progress.smokeFreeDays,
    };
    unlocked.value = { ...state.collection.unlocked };
  };

  let lastBreakWriteMs = 0;
  /**
   * Write the running break down as it happens. The visible tab has the live simulation;
   * this is only for the case where the operating system takes the page away, which never
   * announces itself. §81 (4).
   */
  const persistBreak = (force = false): void => {
    if (!engine || !persistence) return;
    const now = Date.now();
    if (!force && now - lastBreakWriteMs < BREAK_WRITE_MS) return;
    const record = engine.openBreakSnapshot();
    if (record === null) return;
    lastBreakWriteMs = now;
    void persistence.saveOpenBreak(record).catch(() => undefined);
  };

  const persistProgress = (): void => {
    if (!engine || !persistence) return;
    void persistence.saveProgress(engine.progressSnapshot());
  };

  const closeSession = (): void => {
    if (!engine || !persistence) return;
    const session = engine.endSession();
    if (!session) return;
    sessions = [...sessions, session];
    void persistence
      .putSession(session)
      .then(() => {
        storageDegraded.value = persistence?.isDegraded() ?? false;
      })
      .catch(() => {
        storageDegraded.value = true;
      });
    persistProgress();
    void persistence.clearOpenBreak().catch(() => undefined);
    recompute();
    refreshSummary();
  };

  /**
   * Everyone else who wants the engine's events.
   *
   * The scene consumes the engine's bursts through the same `intakeBurst` the painted layer used
   * (same pool, same look), and this is how it hears about them — one stream, no second copy of
   * what a burst is.
   */
  const eventListeners = new Set<(event: EngineEvent) => void>();
  function onEvent(listener: (event: EngineEvent) => void): () => void {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  const handleEngineEvent = (event: EngineEvent): void => {
    for (const listener of eventListeners) listener(event);
    const state = engine?.getState();
    if (audio && state) audio.handle(event, state);
    if (event.kind !== 'session' || !engine || !state) return;

    if (event.event.type === SessionEventType.LIGHT) persistBreak(true);
    if (event.event.type === SessionEventType.LIGHT && !state.ui.sessionActive) {
      // A break begins the moment something is lit — nothing asks the player first (§31).
      engine.startSession();
    }
    const type = event.event.type;
    if (type === SessionEventType.LIGHT) {
      // The count gets its beginning from the first cherry rather than from a form (§10).
      const anchor = anchorAtLight(Date.now(), settings.value.quitAnchorTimestamp);
      if (anchor !== undefined) {
        settings.value = { ...settings.value, quitAnchorTimestamp: anchor };
        void persistence?.saveSettings(settings.value).catch(() => undefined);
      }
    }
    // Which beat says which shape is one table (`shapeForEvent`), so the mapping is a thing that can
    // be asked rather than only read. Only the level differs by shape: the grains scale with the
    // column that just went.
    const shape = shapeForEvent(type);
    if (shape !== null) {
      feel(shape, shape === 'grit' ? state.cigarette.ash.ratio : 1);
    }

    if (event.event.type === SessionEventType.DISCARD) {
      // It ends when the stub goes into the tray. No dialog, no confirmation (§62).
      window.setTimeout(closeSession, 240);
    }
  };

  /**
   * The last cue channel the scene was told to use. This is its only writer — the scene
   * starts on `false`, the same value, so the two can never disagree about who is in charge.
   */
  let cuesAreVisual = false;

  /** Which step of the current draw the hand has already been told about. */
  let lastSwellRung = 0;

  const frame = (nowMs: number): void => {
    if (!engine) return;
    const raw = lastFrameMs === 0 ? 1000 / 60 : Math.max(nowMs - lastFrameMs, 0);
    const dt = Math.min(raw, 250);
    lastFrameMs = nowMs;
    if (document.hidden) simulatedWhileHiddenMs += raw;

    watchFrames(dt);
    engine.tick(dt);
    const live = engine.getState();
    // 吸入 渐强 (S6): four steps up one draw, fired only when the step rises. When the draw ends the
    // rung falls to 0, so the next one climbs from the bottom again instead of staying at the top.
    const rung = swellRung(live.cigarette.puff.active ? live.cigarette.puff.intensity : 0);
    if (rung > lastSwellRung) feel('swell', rung / SWELL_RUNGS);
    lastSwellRung = rung;
    // S12's economy, and the one part of the widget idea a browser can honour: once nothing in the
    // scene is alight, nothing is in the air and the player has left it alone, the canvas drops to
    // 15 fps. The tick above still runs every beat — §71 counts the numbers a step consumes, and a
    // dropped frame must not slow a burning rod — and the skipped time is carried into the next
    // paint, so a puff that is still there when the scene wakes up moves at its own speed and not
    // in slow motion.
    // Continuous beds follow the state every frame; cues arrive as events (§26, §27).
    audio?.sync(live);

    summaryAccumulator += dt;
    if (summaryAccumulator >= SUMMARY_INTERVAL_MS) {
      summaryAccumulator = 0;
      refreshSummary();
      // §63: if nothing can be heard — muted, blocked by the autoplay policy, or no Web Audio at
      // all — the picture takes over the cues. Worth re-checking on this beat because the first
      // tap is exactly when the answer changes.
      const visual = summary.value.cueChannel === 'visual';
      if (visual !== cuesAreVisual) {
        cuesAreVisual = visual;
      }
      if (engine?.getState().ui.sessionActive) persistBreak();
      const state = engine.getState();
      const quiet = state.ui.idleMs > IDLE_CLOSE_MS && !state.cigarette.ember.lit;
      if (state.ui.sessionActive && quiet) closeSession();
    }

    raf = requestAnimationFrame(frame);
  };

  const dprFor = (): number => preferredDpr();

  const resize = (surface: HTMLElement): void => {
    // The stage's own box is the authority. On the desk the scene gives 260px to the data column,
    // and a surface measured off the window would slide underneath it; the hit surface fills the
    // stage, so its own rect *is* that box.
    const box = surface.getBoundingClientRect();
    const laidW = Math.round(box.width || 640);
    const laidH = Math.round(box.height || 960);
    // On a phone the layout viewport can be taller than the visual one while the browser chrome
    // slides away, so `visualViewport` is the room the player actually has (§66) — it may take
    // space away from the stage, never hand the canvas more than the stage owns.
    const visual = typeof window === 'undefined' ? null : window.visualViewport;
    const cssWidth = visual === null ? laidW : Math.min(laidW, Math.round(visual.width));
    const cssHeight = visual === null ? laidH : Math.min(laidH, Math.round(visual.height));
    const dpr = dprFor();
    viewport.resize(cssWidth, cssHeight, dpr);
    // The core owns hit-testing, so it has to know the same shape the canvas just became —
    // including how tall, because the chrome it must clear is measured in pixels.
    engine?.setStageAspect(viewport.aspect, viewport.stage.height);
  };

  const attach = async (surface: HTMLElement): Promise<void> => {
    persistence = createPersistence();
    const loaded = await persistence.load(Date.now());
    settings.value = {
      ...loaded.settings,
      selection: loaded.settings.selection ?? { ...DEFAULT_IDS },
    };
    if (!loaded.hadStoredSettings && prefersReducedMotion()) {
      settings.value = { ...settings.value, reducedMotion: true };
    }

    const selection = settings.value.selection ?? DEFAULT_IDS;
    const game = createEngine({
      content,
      seed: freshSeed(),
      wallClockMs: Date.now(),
      settings: settings.value,
      progress: loaded.progress,
      cigaretteId: selection.cigarette,
      environmentId: selection.environment,
      lighterId: selection.lighter,
      ashtrayId: selection.ashtray,
    });
    engine = game;
    sessions = loaded.sessions;

    // A break the operating system interrupted, rather than the player leaving it: come
    // back to the rod that was burning, at the position the wall clock says it reached.
    // §81 (4).
    const interrupted = await persistence.loadOpenBreak().catch(() => null);
    if (interrupted !== null) {
      const ageMs = Date.now() - interrupted.savedAtWallMs;
      const stillChosen =
        interrupted.cigaretteId === selection.cigarette &&
        interrupted.environmentId === selection.environment &&
        interrupted.lighterId === selection.lighter &&
        interrupted.ashtrayId === selection.ashtray;
      if (ageMs >= 0 && ageMs <= INTERRUPTED_MAX_AGE_MS && stillChosen) {
        game.restoreOpenBreak(interrupted, Date.now());
        lastBreakWriteMs = Date.now();
      } else {
        // Stale, or the player has since chosen something else: the rod on the table is
        // the honest state, and the record goes with it.
        void persistence.clearOpenBreak().catch(() => undefined);
      }
    }

    resize(surface);

    // The very first aspect has to be in place before a pointer can be aimed at anything.
    engine?.setStageAspect(viewport.aspect, viewport.stage.height);

    audio = createAudioBridge(content, settings.value);
    audioAvailable.value = audio.available();
    storageDegraded.value = persistence.isDegraded();

    stop.push(game.on(handleEngineEvent));

    const pointer = createPointerAdapter(surface, game, () => ({
      cssWidth: viewport.cssWidth,
      cssHeight: viewport.cssHeight,
      stage: viewport.stage,
    }));
    const keyboard = createKeyboardAdapter(window, game, () =>
      targetForAffordance(game.getState()),
    );
    const guard = createSurfaceGuard();
    pointer.attach();
    keyboard.attach();
    guard.attach();
    stop.push(() => {
      pointer.detach();
      keyboard.detach();
      guard.detach();
    });

    // Capture phase on the window, before the game's own pointer handler: the tap that unlocks
    // the audio context is the first sound the player is owed, and a handler bound after the
    // adapter's runs one step too late to matter (§26).
    const unlockAudio = (): void => audio?.unlock();
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    stop.push(() => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    });

    let hiddenAtMs = 0;
    const onVisibility = (): void => {
      if (document.hidden) {
        simulatedWhileHiddenMs = 0;
        // The last write before the page might never come back.
        persistBreak(true);
        hiddenAtMs = Date.now();
        // Whatever the finger was doing is over: a hold left hanging would otherwise draw the
        // rod down for as long as the tab stayed asleep.
        game.send({
          type: 'release',
          x: 0,
          y: 0,
          timestamp: game.getState().nowMs,
          source: 'keyboard',
        });
        audio?.suspend();
        const state = game.getState();
        if (state.ui.sessionActive && !state.cigarette.ember.lit) closeSession();
        return;
      }

      audio?.resume();
      lastFrameMs = 0;
      const asleepMs = hiddenAtMs > 0 ? Date.now() - hiddenAtMs - simulatedWhileHiddenMs : 0;
      hiddenAtMs = 0;
      simulatedWhileHiddenMs = 0;
      if (asleepMs >= CATCH_UP_MIN_MS) {
        game.advance(Math.min(asleepMs, CATCH_UP_MAX_MS));
        refreshSummary();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    stop.push(() => document.removeEventListener('visibilitychange', onVisibility));

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => resize(surface));
      observer.observe(surface);
      stop.push(() => observer.disconnect());
    } else {
      window.addEventListener('resize', () => resize(surface));
    }

    // Mobile chrome sliding away changes the visual viewport without resizing any element, and
    // an orientation flip fires neither reliably (§66).
    const onViewportShift = (): void => resize(surface);
    const visual = window.visualViewport;
    if (visual) {
      visual.addEventListener('resize', onViewportShift);
      stop.push(() => visual.removeEventListener('resize', onViewportShift));
    }
    window.addEventListener('orientationchange', onViewportShift);
    stop.push(() => window.removeEventListener('orientationchange', onViewportShift));

    stop.push(() => {
      cancelAnimationFrame(raf);
      audio?.dispose();
    });

    recompute();
    refreshSummary();
    ready.value = true;
    raf = requestAnimationFrame((now) => {
      lastFrameMs = now;
      frame(now);
    });
  };

  const persistSettingsSoon = (): void => {
    if (!persistence) return;
    window.clearTimeout(saveTimer);
    const store = persistence;
    if (!store) return;
    saveTimer = window.setTimeout(() => {
      void store.saveSettings(settings.value);
      storageDegraded.value = store.isDegraded();
    }, 400);
  };

  onBeforeUnmount(() => {
    for (const halt of stop) halt();
    stop = [];
    window.clearTimeout(saveTimer);
    closeSession();
  });

  return {
    ready,
    summary,
    settings,
    locale,
    copy,
    archive,
    archiveOf,
    progressPacks,
    reduction,
    stats,
    today,
    journey,
    triggers,
    items,
    unlocked,
    audioAvailable,
    storageDegraded,
    canVibrate,
    attach,
    onEvent,
    rendererLook: () => rendererSettings(),
    sceneColours: (): ScenePalette | null => {
      const state = engine?.getState();
      if (!state) return null;
      const background = state.environment.background;
      return {
        skyTop: background.sky[0],
        skyBottom: background.sky[1],
        horizon: background.horizon,
        silhouette: background.silhouette,
      };
    },
    gesture(kind) {
      if (!engine) return;
      const state = engine.getState();
      // A button is not a finger on the table. Sent as `pointer` at (0,0) the core read it as a
      // real press in the top-left corner and dragged the rod there; `shortcut` is the source
      // that says "aim at this anchor, I have no pixel of my own" (§65).
      engine.send({
        type: kind,
        x: 0,
        y: 0,
        timestamp: state.nowMs,
        target: targetForAffordance(state),
        source: 'shortcut',
      });
      refreshSummary();
    },
    setSettings(patch) {
      settings.value = { ...settings.value, ...patch };
      if (patch.quality === 'auto') autoTier = startingTier();
      engine?.setSettings({ ...settings.value, quality: effectiveQuality() });
      audio?.setSettings(settings.value);
      const root = document.documentElement;
      if (root) {
        root.style.setProperty('--text-scale', String(settings.value.textScale));
        // High contrast is also a CSS concern: chrome must stay readable over the scene (§64).
        root.dataset['contrast'] = settings.value.contrast;
      }
      persistSettingsSoon();
      refreshSummary();
    },
    select(selection) {
      const next = { ...(settings.value.selection ?? DEFAULT_IDS), ...selection };
      settings.value = { ...settings.value, selection: next };
      if (!engine) return;
      if (selection.cigarette) engine.selectCigarette(selection.cigarette);
      if (selection.environment) engine.selectEnvironment(selection.environment);
      if (selection.lighter) engine.selectLighter(selection.lighter);
      if (selection.ashtray) engine.selectAshtray(selection.ashtray);
      persistSettingsSoon();
      persistProgress();
      refreshSummary();
    },
    setCraving(level, phase) {
      if (!engine) return;
      if (!engine.getState().ui.sessionActive) engine.startSession();
      engine.setCraving(level, phase);
      refreshSummary();
    },
    addTrigger(tag) {
      if (!engine) return;
      if (!engine.getState().ui.sessionActive) engine.startSession();
      engine.addTrigger(tag);
      refreshSummary();
    },
    acknowledgeUnlocks() {
      engine?.acknowledgeUnlocks();
      persistProgress();
      refreshSummary();
    },
    endBreak() {
      closeSession();
    },
    takeSubstitute(id) {
      // The core is what owns the ledger, so an id outside the deck's three is refused there and
      // changes nothing here either — no save, no recompute, no number that appeared from nowhere.
      if (!engine?.takeSubstitute(id)) return;
      persistProgress();
      recompute();
    },
    async exportJson() {
      if (!engine || !persistence) return '{}';
      if (engine.getState().ui.sessionActive) closeSession();
      persistProgress();
      return persistence.download();
    },
    async importJson(json) {
      if (!persistence) return { ok: false, errors: ['storage unavailable'] };
      const result = await persistence.restore(json);
      if (result.ok) {
        const loaded = await persistence.load(Date.now());
        sessions = loaded.sessions;
        settings.value = {
          ...loaded.settings,
          selection: loaded.settings.selection ?? { ...DEFAULT_IDS },
        };
        engine?.setSettings(settings.value);
        recompute();
        refreshSummary();
      }
      return result;
    },
    /**
     * §52's reset, and the one control in the app that erases something. The reload is not
     * laziness: rebuilding the engine in place would leave the day's log, the unlocks and the
     * ladder alive in memory, which is a wipe that a few seconds of play quietly undoes.
     */
    async resetData() {
      if (!persistence) return;
      await persistence.reset();
      window.location.reload();
    },
  };
}

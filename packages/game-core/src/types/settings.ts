import type { Rgb } from '@puffly/shared';

/** §64, §26, §55: the only knobs a player gets, all of them optional. */

export type QualityMode = 'auto' | 'high' | 'balanced' | 'light';

/**
 * The four colours a room is made of, in the order the background is painted: the sky's two ends,
 * the line where it meets the ground, and everything that stands in front of it.
 */
export interface ScenePalette {
  skyTop: Rgb;
  skyBottom: Rgb;
  horizon: Rgb;
  silhouette: Rgb;
}
export type ContrastMode = 'normal' | 'high';

export interface Settings {
  /** 0..1 master volume. */
  volume: number;
  /** 0..1 ambience level — kept low on purpose (§27). */
  ambientVolume: number;
  muted: boolean;
  /** §64: disables heavy smoke, cuts particle count and camera movement. */
  reducedMotion: boolean;
  /** §64: enough contrast even though the scene is intentionally dark. */
  contrast: ContrastMode;
  /** §64: UI chrome scale; the game canvas is always DPR-scaled independently. */
  textScale: number;
  quality: QualityMode;
  /** The break the player is aiming at, in minutes; §31's `◷` readout counts this down. */
  sessionTargetMs: number;
  /**
   * The player's own colours for the four layers the room is painted with, or `null` for whatever
   * the place itself was authored with. A renderer setting and not a simulation one, for the same
   * reason a skin is: it may not move a number. Where it differs from a skin is that a skin is a
   * collectible you unlock and a background is a thing you decide — so it is a preference, and it
   * costs nothing to change.
   */
  customBackground: ScenePalette | null;
  /**
   * S14's 三个自定义档之一 — 「单口时长」: how long one draw takes to fill, in seconds. The deck's
   * own figure for the default kind is 2.0 s (S9's 单口吸入 column, which is the ISO 3308 machine
   * draw), and every rod was authored around its own row of that same column.
   *
   * There is deliberately no default. A draw length nobody picked would flatten the difference
   * between six rods that were authored to be drawn differently, which is the one content axis S22
   * says keeps a month of play interesting. Absent means "ask the rod"; the row offers the deck's
   * 1.0 - 4.0 s 吸入 window plus the way back to that.
   *
   * It shapes the fill of a draw, not the clock: the burn, the puff count, the temperature and the
   * ash all come out of the same simulation whether the hand set this or not.
   */
  puffDurationSec?: number;
  /**
   * §28: whether the object the scene is nudging also gets one plain word naming the gesture
   * ("tap", "hold", "flick", "press", "drop"). On by default — a word is cheaper than a
   * missed gesture — and the only text the game ever shows.
   */
  hints: boolean;
  /**
   * §9 of the mobile brief: how the interface should speak — a language tag, or `icons` for no
   * words at all. Absent means "ask the device", and the core only carries this value: picking
   * the words is the shell's job, so a save can move between platforms without the simulation
   * changing shape (§47).
   */
  language?: string;
  /**
   * S18: the id of the applied skin. The core stores it and never reads it, exactly as with the
   * language — a palette is not something the simulation is allowed to notice (§6.1).
   */
  skin?: string;
  utcOffsetMinutes: number;
  /**
   * S20: the player's own ceiling for the day, in sticks. Absent means they have not chosen one
   * — there is no default, because a number nobody picked would be the brief's first piece of
   * pressure. Raising or clearing it is never punished (§ limitRule.adjustable).
   */
  dailyLimitSticks?: number;
  /** §33: the player's own anchor for smoke-free days. Never inferred as a claim (§84). */
  quitAnchorTimestamp?: number;
  /**
   * §30: how much the hand is told, 0..1, where 0 is nothing at all. It used to be a boolean; the
   * deck's own save schema (S23) writes a number, and the three shapes it names — 点火 短促,
   * 吸入 渐强, 烟灰 细碎 — need one knob to be scaled against rather than switched. A save that still
   * says true comes back as 1, so nobody's feedback changes size by upgrading.
   */
  haptics: number;
  /**
   * S6's 写实度 row — the deck's own 「写实 80% / 卡通」 split, carried as the number that row
   * shows. 0.8 is the deck's default and it is also exactly what the game already looked like, so
   * a save written before the row existed keeps the scene it had.
   *
   * Presentation, and nothing more. It scales how hard the frame pushes in on the ignition, how far
   * the edges close, how much the tray rocks when ash lands, how springily a spark hops and how lit
   * the breath the player just made is: the cartoon side of 「物理写实、反馈卡通」, which is the list
   * S7 itself draws. It may not move one number in the simulation — no
   * duration, no puff count, no temperature, no ash weight — which realism-purity.test.ts proves by
   * running a whole break at every detent of the row and comparing the state and the session record.
   */
  realism: number;
  /**
   * S6's 「混响 关」: whether the room behind the cues is heard at all. Off by default because the
   * deck puts the tail at ≤0.4 s and a virtual smoke break is more often on headphones in a real
   * room than in a hall — and because a player who never opens this setting must not be given a
   * reverb they did not ask for. Purely a sound: it may not move one number in the simulation.
   */
  reverb: boolean;
  /**
   * Whether the lighter may do a small flourish when nobody is doing anything with it — a cap
   * flicked open and shut, a throw of sparks. The table is the one thing on screen that is not the
   * rod, and a break where nothing ever moves is not a room, it is a still frame. Off means off:
   * the lighter then only ever moves because a finger told it to.
   */
  idleFlourishes: boolean;
  /**
   * Which content the player is currently using. Optional so a settings object from an
   * older save still parses; the engine falls back to the default unlocked item.
   */
  selection?: Selection;
}

export interface Selection {
  cigarette: string;
  environment: string;
  lighter: string;
  ashtray: string;
}

/**
 * One rod of the default kind: the deck's 10.0-minute natural burn, which is what S22's whole day
 * budget is divided by (25 min ÷ 10 min/支 ≈ 2.5 支). §31 wrote `◷ 03:00` as the *shape* of the
 * readout, not as a length — and a three-minute target on a ten-minute rod announces "目标已达"
 * while two thirds of the rod is still burning, which reads as a lock rather than as a clock.
 * `break-row.test.ts` pins this to the default rod's own burn middle rather than to a number, so
 * the two cannot drift apart by someone editing one file.
 */
export const DEFAULT_SESSION_TARGET_MS = 600_000;

/**
 * `utcOffsetMinutes` is handed in by the shell rather than read here: knowing the player's
 * zone is a platform fact, and the core must stay runnable anywhere (§47) and replayable on
 * another machine (§71). A shell passes `-new Date().getTimezoneOffset()`.
 */
export function createDefaultSettings(utcOffsetMinutes = 0): Settings {
  return {
    volume: 0.6,
    ambientVolume: 0.25,
    muted: false,
    reducedMotion: false,
    contrast: 'normal',
    textScale: 1,
    quality: 'auto',
    sessionTargetMs: DEFAULT_SESSION_TARGET_MS,
    hints: true,
    utcOffsetMinutes,
    haptics: 0,
    realism: 0.8,
    reverb: false,
    idleFlourishes: true,
    customBackground: null,
  };
}

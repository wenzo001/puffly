/**
 * Prop sizes, in stage units — the same units the core's layout uses.
 *
 * One stage unit is the stage's own height (the old viewport's `unit` is `min(width / 0.75, height)`,
 * which is the height for any stage at or wider than 3:4), so a size here multiplies `WORLD_HEIGHT`
 * to become world units. Getting that wrong is how the first draft of this layer drew a lighter two
 * thirds of its real width.
 *
 * It carries the numbers the painted layer used while that layer still shipped; since 2026-10-10 the
 * 2D layer is gone and these are the only copy (the parity test that used to pin the two together
 * retired with it).
 */
import type { Rgb } from '@puffly/shared';
import { wander } from './noise';

/**
 * The props' own inks, in the order §2 of SmokeRitual-UI-Demo.html paints them. Every one of these
 * is near-black on purpose: the Demo's redline keeps the scene to geometry silhouettes and flat
 * colour, and all of the warmth in those screens comes from the light pool *behind* the objects.
 * A gradient over one of our flat-shaded bands becomes its two ends — the lighter's cap is the top
 * of `180deg,#2A2622,#1A1714` and its tank the bottom, which is also the order the bands hang on
 * the hinge. The pack's edge is what `1px solid rgba(255,255,255,.05)` over its own plate works
 * out to; the ashtray's is the top of its 160deg ramp, and the pile of tapped ash is the 22px band
 * lying in it.
 */
export const PROP_INK = {
  lighterCap: '#2a2622',
  lighterTank: '#1a1714',
  pack: '#191612',
  packEdge: '#25221f',
  /** `inset 0 1px 0 rgba(255,255,255,.06)` over the cap's own #2A2622. */
  lighterEdge: '#37342f',
  ashtray: '#1b1815',
  /** The two ends of the pile's `180deg,#4A453E,#2A2621` — see `ASH_PILE`. */
  ashPile: '#4a453e',
  ashPileDeep: '#2a2621',
  /** The rod lying on the table (S1) is in the room's shadow, not in the key light. */
  rodAtRest: '#5a5348',
  /** Held up (S2 onward) it is the paper the Demo draws: `180deg,#F0E8DA,#A69C8E`. */
  rodHeld: '#f0e8da',
} as const;

/**
 * The rod's thickness as a share of its own length — a real cigarette's 7.8 mm over 84 mm.
 *
 * This used to be the Demo's own `168 × 34` (0.20, about 1 : 5). That number is right *in the
 * Demo*: there the rod is a flat rect with a top-to-bottom paper gradient and 5 px ends, so a
 * wide body still reads as a cigarette. Here the same ratio is a shaded cylinder, and 1 : 5 is
 * how a pipe is drawn — which is what it started reading as. The length the core publishes is
 * unchanged; only the share of it that is thickness comes down to the object being simulated.
 */
export const ROD_THICKNESS_SHARE = 7.8 / 84;

export const LIGHTER_SIZE = { width: 0.05, height: 0.075 } as const;
export const PACK_SIZE = { width: 0.058, height: 0.088 } as const;
/** How much the tray's disc is squashed on screen — the 2D layer's convention, not a perspective. */
export const TRAY_FLATTEN = 0.42;

/** A size in stage units → world units, given the stage's world height. */
export function toWorldSize(size: number, worldHeight: number): number {
  return size * worldHeight;
}

/**
 * The ashtray's radius comes from the core instead (`anchors.ashtrayRadius`), published through the
 * stage mirror: it is a fact about the layout, and a copy of it here would be the second source this
 * repository has already been burned by twice.
 */
export function ashtrayRadiusWorld(stageUnits: number, worldHeight: number): number {
  return stageUnits * worldHeight;
}

/** The mirrored ashtray radius: stage units, or null when the mirror is missing or unreadable. */
export function parsePropScale(text: string): number | null {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * §2's pile of tapped ash, lying in the tray's near lip. The Demo's own box: `132,486` at `126×22`
 * with `r11` (a stadium), filled `linear-gradient(180deg,#4A453E,#2A2621)` and `blur(3px)`, in a
 * tray of `100,322` at `190×190`.
 *
 * Everything is a share of the tray it lies in, so the pile rides every prop scale instead of owning
 * an anchor the layout never published. The tray is drawn as an oblique ellipse (`TRAY_FLATTEN`,
 * the painter's convention this scene reproduces as geometry), and the Demo draws it face-on — so
 * the pile lies *in* that plane: its span across the tray is the Demo's 126/190, its span along the
 * tray is the Demo's 22/190 squashed like the tray is, and its centre is the Demo's 80 px down the
 * tray's own 95 px half. Squashed together, all three stay inside the tray: at these numbers the
 * mound's lower edge stops just short of the near rim, which is where the picture puts it.
 */
export const ASH_PILE = {
  /** 126 of the tray's 190, across. */
  widthShare: 126 / 190,
  /** 22 of the tray's 190, along the tray's own plane. */
  heightShare: 22 / 190,
  /** (497 − 417) against the tray's half of 95, downward. */
  dropShare: 80 / 95,
  /** The Demo's `filter: blur(3px)`, read as CSS pixels on the screen it is drawn at. */
  blurPx: 3,
} as const;

/** The pile's box in world units, given the radius of the tray it lies in. */
export function ashPileMetrics(radiusWorld: number): {
  width: number;
  height: number;
  dy: number;
} {
  const span = radiusWorld * 2;
  return {
    width: span * ASH_PILE.widthShare,
    height: span * ASH_PILE.heightShare * TRAY_FLATTEN,
    dy: -radiusWorld * TRAY_FLATTEN * ASH_PILE.dropShare,
  };
}

// ------------------------------------------------------------------------------------------------
// The rod, the lighter's flame and the paper dent — moved here with the painted layer's retirement
// (2026-10-10). Same numbers, same formulas; the scene is their only reader now.

/** The lighter's flip-top opens by this much: `lighter.lid` through the same 78°. */
export const LID_THROW_DEG = 78;

/**
 * Where the flame stands on the lighter, as a fraction of its body height in the local frame the
 * painted layer drew in (y grows downward): `chimTop` (top −0.3H + cap 0.44H + chimney 0.11H) less
 * the wick's own 0.05H. A reader whose y grows upward — the scene — flips the sign.
 */
export const FLAME_BASE_FRACTION = -0.3 + 0.44 + 0.11 - 0.05;

/**
 * The lighter's flame as numbers, in stage units and free of any canvas. `flame` is the 0–1
 * strength the simulation holds, `flicker`/`sputter` its two nervous inputs, and `wander` the same
 * noise the painted layer has always used.
 */
export function flameMetrics(input: {
  flame: number;
  flicker: number;
  sputter: number;
  nowMs: number;
  flameHeight: number;
}): { height: number; width: number; jitter: number } {
  const jitter = wander(input.nowMs / 1000, 11) * 0.12 + input.flicker * 0.4;
  const height = input.flameHeight * input.flame * (1 + jitter * 0.25) * (1 - input.sputter * 0.7);
  return { height, width: height * 0.42, jitter };
}

/** The char front's bite into one grain's own length, as a share of it. */
export const CHAR_BIT = 0.46;
/** The grain field's seed: the same noise field every reader walks, index by index. */
export const CHAR_GRAIN_SEED = 1332;

/**
 * How deep the paper gives under a full draw, as a share of the rod's own thickness.
 *
 * The waist's radius ends up at `1 − 2 × DIP_SHARE` of nominal, because `paperGive` returns the
 * dent's depth and the tube is scaled by what is left of the half-width. At the 0.22 this was,
 * that is a 44 % loss of diameter — the rod visibly thinnens while the finger is held, which is
 * the opposite of what paper does. 0.06 keeps S7/S15's 吸入时纸面会塌陷 as a softening.
 */
export const DIP_SHARE = 0.06;

/** Where the tube pinches: just behind the cherry, which is where the air is actually leaving. */
export const WAIST = 0.78;

/**
 * How far the paper has given inward at one x, sampled from the very curve the rod's body path
 * emits.
 *
 * There is a reason this reads the curve instead of using a formula: the first version of the dent
 * shrank the brand band by a bell of its own, and the bell disagreed with the Bézier by 0.15 px at the
 * band's centre — a stripe standing a hair outside a collapsed tube, which is exactly how a fake dent
 * reads as a bug. One sampler, one shape.
 */
export function paperGive(length: number, thickness: number, dip: number, x: number): number {
  if (dip <= 0) return 0;
  const half = thickness / 2;
  const r = Math.min(thickness * 0.45, length / 2, half);
  const x0 = r;
  const x1 = length - r;
  const cy = -half + dip * 2;
  let closest = -half;
  let bestDx = Infinity;
  for (let step = 0; step <= 32; step += 1) {
    const t = step / 32;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * (length * WAIST) + t * t * x1;
    const py = mt * mt * -half + 2 * mt * t * cy + t * t * -half;
    const dx = Math.abs(px - x);
    if (dx < bestDx) {
      bestDx = dx;
      closest = py;
    }
  }
  return half + closest;
}

/**
 * §20's tray answers a drag — the readings the retired 2D layer drove `drawAshtray` with, kept here
 * so the scene and whatever draws next read one set of numbers.
 *
 * Three facts, none of which the tray is told by a control: how full it is, that something just
 * landed in it, and that the rod is being carried toward it. The 2D layer had all three since the
 * tray first answered a drag; the 3D rewrite drew the bowl and the pile and lost them, and the
 * retirement counted the loss (task #134). The constants are that layer's own, transcribed rather
 * than re-derived: `TRAY_FULL_GRAMS 0.36`, an impulse of `0.5` per dropped unit draining over
 * `620 ms`, an invitation easing over `140 ms`, and a rock of `cos(now/46) · wobble · 0.05` radians.
 */
export const TRAY_FEEDBACK = {
  /** How many grams make the mound read as full. */
  fullGrams: 0.36,
  /** Below this the bowl reads as empty, and §2's pile is not drawn at all. */
  moundFloor: 0.02,
  /** The impulse one unit of dropped ash leaves behind, before the realism dial. */
  perDrop: 0.5,
  /** ms for a full-tilt rock to settle back to level. */
  drainMs: 620,
  /** ms for the invitation to arrive and go. */
  easeMs: 140,
  /** The rock's own period, in ms of the simulation's clock. */
  periodMs: 46,
  /** Its amplitude at full tilt, in radians. */
  amplitude: 0.05,
  /** The two warm inks the 2D layer mixed with: the rim toward it as the invite grows … */
  rimWarm: [255, 214, 150] as Rgb,
  /** … and the halo outside the rim, drawn at half the invite's alpha. */
  haloWarm: [255, 196, 128] as Rgb,
  /** The halo's own ellipse, in fractions of the tray's radius: wider than the bowl, flatter. */
  halo: { across: 1.16, down: 0.54 },
} as const;

export interface TrayFeedback {
  /** 0..1: how full the mound of ash has grown. */
  load: number;
  /** 0..1 decaying impulse, replayed every time ash lands. */
  wobble: number;
  /** 0..1 while the rod is being carried somewhere. */
  invited: number;
  /** The ash count this was last stepped against; -1 before the first frame. */
  dropped: number;
}

export const TRAY_FEEDBACK_START: TrayFeedback = {
  load: 0,
  wobble: 0,
  invited: 0,
  dropped: -1,
};

/**
 * One frame of the tray's answer.
 *
 * `cartoon` is the realism dial's own multiplier, so a player who asks for 写实 gets a tray that
 * behaves like an object and one who asks for 卡通 gets the exaggerated rock — the same dial every
 * other exaggeration on this stage goes through, which is why it is an argument and not a constant.
 */
export function stepTrayFeedback(
  previous: TrayFeedback,
  frame: {
    grams: number;
    dropped: number;
    dragged: boolean;
    dtMs: number;
    cartoon: number;
  },
): TrayFeedback {
  const { fullGrams, perDrop, drainMs, easeMs } = TRAY_FEEDBACK;
  const landed =
    previous.dropped >= 0 && frame.dropped > previous.dropped
      ? (frame.dropped - previous.dropped) * perDrop * frame.cartoon
      : 0;
  const wobble = Math.max(0, Math.min(1, previous.wobble + landed) - frame.dtMs / drainMs);
  const ease = Math.min(1, frame.dtMs / easeMs);
  return {
    load: Math.max(0, Math.min(1, frame.grams / fullGrams)),
    wobble,
    invited: previous.invited + ((frame.dragged ? 1 : 0) - previous.invited) * ease,
    dropped: frame.dropped,
  };
}

/**
 * The tray's tilt this frame. Cosine, not sine: a released oscillator starts at full tilt and
 * settles back to level, which is what makes the object look like it has weight.
 */
export function trayRock(feedback: TrayFeedback, nowMs: number): number {
  const { periodMs, amplitude } = TRAY_FEEDBACK;
  if (feedback.wobble <= 0) return 0;
  return Math.cos(nowMs / periodMs) * feedback.wobble * amplitude;
}

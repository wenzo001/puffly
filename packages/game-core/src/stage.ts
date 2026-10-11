/**
 * The stage: how a canvas becomes a place to put things — SPEC.md §55, §66.
 *
 * Two ideas live here and nowhere else:
 *
 *  1. `stageBoxFor` — the rectangle inside a canvas that props may occupy. It keeps a
 *     sane aspect (a phone fills the screen, an ultrawide gets a centred strip) and is
 *     shared by the renderer and the shell, so hit-testing and drawing can never disagree
 *     about where "the middle" is.
 *  2. `layoutFor` — where the pack, lighter, tray and held rod sit *for that shape*.
 *     A landscape phone and a portrait phone have completely different empty space, and
 *     one normalised table cannot serve both: that is what made the landscape layout look
 *     like a pebble in a shoebox.
 *
 * Positions are normalised to the stage box (0..1 on both axes). Because the box aspect
 * varies, distances in that space are anisotropic, so `stageDistance` carries the aspect
 * into every hit test instead of pretending x and y are the same size.
 */

import { clamp, type Point } from '@puffly/shared';
import { ANGLES, LAYOUT } from './constants';

/**
 * Below this the canvas is a tall slab (phone portrait). It sits under the reference
 * stage aspect of 0.75 on purpose: an engine that was never told its aspect keeps the
 * desktop geometry, so a layout change cannot silently rewrite a session's ergonomics.
 */
export const TALL_ASPECT_MAX = 0.7;
export const WIDE_ASPECT_MIN = 1.35;

/** The stage box never gets narrower than this… */
export const STAGE_MIN_ASPECT = 0.42;

/**
 * No prop's anchor may sit below this line in a layout the shell draws chrome over.
 *
 * The pill and the rail own the bottom of a phone (measured: the pill's top edge lands at 0.81 of
 * a 390×844 stage, and a landscape stage loses even more of its height to the same fixed-pixel
 * chrome), and a rod lying underneath them reads as interface and table in a heap — the player
 * cannot tell which of the two a tap will hit. `stage.test.ts` holds every layout to this.
 */
export const CHROME_CLEAR_Y = 0.72;

/**
 * How tall the shell's bottom furniture is, in CSS pixels: `CtaPill.vue` sits 74px off the bottom
 * of the window and the pill itself is 58px tall. The rail under it is shorter than that, so the
 * pill owns the band.
 */
export const CHROME_BAND_PX = 74 + 62;

/** A prop flush against the edge of a button still reads as one object with it; this is the gap. */
export const CHROME_EDGE_PX = CHROME_BAND_PX + 12;

/**
 * Where the chrome starts on a stage this tall, as a fraction of the stage's own height.
 *
 * The line is not a constant. The chrome is fixed pixels and the stage is not, so the shorter the
 * window, the larger its share: on a 390×844 phone the band is 17% of the stage, and on the same
 * phone turned sideways it is 37% — which is how a table that clears the button in portrait can
 * put the cigarette behind it in landscape.
 *
 * Without a height the honest answer is the historical line, so a caller that never learned the
 * pixel size keeps the layout it was built with.
 */
export function chromeClearY(stageHeightPx?: number): number {
  if (!Number.isFinite(stageHeightPx ?? NaN) || (stageHeightPx ?? 0) <= 0) return CHROME_CLEAR_Y;
  return clamp(1 - CHROME_EDGE_PX / (stageHeightPx as number), 0.25, 1);
}

/**
 * How far below its anchor each thing is actually painted, in stage units. The tray's is its own
 * radius; the rest are measured off the picture by `chrome-band.test.ts`, which draws the real
 * objects and goes red when these numbers lie.
 */
const ROD_REACH = 0.05;
const PACK_REACH = 0.035;
const LIGHTER_REACH = 0.06;

/** Lift a layout into the space the chrome leaves, by compressing its vertical positions toward the top. */
function liftTo(layout: StageLayout, clearY: number): StageLayout {
  const lowest = (anchor: number, reach: number): number =>
    anchor + reach >= clearY ? (clearY - reach) / anchor : 1;
  const scale = Math.min(
    lowest(layout.table.y, ROD_REACH),
    lowest(layout.pack.y, PACK_REACH),
    lowest(layout.lighter.y, LIGHTER_REACH),
    lowest(layout.ashtray.y, layout.ashtrayRadius),
    lowest(layout.restPivot.y, ROD_REACH),
  );
  if (scale >= 1) return layout;
  const y = (point: Point): Point => ({ x: point.x, y: point.y * scale });
  return {
    ...layout,
    table: y(layout.table),
    pack: y(layout.pack),
    lighter: y(layout.lighter),
    ashtray: y(layout.ashtray),
    restPivot: y(layout.restPivot),
    tableEdgeY: layout.tableEdgeY * scale,
  };
}
/** …nor wider than this, so an ultrawide monitor does not fling the tray off-screen. */
export const STAGE_MAX_ASPECT = 1.9;

export interface StageLayout {
  id: 'tall' | 'regular' | 'wide';
  /** Where a fresh rod lies. */
  table: Point;
  pack: Point;
  lighter: Point;
  ashtray: Point;
  /** Where the rod is held. */
  restPivot: Point;
  /** Horizon of the table surface, as a fraction of the stage height. */
  tableEdgeY: number;
  ashtrayRadius: number;
  /** How far the held rod tilts; a landscape scene can afford more. */
  heldDeg: number;
}

const REGULAR: StageLayout = {
  id: 'regular',
  table: LAYOUT.table,
  pack: LAYOUT.pack,
  lighter: LAYOUT.lighter,
  ashtray: LAYOUT.ashtray,
  restPivot: LAYOUT.restPivot,
  tableEdgeY: 0.64,
  ashtrayRadius: 0.1,
  heldDeg: ANGLES.heldDeg,
};

const TALL: StageLayout = {
  id: 'tall',
  // On a phone the whole table sits above the chrome instead of under it. The pill and the rail
  // own the bottom of the screen (measured on a 390×844 stage: the pill's top edge is at 0.81),
  // and a rod lying at 0.855 was drawn behind the very button the player presses to draw it —
  // which is what made the bottom of the scene read as a heap of overlapping things. Lifting the
  // table line also hands the plume the room it needs to travel upward.
  //
  // The rod lies to the *left* of the tray and the tray sits high enough to clear the bar at the
  // bottom, because the two objects' hit areas may not overlap: when the rod lay under the tray,
  // a tap meant for the rod put the break out, and the player had no way to learn that the grey
  // ellipse was the thing they had just touched.
  table: { x: 0.26, y: 0.705 },
  pack: { x: 0.155, y: 0.63 },
  // Up at the back of the table and clear of the pack: two props drawn on top of each other read
  // as one object, and then nothing on the table is tappable that the player can see.
  lighter: { x: 0.095, y: 0.49 },
  ashtray: { x: 0.735, y: 0.695 },
  restPivot: { x: 0.5, y: 0.52 },
  tableEdgeY: 0.66,
  ashtrayRadius: 0.095,
  heldDeg: -19,
};

const WIDE: StageLayout = {
  id: 'wide',
  // A band: spread the objects apart and lift the horizon, or the middle looks empty.
  table: { x: 0.33, y: 0.695 },
  pack: { x: 0.19, y: 0.625 },
  lighter: { x: 0.075, y: 0.47 },
  ashtray: { x: 0.815, y: 0.685 },
  restPivot: { x: 0.52, y: 0.45 },
  tableEdgeY: 0.61,
  ashtrayRadius: 0.085,
  heldDeg: -14,
};

export const STAGE_LAYOUTS: Record<StageLayout['id'], StageLayout> = {
  tall: TALL,
  regular: REGULAR,
  wide: WIDE,
};

export function layoutFor(aspect: number, clearY: number = CHROME_CLEAR_Y): StageLayout {
  if (!Number.isFinite(aspect) || aspect <= 0) return liftTo(REGULAR, clearY);
  if (aspect < TALL_ASPECT_MAX) return liftTo(TALL, clearY);
  if (aspect >= WIDE_ASPECT_MIN) return liftTo(WIDE, clearY);
  return liftTo(REGULAR, clearY);
}

export interface StageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
}

/**
 * The largest stage box of an aspect within [0.42, 1.9] that fits the canvas, centred.
 * Background layers paint the whole canvas; only props are confined to this box, so the
 * clamping is invisible except that it keeps objects in reach of a thumb.
 */
export function stageBoxFor(widthPx: number, heightPx: number): StageBox {
  const w = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
  const h = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 1;
  const target = clamp(w / h, STAGE_MIN_ASPECT, STAGE_MAX_ASPECT);

  if (w / h <= target) {
    return { x: 0, y: 0, width: w, height: h, aspect: w / h };
  }
  const width = h * target;
  return { x: (w - width) / 2, y: 0, width, height: h, aspect: target };
}

/** Distance in stage space, corrected for the box's aspect so a hit area is round on screen. */
export function stageDistance(a: Point, b: Point, aspect: number): number {
  const dx = (a.x - b.x) * (Number.isFinite(aspect) ? aspect : 1);
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Distance from a point to a line segment, in the same screen-round metric as
 * `stageDistance`.
 *
 * A cigarette is 0.26 stage units long and about 0.01 thick. Measuring a tap against its
 * midpoint alone leaves the outer half of the thing you can see untappable, which on a phone
 * means the tray's wide touch target swallows the tap instead.
 */
export function stageDistanceToSegment(
  point: Point,
  from: Point,
  to: Point,
  aspect: number,
): number {
  const scale = Number.isFinite(aspect) ? aspect : 1;
  const px = point.x * scale;
  const py = point.y;
  const ax = from.x * scale;
  const ay = from.y;
  const bx = to.x * scale;
  const by = to.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * A finger is not a cursor: on a 390 px screen one normalised unit is 180 px, so a
 * 0.085 radius is already generous — but touch still lands sloppily, especially on the
 * cherry and the ash. Touch inputs get this multiplier on every hit radius (§66).
 */
export const TOUCH_HIT_TOLERANCE = 1.6;

/**
 * …capped by an absolute pad, because a multiplier alone lets the widest thing on the table
 * reach across the whole screen. The tray is 0.135 units across before any widening; times
 * 1.6 it answered taps aimed at the rod lying next to it, and putting the break out looked
 * like a mystery. Small targets still grow the full amount; large ones stop at a finger.
 */
export const TOUCH_HIT_PAD = 0.04;

export function hitToleranceFor(
  source: 'touch' | 'pointer' | 'mouse' | 'keyboard' | 'shortcut' | undefined,
): number {
  return source === 'touch' ? TOUCH_HIT_TOLERANCE : 1;
}

/** How far a pointer of this kind may be off and still mean the object it touched. */
export function touchReach(radius: number, tolerance: number): number {
  if (tolerance <= 1) return radius;
  return Math.min(radius * tolerance, radius + TOUCH_HIT_PAD);
}

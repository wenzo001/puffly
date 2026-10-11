/**
 * The abstract mouth, §puffAnimations (S22): a lip line and an airflow column, and nothing else.
 *
 * This module is pure geometry — it never touches three.js, so every shape the redline allows is
 * testable without a canvas. Its output is measured in the Demo's own reference pixels (a 390 × 844
 * phone stage); the scene converts through the same px→world pass the other props use.
 *
 * Two frames meet at the lips: `x` runs *across* the lips (perpendicular to the rod), and `+y`
 * points outward, continuing the rod past its mouth end — which is the direction the airflow
 * column travels. The scene places and rotates the frame from the rod's own pivot and angle, so
 * nothing here knows where the mouth is.
 *
 * The hard constraints are the source's own words: no teeth, tongue, eyes or nose — the two short
 * `wrinkle` ticks L1 names (鼻翼褶) are lip tension drawn beside the corners, not a feature — and
 * every deformation stays in single-digit pixels or four degrees.
 */
import type { LipAction, PuffTierId } from '@puffly/game-core';

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export type LipStrokeKind = 'bead' | 'wisp' | 'wrinkle';

/** One extra mark the action asks for beyond the two lip curves. */
export interface LipStroke {
  readonly kind: LipStrokeKind;
  /** A polyline for a stroke, a single point plus `radiusPx` for the bead. */
  readonly points: readonly Pt[];
  readonly radiusPx?: number;
}

export interface LipLineArt {
  /** Upper lip, sampled mouth-left to mouth-right. */
  readonly upper: readonly Pt[];
  /** Lower lip, same order. */
  readonly lower: readonly Pt[];
  /** L3 presses in steps: the two curves meet at the centre with a deliberate break. */
  readonly segmented: boolean;
  readonly strokes: readonly LipStroke[];
}

/** One soft trapezoid of the airflow column, near end at `y0`, far end at `y1`. */
export interface ColumnSegment {
  readonly y0: number;
  readonly y1: number;
  readonly w0: number;
  readonly w1: number;
}

export interface AirflowArt {
  /** One piece normally, two with a gap for L3 顿口. */
  readonly segments: readonly ColumnSegment[];
  /** Sideways bend at the column's far end, px (S3 偏唇, M2 轻旋). */
  readonly bendPx: number;
  /** M2 bends on an S-curve; the other bends drift straight. */
  readonly spin: boolean;
  /** Whole-column base offset from the mouth centre, px (S3). */
  readonly offsetPx: number;
  /** How long the column takes to reach full opacity; S1 names 0.3 s to the top. */
  readonly fadeInMs: number;
}

export interface LipArt {
  /** Rotation of the whole mouth, degrees — only S3 names one (-4°). */
  readonly tiltDeg: number;
  readonly lip: LipLineArt;
  readonly column: AirflowArt;
  /** Demo glyph ink (#EDE5DA), for the two curves and their marks. */
  readonly lipRgb: readonly [number, number, number];
  readonly lipAlpha: number;
  /** Demo S3 column ink, rgba(207,198,188,…). */
  readonly columnRgb: readonly [number, number, number];
  /** Fade from the mouth end to the far end. */
  readonly columnAlpha: readonly [number, number];
}

/** The mouth's width in the Demo's 26 px glyph box. */
const BASE_HALF_WIDTH_PX = 13;
/** Upper/lower lip rest distances from the seam, px. */
const UPPER_REST_PX = 4;
const LOWER_REST_PX = 3;
const MIN_GAP_PX = 0.75;
/** The column is a modest stream at the mouth — it widens and softens as it leaves. */
export const COLUMN_BASE_HALF_WIDTH_PX: Record<PuffTierId, number> = { S: 4, M: 6, L: 9 };
const COLUMN_LENGTH_PX = 96;
const SEGMENT_GAP_PX = 6;
/** Words the source leaves as words (最细 / 略细 / 最宽), mapped once, here. */
const WORD_SCALE: Record<string, number> = { 最细: 0.85, 略细: 1, 最宽: 1.25 };
const DEFAULT_FADE_MS = 120;

const LIP_INK = [237, 229, 218] as const;
const COLUMN_INK = [207, 198, 188] as const;
const COLUMN_ALPHA: readonly [number, number] = [0.2, 0.06];

const pt = (x: number, y: number): Pt => ({ x, y });

/** Quadratic Bézier through start, two controls and end, sampled `samples` per segment. */
function curve(p0: Pt, c1: Pt, c2: Pt, p1: Pt, samples = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const mt = 1 - t;
    const x = mt ** 3 * p0.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p1.x;
    const y = mt ** 3 * p0.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p1.y;
    out.push(pt(x, y));
  }
  return out;
}

export function lipArt(action: LipAction): LipArt {
  const { lip, column: col } = action;

  // --- the lip line -------------------------------------------------------------------------
  let half = BASE_HALF_WIDTH_PX;
  let upperH = UPPER_REST_PX;
  let lowerG = LOWER_REST_PX;
  let beadOut = 0;
  let lowerOut = 0;
  const strokes: LipStroke[] = [];

  if (lip.tuckPx !== undefined) half -= lip.tuckPx;
  if (lip.narrowPx !== undefined) half -= lip.narrowPx;
  if (lip.flat) upperH = 2;
  if (lip.flattenPx !== undefined) {
    // Pressed flat: the seam closes while the line spreads a hair rather than opens a mouth.
    lowerG = Math.max(MIN_GAP_PX, lowerG - lip.flattenPx);
    half += 2;
  }
  if (lip.beadPx !== undefined) {
    beadOut -= lip.beadPx; // the bead sits on the upper lip, i.e. toward the seam
    strokes.push({ kind: 'bead', points: [pt(0, -upperH - lip.beadPx)], radiusPx: 1.6 });
  }
  if (lip.beadOutPx !== undefined) {
    beadOut = lip.beadOutPx;
    strokes.push({ kind: 'bead', points: [pt(0, -upperH + lip.beadOutPx)], radiusPx: 1.8 });
  }
  if (lip.lowerLipOutPx !== undefined) lowerOut = lip.lowerLipOutPx;
  if (col.wisps !== undefined) {
    const len = col.wisps === 'strongest' ? 11 : 8;
    strokes.push({
      kind: 'wisp',
      points: [pt(-half + 1, -1), pt(-half - len * 0.4, 4), pt(-half - len * 0.15, len)],
    });
    strokes.push({
      kind: 'wisp',
      points: [pt(half - 1, -1), pt(half + len * 0.4, 4), pt(half + len * 0.15, len)],
    });
  }
  if (col.noseWrinkles) {
    strokes.push({
      kind: 'wrinkle',
      points: [pt(-half - 2, -upperH - 1), pt(-half - 4, -upperH - 4)],
    });
    strokes.push({
      kind: 'wrinkle',
      points: [pt(half + 2, -upperH - 1), pt(half + 4, -upperH - 4)],
    });
  }

  const w = Math.max(6, half);
  const beadY = -upperH + beadOut;
  const upper = curve(pt(-w, 0), pt(-w * 0.55, -upperH), pt(0, beadY), pt(w, 0));
  const lower = curve(
    pt(-w, 0),
    pt(-w * 0.5, lowerG + lowerOut),
    pt(0, lowerG + lowerOut),
    pt(w, 0),
  );

  // --- the airflow column --------------------------------------------------------------------
  const tier: PuffTierId = action.tier;
  const word = col.note === undefined ? 1 : (WORD_SCALE[col.note] ?? 1);
  const scale = col.scale ?? 1;
  const nearW = COLUMN_BASE_HALF_WIDTH_PX[tier] * scale * word;
  const farW = nearW * (col.tipDiverges ? 1.8 : 1.7);
  const bendPx = col.spinDeg !== undefined ? 6 : col.sideVortex ? 8 : 0;
  const segments: ColumnSegment[] =
    col.segments === 2
      ? [
          { y0: 0, y1: COLUMN_LENGTH_PX * 0.44, w0: nearW, w1: (nearW + farW) / 2 },
          {
            y0: COLUMN_LENGTH_PX * 0.44 + SEGMENT_GAP_PX,
            y1: COLUMN_LENGTH_PX,
            w0: (nearW + farW) / 2,
            w1: farW,
          },
        ]
      : [{ y0: 0, y1: COLUMN_LENGTH_PX, w0: nearW, w1: farW }];

  return {
    tiltDeg: lip.tiltDeg ?? 0,
    lip: { upper, lower, segmented: lip.segments === 2, strokes },
    column: {
      segments,
      bendPx,
      spin: col.spinDeg !== undefined,
      offsetPx: col.offsetPx ?? 0,
      fadeInMs: col.toTopSeconds === undefined ? DEFAULT_FADE_MS : col.toTopSeconds * 1000,
    },
    lipRgb: LIP_INK,
    lipAlpha: 0.9,
    columnRgb: COLUMN_INK,
    columnAlpha: COLUMN_ALPHA,
  };
}

export { COLUMN_LENGTH_PX, BASE_HALF_WIDTH_PX };

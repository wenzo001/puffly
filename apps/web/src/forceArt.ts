/**
 * 力度条 — the exhale reading from §2's S4 screen of `SmokeRitual-UI-Demo.html`.
 *
 * The Demo's screen draws one 342 × 12 bar: an 8 px rounded track in rgba(255,255,255,.05), the
 * draw's own share filled in rgba(255,138,61,.30), and a 3 px cream crest in rgba(255,217,160,.55).
 * The width of the fill is the same single figure the head-up ring already reads (`62`), owned by
 * `forceReading` — the number and the bar cannot come from two places.
 *
 * The earlier deck iteration drew three silk threads and three cloud lobes at the ends; the Demo
 * is the later, sole visual truth, so the bar is what ships now.
 */

import { clamp01 } from '@puffly/shared';

/** The bar's own geometry, exactly the SVG the Demo places under the pill. */
export const FORCE_BAR = {
  width: 342,
  height: 12,
  track: {
    x: 0,
    y: 2,
    height: 8,
    radius: 4,
    fill: 'rgba(255,255,255,0.05)',
  },
  fill: {
    y: 2,
    height: 8,
    radius: 4,
    /** rgba(255,138,61,.30) — the ember at 30 %. */
    colour: 'rgba(255,138,61,0.30)',
  },
  crest: {
    y: 2,
    height: 3,
    radius: 1.5,
    /** rgba(255,217,160,.55) — the bright top edge on the filled portion. */
    colour: 'rgba(255,217,160,0.55)',
  },
} as const;

/** What the pill and the ring need to agree about: the rod's state and its last draw. */
interface ForceSource {
  readonly state: string;
  readonly puff: { readonly lastDraw: number };
}

/**
 * The draw the player just took, as the 0–100 figure the S4 screen reads, or `null` when the rod is
 * not in the window the smoke is leaving.
 *
 * `RESTING` is that window: it is what the state machine derives for the `restSettleMs` after a
 * release, and a long column or a stub pre-empts it on purpose — one screen reads one news. The
 * settle length is the core's decision and is not re-timed here.
 */
export function forceReading(cigarette: ForceSource): number | null {
  if (cigarette.state !== 'RESTING') return null;
  const { lastDraw } = cigarette.puff;
  // Zero means "no draw has ended": a rod that was never breathed on, or one restored from a save,
  // has nothing to report and must not show a fill pinned at the thin end.
  if (!(lastDraw > 0)) return null;
  return Math.round(clamp01(lastDraw) * 100);
}

/** How wide the filled portion is, in the bar's own 342 px. */
export function forceFillWidth(percent: number): number {
  return FORCE_BAR.width * clamp01(Math.max(0, percent) / 100);
}

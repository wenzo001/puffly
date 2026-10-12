/**
 * The rod's burning end, as arithmetic.
 *
 * Split out of `SceneStage.vue` for the same reason `placeColumn`'s band maths is written down
 * rather than inlined: a check has to be able to call it. The scene has no component harness, so a
 * number computed inside a `place*` function can only ever be read back out of a screenshot — and
 * "the burn line is at 0.63 of the rod" is not something a person can see in a frame either. This
 * file is pure: no three.js, no DOM, no clock, no rng.
 *
 * **One definition of burnt.** The only input is the core's own `cigarette.rodRemaining` ("0..1
 * unburnt paper portion", `types/state.ts`), which is the same field the core turns into ash
 * (`ashProducedGrams = clamp01(1 - rodRemaining) * ashGrams`, `runtime.ts`) and into the stub
 * readout. Nothing here re-derives "how far it has burned" from a timer, a length or a fraction of
 * the drawn tube — a second definition of that word is the mistake this repository names twice in
 * ARCHITECTURE.md ("One copy of every fact").
 */

import { clamp01 } from '@puffly/shared';

/** How far along the drawn tube the burn line sits, 0 at the mouth end and 1 at the lit tip. */
export function rodBurnLineAt(rodRemaining: number): number {
  // `rodRemaining` is the *unburnt* share, so the front is what is left of it subtracted from the
  // whole. Clamped, because a resumed break can hand back a hair over 1 and a burnt-out rod a hair
  // under 0, and a burn line outside its own tube is worse than one pinned to the end.
  const unburnt = Number.isFinite(rodRemaining) ? Math.min(1, Math.max(0, rodRemaining)) : 1;
  return 1 - unburnt;
}

/**
 * How long the burnt end reads, as a share of the rod's own thickness.
 *
 * A bare cylinder ends on a machined circle. Real paper ends on a ragged edge that is a little
 * narrower than the tube and a little longer than a hard cut, and that difference is most of what
 * makes the object read as paper rather than as a rod of plastic. The floor is what keeps it
 * visible at all on a phone: the rod is ~34 device px across at 393 pt, so a share under ~0.06 is
 * a sub-pixel edge that just softens the silhouette.
 */
export const BURN_END_SHARE = 0.16;

/**
 * The paper's own grain, one row per texel across the rod.
 *
 * Longitudinal on purpose. A cigarette's paper is a mat of fibres running *along* the tube, so the
 * variation that reads as paper is fine lines down its length and almost none around it: an
 * isotropic noise reads as concrete, and the crosswise component is what does that. Two integer
 * LCG-driven streams — one for the lengthwise streaks (sampled per column, held for the whole
 * texture height) and one for the crosswise nap (much weaker) — so a texel is a pure function of
 * its index and the same paper is baked identically on every run and every machine (§71).
 */
export const GRAIN = {
  /** Columns the grain is sampled at. 64 across a ~68 device-px rod is about one streak per px. */
  columns: 64,
  /** Rows, down the rod. Four, because the streaks must carry *down* it rather than along it. */
  rows: 4,
  /**
   * Both swings are one-sided (see `paperGrainPixels`), so this is where the paper sits inside
   * them: the mean of the two shares below, subtracted back out. Writing it down rather than
   * letting the plane multiply the material's colour by a mean above 1 is what keeps the pale held
   * paper (`#f0e8da`, already 94 % of full scale) from blowing out on its brightest texel — the
   * first version clamped at 255 and flattened every streak that ran into the ceiling, measured as
   * `min=237 max=255` with the top 3 columns pinned to white.
   */
  bias: 0.055,
  /** The lengthwise streaks' swing, as a share of the paper colour. */
  alongShare: 0.09,
  /** The crosswise nap's, deliberately smaller: this is the component that reads as concrete. */
  acrossShare: 0.05,
  /** ±1 integer LCG, the same shape `createGrainTile` uses (`game-scene/noise`). */
  seed: 0x9e37,
} as const;

/** One step of the integer LCG the repo's baked tiles use, returning -1..1. Kept local so this file
 *  stays free of the renderer's noisier helpers — the grain is a *tile*, not a field. */
function lcgUnit(state: { value: number }): number {
  state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0;
  return (state.value / 0xffffffff) * 2 - 1;
}

/**
 * The paper's grain as RGBA texels, `columns × rows`, painted as a *multiplier* around 1: channel
 * `c` of a flat paper colour becomes `c * m` where `m` is this texel's value. Baking a multiplier
 * rather than a colour is what lets one texture serve both of §2's rods — the dark band on the pack
 * and the pale held paper — without a second copy of either ink, which is why the rod's own
 * material colour stays the thing that decides which rod it is (`rodInkFor`).
 *
 * Both streams are **one-sided** (`1 - |draw| · share`) and `GRAIN.bias` puts the mean back on 1, so
 * the plane darkens the paper and never brightens it. That is deliberate and it is what the first
 * version got wrong: a symmetric multiplier pushes the pale held paper (`#f0e8da`) past full scale
 * on half its texels, where the clamp flattens them into a solid stripe — measured `min=237
 * max=255`, with whole columns pinned to white instead of drawn as paper.
 *
 * Values are written in sRGB because that is how the texture is tagged on the way in; the renderer
 * decodes them, so a multiplier of 1 lands back on exactly the flat colour the material names.
 */
export function paperGrainPixels(): Uint8Array {
  const { columns, rows, alongShare, acrossShare, bias, seed } = GRAIN;
  const out = new Uint8Array(columns * rows * 4);
  const stream = { value: seed };
  // One draw per column, held down the whole column: that is the longitudinal half, and holding it
  // is the entire difference between "paper" and "noise". Both swings are one-sided, so their mean
  // is below 1 by `bias`/2 each and `bias` puts it back on exactly 1.
  const columnValues = new Float32Array(columns);
  for (let x = 0; x < columns; x += 1) columnValues[x] = 1 - Math.abs(lcgUnit(stream)) * alongShare;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      // The nap is drawn per texel and per row, so it is the only thing that changes *across* the
      // tube — the streaks are constant down a column by construction.
      const nap = 1 - Math.abs(lcgUnit(stream)) * acrossShare;
      const m = (columnValues[x] ?? 1) * nap + bias;
      const value = Math.round(Math.max(0, Math.min(1, m)) * 255);
      const at = (y * columns + x) * 4;
      out[at] = value;
      out[at + 1] = value;
      out[at + 2] = value;
      // Opaque: this is a map channel, not paint. An alpha below 1 would make the rod translucent.
      out[at + 3] = 255;
    }
  }
  return out;
}

/**
 * How much of the tube's width survives at `t`, the mouth's crimp.
 *
 * A real cigarette is rolled shut at the end you put your lips on, so that end is narrower than the
 * tube and closes cosinely rather than stepping. `t` is the rod's own parametrisation — 0 at the
 * mouth, 1 at the lit tip (the same one `pointAt` and `rodBurnLineAt` answer in) — so the crimp
 * belongs at the *low* end. It used to be written `t >= 1 - crimpSpan`, which pinched the **lit**
 * end instead: the burn line, the cherry cap and the ash collar all land at `pointAt(1)`, so the
 * crimp was drawn on top of the very features that say which end is burning.
 *
 * 1 at `t >= span`, 0.7 at the very mouth, cosine in between. The ease runs on `1 - t/span`, so it is
 * maximal at the mouth and has gone by `span` — writing it on `t/span` (the obvious guess, and my
 * first attempt) puts the narrowest point one span-length *past* the mouth and makes the curve rise
 * before it falls, which is how this was caught rather than shipped.
 */
export function rodMouthShare(t: number, span = BURN_END_SHARE): number {
  const along = clamp01(Number.isFinite(t) ? t : 1);
  const width = span > 0 ? span : BURN_END_SHARE;
  if (along >= width) return 1;
  // 1 at the mouth easing to 0 at `span`: the crimp's own half, cosinely.
  const ease = Math.PI * (1 - along / width);
  return 1 - 0.3 * (0.5 - 0.5 * Math.cos(ease));
}

/**
 * The tip ash's size, as a share of the rod's thickness.
 *
 * `ash.ratio` is the core's own reading of how full the standing column is (`ash.length /
 * ash.maxLength`, written by `tickAsh`), so this asks the simulation how much ash has accumulated
 * rather than counting anything here. A bare rod still shows a rim — a just-lit cigarette has a
 * glowing tip before it has any ash — so the floor is the ember's own collar, not zero.
 */
export function tipAshShare(ashRatio: number, emberPresence: number): number {
  const full = Number.isFinite(ashRatio) ? Math.min(1, Math.max(0, ashRatio)) : 0;
  const lit = Number.isFinite(emberPresence) ? Math.min(1, Math.max(0, emberPresence)) : 0;
  // 0.18 of the thickness bare, growing to 0.62 when the column is at its critical length; the
  // `lit` term is what keeps a dead rod from wearing a collar it never grew.
  return (0.18 + full * 0.44) * lit;
}

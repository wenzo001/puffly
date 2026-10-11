/**
 * Viewport: logical stage coordinates in, CSS pixels out — SPEC.md §55.
 *
 * The stage keeps its own aspect and is letterboxed inside the canvas, so the same
 * normalised coordinates written by Game Core place correctly on a phone in portrait, a
 * tablet, a desktop window or an ultrawide monitor. Background layers use the whole
 * canvas; props use the stage, which is what makes ultrawide look intentional.
 */

import { stageBoxFor, type Point } from '@puffly/game-core';

export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
  readonly stage: StageRect;
  /** Pixels for one normalised stage unit; the single scale factor everything else uses. */
  readonly unit: number;
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  px(point: Point): { x: number; y: number };
  len(units: number): number;
  /** True when the canvas is taller than the stage, i.e. a portrait device. */
  readonly portrait: boolean;
  /** Stage box width / height, for anything that must match the core's hit metric. */
  readonly aspect: number;
}

export function createViewport(initial?: { width: number; height: number; dpr: number }): Viewport {
  let cssWidth = 800;
  let cssHeight = 1000;
  let dpr = 1;
  let stage: StageRect = { x: 0, y: 0, width: cssWidth, height: cssHeight };
  let unit = cssHeight;

  const measure = (): void => {
    // The rule lives in Game Core, because hit-testing has to use the very same box.
    const box = stageBoxFor(cssWidth, cssHeight);
    stage = { x: box.x, y: box.y, width: box.width, height: box.height };
    // Lengths scale with the smaller edge, so a long thin stage does not grow a giant rod.
    unit = Math.min(box.width / 0.75, box.height);
  };

  const apply = (nextWidth: number, nextHeight: number, nextDpr: number): void => {
    cssWidth = Number.isFinite(nextWidth) && nextWidth > 0 ? nextWidth : 1;
    cssHeight = Number.isFinite(nextHeight) && nextHeight > 0 ? nextHeight : 1;
    // A DPR of 0 or NaN happens on some headless canvases; 1 keeps the math honest.
    dpr = Number.isFinite(nextDpr) && nextDpr > 0 ? nextDpr : 1;
    measure();
  };

  apply(initial?.width ?? cssWidth, initial?.height ?? cssHeight, initial?.dpr ?? dpr);

  return {
    get cssWidth() {
      return cssWidth;
    },
    get cssHeight() {
      return cssHeight;
    },
    get dpr() {
      return dpr;
    },
    get stage() {
      return stage;
    },
    get unit() {
      return unit;
    },
    get portrait() {
      return cssHeight > cssWidth;
    },
    get aspect() {
      return stage.width / Math.max(1, stage.height);
    },
    resize(nextWidth, nextHeight, nextDpr) {
      apply(nextWidth, nextHeight, nextDpr);
    },
    px(point) {
      return { x: stage.x + point.x * stage.width, y: stage.y + point.y * stage.height };
    },
    len(units) {
      return units * unit;
    },
  };
}

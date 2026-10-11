/**
 * Stage coordinates → scene coordinates.
 *
 * The core owns the geometry (SPEC §79) and the shell mirrors it onto `.stage[data-aim]` as canvas
 * fractions. That mirror carries the points a finger can hit, which is a wider set than the five the
 * scene draws from, so `AIM_KEYS` here is a filter and not a copy of the shell's list. The scene reads
 * that mirror and nothing else: a second copy of the layout is
 * exactly the mistake the old browser layer made twice, and both times it reported a working game
 * as a broken one.
 *
 * Fractions are relative to the canvas, so the mapping needs the canvas aspect — otherwise a
 * portrait phone stretches the table. y is flipped: fractions grow downwards, world y grows up.
 */

export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

export const AIM_KEYS = ['body', 'ember', 'lighter', 'ashtray', 'pack'] as const;
export type AimKey = (typeof AIM_KEYS)[number];

/** Parse the `.stage[data-aim]` mirror: `body:0.62,0.41 lighter:0.12,0.85 …`. */
export function parseAim(text: string): Partial<Record<AimKey, AimPoint>> {
  const out: Partial<Record<AimKey, AimPoint>> = {};
  for (const part of text.split(' ')) {
    const [key, pair] = part.split(':');
    if (key === undefined || pair === undefined) continue;
    const [x, y] = pair.split(',').map(Number);
    if (!AIM_KEYS.includes(key as AimKey) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[key as AimKey] = { x: x as number, y: y as number };
  }
  return out;
}

/** World height of the visible stage; the width follows the canvas aspect so nothing is stretched. */
export const WORLD_HEIGHT = 4;

export function toWorld(point: AimPoint, aspect: number): readonly [number, number, number] {
  return [(point.x - 0.5) * WORLD_HEIGHT * aspect, (0.5 - point.y) * WORLD_HEIGHT, 0];
}

/** A rod drawn between the two published points, so its angle comes from the core and not a guess. */
export function rodBetween(
  body: AimPoint,
  ember: AimPoint,
  aspect: number,
): {
  readonly mid: readonly [number, number, number];
  readonly length: number;
  readonly angle: number;
} {
  const { pivot, tip } = rodEnds(body, ember);
  const a = toWorld(pivot, aspect);
  const b = toWorld(tip, aspect);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return {
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0],
    length: Math.hypot(dx, dy) || 1e-6,
    angle: Math.atan2(dy, dx),
  };
}

/**
 * The rod's two true ends from the published pair — (the point 45 % along the rod, the tip).
 *
 * The 0.55 is exact only in *stage plane* space; the first version scaled the already-mapped world
 * span by it instead, which on a portrait phone stretched the rod ~6 % and — because the mesh was
 * also still centred on the pair's midpoint rather than the rod's own — hung it ~0.15 world past
 * the ember. The standing ash is anchored at the true ember, so that is where "floating mid-rod"
 * came from. Extrapolate first, map once.
 */
export function rodEnds(body: AimPoint, ember: AimPoint): { pivot: AimPoint; tip: AimPoint } {
  return {
    pivot: {
      x: ember.x - (ember.x - body.x) / 0.55,
      y: ember.y - (ember.y - body.y) / 0.55,
    },
    tip: { x: ember.x, y: ember.y },
  };
}

/**
 * The stage rectangle inside the canvas, as four canvas fractions: `x,y,width,height`.
 *
 * The letterbox is the reason this exists. Anchors arrive as canvas fractions, but the stage is a
 * 3:4 box floating in that canvas — so a scene that mapped canvas fractions straight to the world
 * put the tray in the wrong place at the wrong size. The shell publishes the box for the same
 * reason it publishes the anchors: a second copy of the layout has gone stale twice in this repo.
 */
export interface StageBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function parseStageBox(text: string): StageBox | null {
  const parts = text.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Canvas fraction → world, through the stage box. `viewportAspect` is the canvas's own aspect
 * (width / height); the stage's world width follows from how much of the canvas the box covers.
 */
export function canvasToWorld(
  fraction: AimPoint,
  box: StageBox,
  viewportAspect: number,
): readonly [number, number, number] {
  const nx = (fraction.x - box.x) / box.width;
  const ny = (fraction.y - box.y) / box.height;
  const stageWidth = WORLD_HEIGHT * (box.width / box.height) * viewportAspect;
  return [(nx - 0.5) * stageWidth, (0.5 - ny) * WORLD_HEIGHT, 0];
}

/** The stage box's world size, which is also the orthographic camera's frame. */
export function stageWorldSize(
  box: StageBox,
  viewportAspect: number,
): { readonly width: number; readonly height: number } {
  return { width: WORLD_HEIGHT * (box.width / box.height) * viewportAspect, height: WORLD_HEIGHT };
}

/** A rod drawn between two canvas fractions, via the same box. */
export function rodBetweenInBox(
  body: AimPoint,
  ember: AimPoint,
  box: StageBox,
  viewportAspect: number,
): {
  readonly mid: readonly [number, number, number];
  readonly length: number;
  readonly angle: number;
} {
  const { pivot, tip } = rodEnds(body, ember);
  const a = canvasToWorld(pivot, box, viewportAspect);
  const b = canvasToWorld(tip, box, viewportAspect);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return {
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0],
    length: Math.hypot(dx, dy) || 1e-6,
    angle: Math.atan2(dy, dx),
  };
}

/**
 * Stage units → world units, with the frame the camera is built around.
 *
 * Distinct from `canvasToWorld`: those two take *canvas fractions* (positions the shell publishes
 * for pointers); these take the core's own stage units, which is what the particle pool works in.
 */
export function stageToWorld(
  point: AimPoint,
  frame: { readonly width: number; readonly height: number },
): readonly [number, number, number] {
  return [(point.x - 0.5) * frame.width, (0.5 - point.y) * frame.height, 0];
}

/**
 * How many world units one *stage unit* is worth.
 *
 * The renderer's `unit` — the scale every sprite and prop size in this repository is written in — is
 * `min(stageWidth / 0.75, stageHeight)` pixels, not the stage's height. Treating the stage's height
 * as one unit made every prop 1.63× too big on a 393×852 phone (852 / 524), which is exactly how a
 * plume came out as one soft ball. Sizes use the renderer's own rule; positions keep using the box.
 */
export function stageUnitToWorld(
  box: StageBox,
  viewportWidthPx: number,
  viewportHeightPx: number,
  worldHeight: number,
): number {
  const stageWidthPx = box.width * viewportWidthPx;
  const stageHeightPx = Math.max(1, box.height * viewportHeightPx);
  const unitPx = Math.min(stageWidthPx / 0.75, stageHeightPx);
  return (unitPx / stageHeightPx) * worldHeight;
}

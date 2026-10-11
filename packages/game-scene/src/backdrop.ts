/**
 * The backdrop as data — moved here with the painted layer's retirement (2026-10-10).
 *
 * This is the painted picture told as shapes: the sky's three stops, the wall band, the table
 * edge, the seeded clutter and furniture, and the two pools of light — so the scene stands the
 * room up without a second copy of any number. The interior family (room / desk / stairwell /
 * corner) is what this covers; the outdoor families still owe the scene their blocks, ridge,
 * steps and neon.
 */

import { mixRgb, type Rgb } from '@puffly/shared';
import type { GameStateView } from '@puffly/game-core';
import { fbm2 } from './noise';
import { interiorEdgeInk, skyPalette, type StageBoxFrac } from './room';

export interface Geometry {
  blocks: { x: number; y: number; w: number; h: number; lights: number[] }[];
  ridge: number[];
  bokeh: { x: number; y: number; r: number; warm: boolean }[];
  neon: { x: number; y: number; w: number; h: number; hue: number }[];
  /** The overhead flight of a stairwell: each entry is one tread's rising edge, left to right. */
  steps: number[];
  /**
   * The things that make a room a particular room: a pipe, a hanging flex, a lit window nobody is
   * in, a stain. Seeded per scene *and per day*, so the corner you sit in tomorrow has its bin on
   * the other side, while a replay of today's break puts every one of them back exactly where it
   * was (§71).
   */
  details: { x: number; y: number; w: number; h: number; kind: number }[];
}

const cache = new Map<string, Geometry>();

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** Exported so the 3D layer renders the same seeded room rather than seeding its own (§71). */
export function geometryFor(state: GameStateView): Geometry {
  const environmentId = state.environment.id;
  const background = state.environment.background;
  // The day is part of the seed, so the room's clutter moves tomorrow and not between two
  // frames of the same break. A per-frame salt would be the shiver §59 says a picture must not have.
  const salt = state.progress.level + state.progress.dayNumber * 31;
  const key = `${environmentId}:${background.kind}:${salt}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashOf(environmentId) + salt * 7919;
  const blocks: Geometry['blocks'] = [];
  if (background.kind === 'city' || background.kind === 'street' || background.kind === 'window') {
    const count = background.kind === 'window' ? 9 : 16;
    for (let i = 0; i < count; i++) {
      const x = ((fbm2(i * 1.7, seed, 3) + 1) / 2) * 0.98;
      const w = 0.03 + ((fbm2(i * 2.3, seed, 7) + 1) / 2) * 0.07;
      const h = 0.1 + ((fbm2(i * 0.9, seed, 11) + 1) / 2) * 0.34;
      const lights: number[] = [];
      const lit = Math.floor(((fbm2(i, seed, 13) + 1) / 2) * 8);
      for (let j = 0; j < lit; j++) lights.push((fbm2(j * 3.1, i * 2 + seed, 17) + 1) / 2);
      blocks.push({ x, y: 0.72 - h, w, h, lights });
    }
  }

  const ridge: number[] = [];
  if (background.kind === 'mountain') {
    for (let i = 0; i <= 64; i++) {
      ridge.push(0.6 + fbm2(i * 0.09, seed, 5) * 0.13 + Math.sin(i * 0.21 + seed) * 0.03);
    }
  }

  const bokeh: Geometry['bokeh'] = [];
  if (background.kind === 'window' || background.kind === 'street') {
    for (let i = 0; i < 26; i++) {
      bokeh.push({
        x: (fbm2(i * 1.1, seed, 23) + 1) / 2,
        y: 0.3 + ((fbm2(i * 2.7, seed, 29) + 1) / 2) * 0.5,
        r: 0.008 + ((fbm2(i, seed, 31) + 1) / 2) * 0.02,
        warm: fbm2(i * 4, seed, 37) > 0,
      });
    }
  }

  const steps: number[] = [];
  if (background.kind === 'stairwell') {
    // Eight treads climbing out of frame, each a little narrower than the last, which is what a
    // flight looks like from below the landing you are standing on.
    for (let i = 0; i < 8; i++) steps.push(0.62 - i * 0.062 - ((fbm2(i, seed, 59) + 1) / 2) * 0.02);
  }

  const details: Geometry['details'] = [];
  for (let i = 0; i < 5; i++) {
    details.push({
      x: 0.04 + ((fbm2(i * 1.9, seed, 61) + 1) / 2) * 0.92,
      y: 0.1 + ((fbm2(i * 2.4, seed, 67) + 1) / 2) * 0.5,
      w: 0.006 + ((fbm2(i * 3.2, seed, 71) + 1) / 2) * 0.1,
      h: 0.02 + ((fbm2(i * 4.1, seed, 73) + 1) / 2) * 0.16,
      kind: Math.floor(((fbm2(i * 5.3, seed, 79) + 1) / 2) * 4) % 4,
    });
  }

  const neon: Geometry['neon'] = [];
  if (background.kind === 'street') {
    for (let i = 0; i < 5; i++) {
      neon.push({
        x: 0.06 + i * 0.19 + ((fbm2(i, seed, 41) + 1) / 2) * 0.05,
        y: 0.28 + ((fbm2(i * 1.3, seed, 43) + 1) / 2) * 0.3,
        w: 0.012 + ((fbm2(i * 2, seed, 47) + 1) / 2) * 0.05,
        h: 0.008 + ((fbm2(i * 3, seed, 53) + 1) / 2) * 0.02,
        hue: i,
      });
    }
  }

  const built: Geometry = { blocks, ridge, bokeh, neon, steps, details };
  cache.set(key, built);
  return built;
}

export type FeatureTone = 'ink' | 'soft' | 'edge' | 'glow' | 'warm';

export function featureToneColours(
  silhouette: Rgb,
  horizon: Rgb,
): Record<FeatureTone, { rgb: Rgb; alpha: number }> {
  return {
    ink: { rgb: mixRgb(silhouette, [0, 0, 0], 0.45), alpha: 0.86 },
    soft: { rgb: mixRgb(silhouette, [0, 0, 0], 0.3), alpha: 0.6 },
    edge: { rgb: mixRgb(silhouette, horizon, 0.55), alpha: 0.45 },
    glow: { rgb: mixRgb(silhouette, [226, 232, 244], 0.62), alpha: 0.5 },
    warm: { rgb: mixRgb(silhouette, [255, 186, 104], 0.68), alpha: 0.55 },
  };
}

/** The room's wall: horizon and silhouette, half and half. */
export function interiorWall(horizon: Rgb, silhouette: Rgb): Rgb {
  return mixRgb(horizon, silhouette, 0.5);
}

/** Everything below the table edge: silhouette, a quarter of the way to black. */
export function interiorNosing(horizon: Rgb): Rgb {
  return mixRgb(horizon, [255, 255, 255], 0.12);
}

/** The seeded clutter's tone, by its kind (kind 2 is the lit window). */
export function detailTone(silhouette: Rgb, horizon: Rgb, kind: number): Rgb {
  return mixRgb(silhouette, horizon, kind === 2 ? 0.5 : 0.22);
}

/** One rectangle of furniture, in canvas fractions, in one of the five named tones. */
export interface FeatureBox {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: FeatureTone;
}

/**
 * The place's own furniture as rectangles.
 *
 * `drawFeatures` walks this list and fills; the 3D layer walks the same list and stands the same
 * furniture up. The rects and the order are the painter's own — this is that switch, transcribed.
 */
export function featureBoxes(
  feature: string,
  index: number,
  seeded: readonly { x: number }[],
): FeatureBox[] {
  /** Where this feature sits, so two places with the same id do not draw it in the same spot. */
  const at = (i: number, fallback: number): number => (seeded[i]?.x ?? fallback) % 0.7;
  const x = at(index, 0.12 + index * 0.18);
  const ground = 0.72;
  const boxes: FeatureBox[] = [];
  const box = (bx: number, by: number, bw: number, bh: number, tone: FeatureTone): void => {
    boxes.push({ x: bx, y: by, w: bw, h: bh, tone });
  };
  switch (feature) {
    case 'screens': {
      // A wall of monitors: the only light some rooms have, so this is the one feature that gives
      // brightness back rather than taking it away.
      box(x - 0.02, 0.38, 0.5, 0.16, 'soft');
      for (let i = 0; i < 4; i++) box(x + i * 0.12, 0.4, 0.1, 0.07, 'glow');
      for (let i = 0; i < 4; i++) box(x + i * 0.12, 0.47, 0.1, 0.008, 'edge');
      break;
    }
    case 'partitions': {
      // Cubicle doors, with the gap under them the deck's 「只能虚掩」 actually leaves.
      for (const door of [0.1, 0.42]) {
        box(door, 0.4, 0.17, ground - 0.42, 'ink');
        box(door, 0.4, 0.17, 0.006, 'edge');
      }
      break;
    }
    case 'extractor': {
      // A square of dead air high on the wall, slatted.
      box(0.72, 0.16, 0.11, 0.09, 'ink');
      for (let i = 0; i < 4; i++) box(0.72, 0.17 + i * 0.02, 0.11, 0.005, 'edge');
      break;
    }
    case 'roof': {
      // A roof line and its beam, from a tin shelter to a courtyard's eaves. The underside is the
      // lighter band: a flat black bar across the top reads as a censor bar, and an edge with a
      // highlight on it reads as something built.
      box(0, 0.05, 1, 0.05, 'ink');
      box(0, 0.1, 1, 0.008, 'edge');
      box(0, 0.108, 1, 0.004, 'soft');
      box(0.18, 0.112, 0.012, 0.3, 'ink');
      box(0.78, 0.112, 0.012, 0.3, 'ink');
      break;
    }
    case 'clothesline': {
      // Three short spans that sag, and three things on them.
      for (let i = 0; i < 3; i++) box(0.2 + i * 0.2, 0.22 + i * 0.012, 0.2, 0.004, 'edge');
      for (let i = 0; i < 3; i++) box(0.26 + i * 0.16, 0.24 + i * 0.01, 0.05, 0.07, 'ink');
      break;
    }
    case 'counter': {
      box(0.08, 0.56, 0.62, 0.03, 'ink');
      for (let i = 0; i < 4; i++) box(0.12 + i * 0.16, 0.59, 0.05, 0.12, 'soft');
      break;
    }
    case 'hearth': {
      // The fire is the room's key light, so it is the one place a feature sits *under* the
      // silhouette rather than below it.
      box(0.62, 0.5, 0.24, 0.2, 'ink');
      box(0.66, 0.56, 0.16, 0.13, 'warm');
      break;
    }
    case 'low-tables': {
      for (let i = 0; i < 3; i++) {
        box(0.1 + i * 0.26, 0.62, 0.16, 0.02, 'ink');
        box(0.12 + i * 0.26, 0.64, 0.12, 0.06, 'soft');
      }
      break;
    }
    case 'parasol': {
      // A canopy that steps down at the ends, so it is an octagon seen edge-on rather than a
      // horizontal bar, which is the difference between a parasol and a signpost.
      box(0.2, 0.28, 0.38, 0.016, 'ink');
      box(0.15, 0.296, 0.48, 0.014, 'ink');
      box(0.38, 0.31, 0.012, 0.29, 'ink');
      for (const table of [0.18, 0.56]) {
        box(table, 0.58, 0.14, 0.015, 'edge');
        box(table + 0.055, 0.595, 0.02, 0.11, 'soft');
      }
      break;
    }
    case 'elevator': {
      box(0.56, 0.34, 0.2, ground - 0.36, 'ink');
      box(0.655, 0.34, 0.01, ground - 0.36, 'edge');
      box(0.24, 0.42, 0.16, 0.1, 'soft');
      break;
    }
    case 'pumps': {
      for (const pump of [0.22, 0.52]) {
        box(pump, 0.44, 0.1, 0.26, 'ink');
        box(pump + 0.02, 0.47, 0.06, 0.05, 'glow');
      }
      box(0.32, 0.6, 0.2, 0.012, 'soft');
      break;
    }
    case 'bins': {
      box(0.06, 0.56, 0.12, 0.14, 'ink');
      box(0.2, 0.58, 0.1, 0.12, 'ink');
      box(0.44, 0.6, 0.4, 0.03, 'soft');
      for (let i = 0; i < 3; i++) box(0.46 + i * 0.12, 0.53, 0.08, 0.07, 'ink');
      break;
    }
    case 'glass-box': {
      // Two seams and a rail: the glass itself is the light it keeps back.
      box(0.16, 0.24, 0.008, ground - 0.26, 'edge');
      box(0.7, 0.24, 0.008, ground - 0.26, 'edge');
      box(0.16, 0.24, 0.548, 0.012, 'edge');
      box(0.16, 0.252, 0.548, ground - 0.272, 'soft');
      break;
    }
    case 'shutters': {
      for (let i = 0; i < 3; i++) {
        box(0.1 + i * 0.3, 0.36, 0.22, 0.18, 'ink');
        for (let s = 0; s < 4; s++) box(0.1 + i * 0.3, 0.38 + s * 0.04, 0.22, 0.004, 'edge');
      }
      break;
    }
    default:
      break;
  }
  return boxes;
}

/** One backdrop rectangle in canvas fractions, with the colour and alpha the painter would use. */
export interface StageGlowFrac {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rgb: Rgb;
  alpha: number;
}

export interface BackgroundStructure {
  sky: readonly { at: number; rgb: Rgb }[];
  wall: { rgb: Rgb; alpha: number } | null;
  table: { edgeY: number; ink: Rgb; nosingRgb: Rgb; nosingAlpha: number } | null;
  boxes: StageBoxFrac[];
  glows: StageGlowFrac[];
}

export function backgroundStructure(
  state: GameStateView,
  box: { x: number; y: number; width: number; height: number },
  cssWidth: number,
  cssHeight: number,
): BackgroundStructure {
  const light = state.world.light;
  const background = state.environment.background;
  const { skyTop, skyBottom, horizon, silhouette } = skyPalette(light, background);
  const sky = [
    { at: 0, rgb: skyTop },
    { at: 0.62, rgb: skyBottom },
    { at: 1, rgb: mixRgb(skyBottom, silhouette, 0.45) },
  ] as const;

  const interior =
    background.kind === 'room' ||
    background.kind === 'desk' ||
    background.kind === 'stairwell' ||
    background.kind === 'corner';
  if (!interior) return { sky, wall: null, table: null, boxes: [], glows: [] };

  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const geometry = geometryFor(state);
  const wallRgb = interiorWall(horizon, silhouette);
  const poolLight = state.style.scene.pool;
  const layout = state.stage.layout;
  const edgeY = layout.tableEdgeY;

  const boxes: StageBoxFrac[] = [];
  for (const detail of geometry.details) {
    const rgb = detailTone(silhouette, horizon, detail.kind);
    if (detail.kind === 0) {
      // A pipe along the wall.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: 0.34,
        h: Math.max(1, h * 0.006) / h,
        rgb,
        alpha: 0.3,
      });
    } else if (detail.kind === 1) {
      // A flex hanging from the ceiling with nothing on the end of it.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: Math.max(1, w * 0.004) / w,
        h: 0.12,
        rgb,
        alpha: 0.3,
      });
    } else if (detail.kind === 2) {
      // A window further off, lit by someone else's evening.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: Math.min(0.09, detail.w),
        h: Math.min(0.12, detail.h),
        rgb,
        alpha: 0.3,
      });
    } else {
      // A stain: a short, hard-edged mark, not a blob.
      boxes.push({
        x: detail.x,
        y: detail.y,
        w: Math.min(0.05, detail.w),
        h: Math.max(1, h * 0.004) / h,
        rgb,
        alpha: 0.3,
      });
    }
  }

  const wanted = background.features ?? [];
  const tones = featureToneColours(silhouette, horizon);
  wanted.forEach((feature, index) => {
    for (const part of featureBoxes(feature, index, geometry.details)) {
      const tone = tones[part.tone];
      // `Math.max(1, …)` is the painter's own floor, kept in pixels the way it wrote it.
      boxes.push({
        x: part.x,
        y: part.y,
        w: Math.max(1, part.w * w) / w,
        h: Math.max(1, part.h * h) / h,
        rgb: tone.rgb,
        alpha: tone.alpha,
      });
    }
  });

  // The key light, from the environment's own direction, and the pool the props sit in.
  const radians = (light.keyDirectionDeg * Math.PI) / 180;
  const keyReach = Math.max(w, h) * 0.45;
  const spot = {
    x: (layout.table.x + layout.ashtray.x + layout.pack.x) / 3,
    y: (layout.table.y + layout.ashtray.y + layout.pack.y) / 3,
  };
  const propReach = Math.max(80, box.width * w * 0.8);
  const glows: StageGlowFrac[] = [
    {
      x: 0.5 + Math.cos(radians) * 0.3,
      y: 0.2 + Math.sin(radians) * 0.25,
      rx: keyReach / w,
      ry: keyReach / h,
      rgb: mixRgb(wallRgb, poolLight, 0.5),
      alpha: 0.35 * (0.4 + light.ambient),
    },
    {
      x: box.x + spot.x * box.width,
      y: box.y + spot.y * box.height,
      rx: propReach / w,
      ry: propReach / h,
      rgb: mixRgb(silhouette, poolLight, 0.62),
      alpha: 0.26 + light.ambient * 0.34,
    },
  ];

  return {
    sky,
    wall: { rgb: wallRgb, alpha: 0.85 },
    table: {
      edgeY,
      ink: interiorEdgeInk(silhouette),
      nosingRgb: interiorNosing(horizon),
      nosingAlpha: 0.5,
    },
    boxes,
    glows,
  };
}

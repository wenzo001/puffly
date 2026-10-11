/**
 * The scene layer: state in, picture out. It reads `GameStateView` and never writes back, which is
 * the same contract the Canvas 2D renderer had — the seam the shell already depends on.
 *
 * Since the painted layer retired (2026-10-10) this surface is also the home of the formulas both
 * layers used to share: the plume's four numbers, the weather frames, the grain tile, the effect
 * bookkeeping and the rod's paper geometry. They kept their shapes and their numbers; only the
 * package moved.
 */
export {
  LIGHTER_SIZE,
  PROP_INK,
  ROD_THICKNESS_SHARE,
  PACK_SIZE,
  TRAY_FLATTEN,
  ASH_PILE,
  ashPileMetrics,
  ashtrayRadiusWorld,
  parsePropScale,
  toWorldSize,
  LID_THROW_DEG,
  FLAME_BASE_FRACTION,
  flameMetrics,
  CHAR_BIT,
  CHAR_GRAIN_SEED,
  DIP_SHARE,
  WAIST,
  paperGive,
  TRAY_FEEDBACK,
  TRAY_FEEDBACK_START,
  stepTrayFeedback,
  trayRock,
  type TrayFeedback,
} from './props';
export {
  roomBackdrop,
  SKY_COOL,
  SKY_WARM,
  interiorEdgeInk,
  vignetteAlpha,
  skyPalette,
  type RoomBackdrop,
  type StageBoxFrac,
} from './room';
export { parseColour } from './colour';
export {
  flameAlpha,
  frameRect,
  radialVignette,
  roundedRect,
  SCRIM,
  scrimRamp,
  softDisc,
  solidDisc,
  stadiumBar,
} from './sprite';
export { createGrainTile, grainAlpha } from './paint';
export { puffDiameterWorld } from './plume';
export {
  lipArt,
  COLUMN_BASE_HALF_WIDTH_PX,
  COLUMN_LENGTH_PX,
  BASE_HALF_WIDTH_PX,
  type LipArt,
  type Pt,
} from './lips';
export { layoutText, parseAtlas, type GlyphAtlas, type GlyphQuad, type TextLayout } from './text';
export { createPufflyRenderer, type RendererChoice } from './renderer';
export {
  AIM_KEYS,
  stageUnitToWorld,
  parseAim,
  rodBetween,
  rodEnds,
  toWorld,
  WORLD_HEIGHT,
  canvasToWorld,
  parseStageBox,
  rodBetweenInBox,
  stageWorldSize,
  type StageBox,
  type AimKey,
  type AimPoint,
} from './stage';

// The moved formulas — the painted layer's numbers, now the scene's own.
export {
  MAX_FRAME_MS,
  MAX_SMOKE_RADIUS_PX,
  IGNITION_IMPACT,
  ignitionEdgeAlpha,
  ignitionPunch,
  ignitionZoom,
  punchPivot,
  stepIgnition,
  DECK_SPLIT,
  EXHALE_LIFT,
  cartoonScale,
  NEAR_DEPTH,
  PUFF_SPREAD,
  PUFF_FLATTEN,
  puffHeat,
  puffTint,
  cherryHot,
  sparkStreak,
  puffSpread,
  puffAlpha,
  plumeIntakeOptions,
  pickUpRing,
  effectFor,
  type IntakeSettings,
} from './paint';
export { EffectList, type EffectKind, type SceneEffect } from './effects';
export {
  rainGeometry,
  RAIN_TINT,
  rainLines,
  dustMotes,
  type RainFrame,
  type RainLine,
  type Streak,
} from './weather';
export {
  FIELD_SCALE,
  MATERIAL_BURSTS,
  budgetFor,
  intakeBurst,
  plumeLayerFor,
  type IntakeOptions,
} from './intake';
export { ParticlePool, type Particle, type PlumeLayer } from './particles';
export { noise2, wander, fbm2 } from './noise';
export { createViewport, type Viewport } from './viewport';
export {
  backgroundStructure,
  geometryFor,
  type BackgroundStructure,
  type Geometry,
  type StageGlowFrac,
} from './backdrop';

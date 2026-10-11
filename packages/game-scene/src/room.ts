/**
 * The room, in the few numbers a backdrop needs.
 *
 * The 2D layer paints a sky by mixing two colours by the place's `warmth` and scaling everything by
 * its `ambient`; this reads the *same* two colours and the same mix helper, so switching venues moves
 * the 3D picture for the same reason it moves the painted one. What is deliberately missing here is
 * the room's `kind` — a stairwell or a forecourt is a drawn silhouette, and drawing nine of them is a
 * job for the scene's own art pass, not a colour.
 */
import { mixRgb, type Rgb } from '@puffly/shared';

/** Only what a backdrop reads: the state's own view is readonly, and a narrower parameter suits it. */
export interface RoomSource {
  readonly background: {
    readonly sky: readonly [Rgb, Rgb];
    readonly horizon: Rgb;
    readonly silhouette: Rgb;
  };
  readonly lighting: {
    readonly ambient: number;
    readonly warmth: number;
    readonly keyDirectionDeg: number;
  };
}
export interface StyleSource {
  readonly scene: { readonly pool: Rgb };
}

export interface RoomBackdrop {
  /** The sky behind the table, before `ambient` is applied. */
  readonly sky: Rgb;
  /** How exposed the room is, 0..1. */
  readonly ambient: number;
  /** The key light's direction in the scene plane, from the room's own angle. */
  readonly key: { readonly x: number; readonly y: number };
  /** The pool of light the table sits in. */
  readonly pool: Rgb;
  /** The two tones the interior's wall and its furniture are mixed from, exported palette included. */
  readonly horizon: Rgb;
  readonly silhouette: Rgb;
}

export function roomBackdrop(environment: RoomSource, style: StyleSource): RoomBackdrop {
  const light = environment.lighting;
  const radians = (light.keyDirectionDeg * Math.PI) / 180;
  const sky = skyPalette(light, environment.background);
  return {
    // The band that meets the table: a plane has one colour, and this is the one the eye reads as
    // "the room's light".
    sky: sky.skyBottom,
    ambient: light.ambient,
    key: { x: Math.cos(radians), y: Math.sin(radians) },
    pool: style.scene.pool,
    horizon: sky.horizon,
    silhouette: sky.silhouette,
  };
}

// ------------------------------------------------------------------------------------------------
// The sky's palette, the interior edge's ink, the vignette and the box type — moved here with the
// painted layer's retirement (2026-10-10). Same formulas, same numbers; the scene is their reader.

export const SKY_COOL: readonly [number, number, number] = [210, 224, 240];
export const SKY_WARM: readonly [number, number, number] = [255, 232, 200];

/** Everything below the table edge: silhouette, a quarter of the way to black. */
export function interiorEdgeInk(silhouette: Rgb): Rgb {
  return mixRgb(silhouette, [0, 0, 0], 0.25);
}

/** How dark the frame's edge goes: the room's own exposure, floored so a lit room still vignettes. */
export function vignetteAlpha(ambient: number): number {
  return 0.55 + (1 - ambient) * 0.3;
}

/**
 * The room's four painted colours — sky top, sky bottom, horizon, silhouette — from its own palette,
 * its exposure and the warm/cool cast.
 *
 * Exposure is `0.34 + ambient * 0.46` and every colour is nudged a tenth of the way to the cast.
 * A backdrop that mixed only the cast came out as a bright day sky in a night room.
 */
export function skyPalette(
  light: { ambient: number; warmth: number },
  background: { sky: readonly [Rgb, Rgb]; horizon: Rgb; silhouette: Rgb },
): { skyTop: Rgb; skyBottom: Rgb; horizon: Rgb; silhouette: Rgb } {
  const exposure = 0.34 + light.ambient * 0.46;
  const cool = mixRgb(SKY_COOL, SKY_WARM, light.warmth);
  return {
    skyTop: scale(background.sky[0], exposure, cool),
    skyBottom: scale(background.sky[1], exposure * 0.95, cool),
    horizon: scale(background.horizon, exposure, cool),
    silhouette: scale(background.silhouette, exposure * 0.9, cool),
  };
}

function scale(value: Rgb, exposure: number, cast: Rgb): Rgb {
  return mixRgb(
    [
      Math.min(255, Math.round(value[0] * exposure)),
      Math.min(255, Math.round(value[1] * exposure)),
      Math.min(255, Math.round(value[2] * exposure)),
    ],
    cast,
    0.1,
  );
}

/** One light pool of the backdrop, in canvas fractions; radii are fractions of each axis. */
export interface StageBoxFrac {
  x: number;
  y: number;
  w: number;
  h: number;
  rgb: Rgb;
  alpha: number;
}

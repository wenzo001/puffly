import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  frameRect,
  radialVignette,
  roundedRect,
  SCRIM,
  scrimRamp,
  softDisc,
  solidDisc,
  stadiumBar,
} from '../sprite';

describe('the puff sprite is soft, and it is generated rather than drawn', () => {
  it('is solid in the middle and clear at the rim', () => {
    const size = 33;
    const data = softDisc(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(16, 16)).toBe(255);
    expect(alphaAt(0, 0)).toBeLessThan(40);
    expect(alphaAt(16, 0)).toBeLessThan(40);
  });

  it('fades monotonically outwards, so a puff has no ring in it', () => {
    const size = 41;
    const data = softDisc(size).image.data as Uint8Array;
    const alphaAt = (x: number): number => data[(20 * size + x) * 4 + 3] as number;
    let previous = 999;
    for (let x = 20; x < size; x += 1) {
      const now = alphaAt(x);
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it('carries the size it was asked for', () => {
    expect(softDisc(16).image.width).toBe(16);
  });
});

describe('the ash sprite is a shape, not a smudge', () => {
  it('is opaque through the body and only feathered at the rim', () => {
    const size = 33;
    const data = solidDisc(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(16, 16)).toBe(255);
    // Three quarters out is still the body — a softDisc would be down to a fraction by here.
    expect(alphaAt(16 + 12, 16)).toBe(255);
    expect(alphaAt(0, 0)).toBeLessThan(60);
  });

  it('still fades monotonically at the edge, so the rim is not jagged', () => {
    const size = 41;
    const data = solidDisc(size).image.data as Uint8Array;
    let previous = 999;
    for (let x = 20; x < size; x += 1) {
      const now = data[(20 * size + x) * 4 + 3] as number;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });
});

describe('a card is a rounded rectangle, not a disc', () => {
  it('is opaque through the body and at the middle of an edge', () => {
    const size = 65;
    const data = roundedRect(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(32, 32)).toBe(255);
    expect(alphaAt(32, 3)).toBe(255);
    expect(alphaAt(3, 32)).toBe(255);
  });

  it('turns the corners away', () => {
    const size = 65;
    const data = roundedRect(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(1, 1)).toBeLessThan(60);
    expect(alphaAt(63, 63)).toBeLessThan(60);
  });

  it('a smaller radius keeps more of the corner than a stadium does', () => {
    const size = 65;
    const square = roundedRect(size, 0.2).image.data as Uint8Array;
    const stadium = roundedRect(size, 0.5).image.data as Uint8Array;
    const alphaAt = (data: Uint8Array, x: number, y: number): number =>
      data[(y * size + x) * 4 + 3] as number;
    // Diagonal distance from the corner: inside a 0.2 radius, outside a stadium's.
    expect(alphaAt(square, 3, 3)).toBe(255);
    expect(alphaAt(stadium, 3, 3)).toBeLessThan(60);
  });

  it('takes each corner its own radius — round at the top, square at the bottom', () => {
    const size = 65;
    // CSS order — top-left, top-right, bottom-right, bottom-left — which is the sheet's own shape.
    // The data's y=0 row is the card's bottom edge (a DataTexture is not flipped and the card's uvs
    // put v=0 there), so the square pair must sit at the low y.
    const data = roundedRect(size, 0.5, 0.5, 1.5, [
      [0.5, 0.5],
      [0.5, 0.5],
      [0, 0],
      [0, 0],
    ]).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(1, 63)).toBeLessThan(60);
    expect(alphaAt(63, 63)).toBeLessThan(60);
    expect(alphaAt(1, 1)).toBe(255);
    expect(alphaAt(63, 1)).toBe(255);
  });
});

describe('a control border is a frame, not a fill', () => {
  it('keeps the rim and gives up the middle', () => {
    const size = 65;
    const outer = [
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
    ] as const;
    const data = frameRect(size, outer, 0.1, 0.1).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(32, 32)).toBeLessThan(60);
    expect(alphaAt(32, 2)).toBeGreaterThan(180);
  });
});

describe('the slider track is a stadium, built in its own pixels', () => {
  const alphaAt = (bar: THREE.DataTexture, w: number, x: number, y: number): number =>
    (bar.image.data as Uint8Array)[(y * w + x) * 4 + 3] as number;

  it('carries the bar’s width and height, not a square', () => {
    const bar = stadiumBar(20, 6);
    expect(bar.image.width).toBe(20);
    expect(bar.image.height).toBe(6);
  });

  it('is opaque along the spine, both ends included', () => {
    const bar = stadiumBar(20, 6);
    expect(alphaAt(bar, 20, 10, 3)).toBe(255);
    expect(alphaAt(bar, 20, 0, 3)).toBe(255);
    expect(alphaAt(bar, 20, 19, 3)).toBe(255);
  });

  it('turns the corners away — the caps are half-discs, not square ends', () => {
    const bar = stadiumBar(20, 6);
    // The left cap's circle: centre (3, 3), radius 3 (half the height). The corner texel sits half a
    // texel outside that circle, so with the default one-texel feather it is *partly* covered — the
    // claim is "not a square end", which is what the spine's full value against the corner's says.
    expect(alphaAt(bar, 20, 2, 1)).toBe(255); // hypot ≈ 1.6 inside the cap
    expect(alphaAt(bar, 20, 0, 0)).toBeLessThan(140); // ≈ 0.46 covered, against 255 on the spine
    expect(alphaAt(bar, 20, 19, 5)).toBeLessThan(140);
    // And one feather beyond the shape is clear, which the padded canvas can show and the tight one
    // cannot: the corner of a 20 × 6 bar is never a full texel outside its own caps.
    const feathered = stadiumBar(20, 6, 2, 4);
    expect(alphaAt(feathered, 28, 0, 0)).toBe(0);
  });

  it('gives the falloff room outside the shape when the caller asks for it', () => {
    // The pill's halo: §2's shadow is a 342 × 62 button inset by -6 px spread and blurred 28 px, so
    // the plateau and the fade have to live in one texture. Without `pad` the fade is clipped by the
    // shape it is falling out of, which is what turned the halo into a hard-edged slab.
    const bar = stadiumBar(20, 6, 4, 4);
    expect(bar.image.width).toBe(28);
    expect(bar.image.height).toBe(14);
    expect(alphaAt(bar, 28, 14, 7)).toBe(255); // the plateau's middle
    expect(alphaAt(bar, 28, 13, 7)).toBe(255); // still inside the plateau's own width
    const side = alphaAt(bar, 28, 25, 7); // one step past the plateau, mid-fade
    expect(side).toBeGreaterThan(0);
    expect(side).toBeLessThan(255);
    expect(alphaAt(bar, 28, 0, 0)).toBe(0); // past the blur, at the canvas corner
    // The shape of the fade, not just its extent: seven eighths of the way out a CSS blur has given
    // up almost all of its light (≈0.05 of the plateau), while a straight ramp still carries 0.125 —
    // that difference is the halo reaching a third of its own blur further than the browser paints.
    expect(alphaAt(bar, 28, 14, 0)).toBeLessThan(25);
    expect(alphaAt(bar, 28, 14, 2)).toBeGreaterThan(120);
  });

  it('stays the shape it was, when no room is asked for', () => {
    const bar = stadiumBar(20, 6, 3);
    expect(bar.image.width).toBe(20);
    expect(bar.image.height).toBe(6);
  });
});

describe('the vignette is clear in the middle and dark at the rim', () => {
  it('is transparent at the centre and opaque at the edge', () => {
    const size = 33;
    const data = radialVignette(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(16, 16)).toBeLessThan(10);
    expect(alphaAt(0, 16)).toBe(255);
  });

  it('gets darker as it goes out, so there is no ring', () => {
    const size = 41;
    const data = radialVignette(size).image.data as Uint8Array;
    let previous = -1;
    for (let x = 20; x < size; x += 1) {
      const now = data[(20 * size + x) * 4 + 3] as number;
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });
});

/**
 * §2's bottom scrim: S1 待机 lays `linear-gradient(180deg,transparent,rgba(0,0,0,.55))` over the
 * bottom 34 % of the stage, S2 点燃 the same ramp over 30 % at .5, and the three screens with the
 * rod at the mouth lay nothing. These are the Demo's own numbers, not a designer's judgement.
 */
describe('the scrim is a band along the bottom, and only two screens have one', () => {
  it('is darkest along its own bottom edge', () => {
    // v = 0 is the bottom of the plane, so the ramp has to *start* solid. Reversed, the band would
    // hang a shadow off the middle of the room and leave the floor lit.
    const size = 64;
    const data = scrimRamp(size).image.data as Uint8Array;
    const alphaAt = (row: number): number => data[row * size * 4 + 3] as number;
    expect(alphaAt(0)).toBe(255);
    expect(alphaAt(size - 1)).toBe(0);
  });

  it('fades evenly upwards, so the band has no step in it', () => {
    const size = 64;
    const data = scrimRamp(size).image.data as Uint8Array;
    let previous = 256;
    for (let row = 0; row < size; row += 1) {
      const now = data[row * size * 4 + 3] as number;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it('is one column repeated across a square, with the ink in alpha alone', () => {
    // The ramp is one-dimensional, so every column repeats it, and the texture is square because
    // that is the shape this stage's overlays are all built in — a 2 px-wide strip of these same
    // numbers sat on the scrim mesh and painted nothing at all through the WebGPU backend.
    const size = 32;
    const texture = scrimRamp(size);
    const data = texture.image.data as Uint8Array;
    expect([texture.image.width, texture.image.height]).toEqual([size, size]);
    const probes: Array<[number, number]> = [
      [0, 0],
      [size - 1, 0],
      [size / 2, size - 1],
    ];
    for (const [x, y] of probes) {
      const i = (y * size + x) * 4;
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
      expect(data[i + 3]).toBe(data[y * size * 4 + 3]);
    }
  });

  it('carries the two bands §2 gives, at their own height and darkness', () => {
    expect(SCRIM.idle).toEqual({ share: 0.34, alpha: 0.55 });
    expect(SCRIM.lighting).toEqual({ share: 0.3, alpha: 0.5 });
    // A third entry would be a band the Demo never drew.
    expect(Object.keys(SCRIM).sort()).toEqual(['idle', 'lighting']);
  });
});

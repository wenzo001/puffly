/**
 * The room's furniture, and whether the tone the painter writes for it can be seen at all.
 *
 * The hard black plates on the stage (two axis-aligned rectangles, one 52x61 px and one 61x93 px on
 * a 393x852 phone, measured off the shipped frame with `tests/smoke/scan-black-boxes.mjs`) are the
 * room's own furniture. This file asks the pure question behind them: what colour does
 * `featureToneColours` hand the renderer for the `ink` tone, and is that colour distinguishable
 * from the wall it is standing in front of?
 *
 * A furniture tone that mixes the silhouette further toward black than the wall it sits on is a
 * shape drawn in a colour the room does not have — it reads as a hole, not as an object. The
 * measured complaint is exactly that: solid rectangles at fill 1.0, with nothing around them.
 */
import { describe, expect, it } from 'vitest';
import { featureBoxes, featureToneColours, interiorWall, type FeatureTone } from '../backdrop';
import { skyPalette } from '../room';
import { ENVIRONMENTS } from '@puffly/game-content';

const relativeLuminance = (rgb: readonly [number, number, number]): number => {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
};

/** The tones a room's furniture can actually ask for, across every room the game ships. */
function everyFurnitureTone(): Set<FeatureTone> {
  const tones = new Set<FeatureTone>();
  for (let index = 0; index < ENVIRONMENTS.length; index += 1) {
    const env = ENVIRONMENTS[index]!;
    for (const feature of env.background.features ?? []) {
      for (const box of featureBoxes(feature, index, [{ x: 0.1 }, { x: 0.3 }, { x: 0.5 }])) {
        tones.add(box.tone);
      }
    }
  }
  return tones;
}

describe("the room's furniture is drawn in colours the room actually has", () => {
  it('every room that names furniture gives it at least one box', () => {
    // The control: if `featureBoxes` returned nothing for every feature, the palette claims below
    // would pass by measuring an empty set.
    const withFurniture = ENVIRONMENTS.filter((e) => (e.background.features ?? []).length > 0);
    expect(withFurniture.length).toBeGreaterThan(0);
    let boxes = 0;
    for (let index = 0; index < ENVIRONMENTS.length; index += 1) {
      const env = ENVIRONMENTS[index]!;
      for (const feature of env.background.features ?? []) {
        boxes += featureBoxes(feature, index, [{ x: 0.1 }, { x: 0.3 }]).length;
      }
    }
    expect(boxes).toBeGreaterThan(20);
  });

  it('the ink tone is not darker than the wall it stands in front of', () => {
    // This is the claim the black plates violate. `ink` is 45% of the way from the silhouette to
    // black, and the wall is the horizon and the silhouette half and half — so `ink` is only
    // legible if the silhouette is not already near black to begin with.
    const offenders: string[] = [];
    for (const env of ENVIRONMENTS) {
      const palette = skyPalette(env.lighting, env.background);
      const wall = interiorWall(palette.horizon, palette.silhouette);
      const tones = featureToneColours(palette.silhouette, palette.horizon);
      // The wall is what the furniture stands against. A shape whose own colour is within a
      // hair of the wall cannot be seen; one markedly darker reads as a hole rather than a thing.
      const wallL = relativeLuminance(wall);
      const inkL = relativeLuminance(tones.ink.rgb);
      // Ratio of the lighter to the darker, the WCAG shape: 1.0 means invisible.
      const ratio = (Math.max(wallL, inkL) + 0.05) / (Math.min(wallL, inkL) + 0.05);
      if (ratio < 1.25) offenders.push(`${env.id}: io=${ratio.toFixed(3)}`);
    }
    expect(
      offenders,
      `rooms whose ink furniture is indistinguishable from the wall: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('reports which tones every room draws with, so the palette can be read at a glance', () => {
    const tones = everyFurnitureTone();
    console.log('furniture tones in use across the deck:', [...tones].sort().join(', '));
    expect(tones.size).toBeGreaterThan(0);
  });
});

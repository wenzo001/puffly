/**
 * The room's props have to be lit by the same exposure the room was painted with.
 *
 * Two faults, both measured off the shipped build on 2026-10-12 with
 * `tests/smoke/scan-black-boxes.mjs`, and neither of them visible to any test in this repository at
 * the time:
 *
 *   fault 1 — the lighter and the pack were the only two axis-aligned solid rectangles in the frame,
 *     both at fill 1.0. They measured `rgb(2,2,1)` and `rgb(4,3,3)` against a wall of `rgb(44..52)`,
 *     i.e. 13–29× darker than the surface they stand on. Not "dark props": the props' *own* ink
 *     (`#191612`) is a near-black by design, but the room's key light was the room's sky, and a
 *     night room's sky is linear ≈0.026 — so `MeshStandardMaterial` multiplied every prop down to
 *     nothing. All 21 rooms did it.
 *   fault 2 — `detailTone` at kind 2 returned the wall's own colour exactly, in all 21 rooms at
 *     ratio 1.000: the one wall mark meant to be the brightest thing on the wall could never be
 *     seen. The other three kinds sat at 1.04–1.29.
 *
 * What is pinned here is the *rule*, not the numbers: every room in `ENVIRONMENTS`, no hand-tuned
 * per-room constant, and each claim carries a positive control so it cannot pass by measuring
 * nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  detailTone,
  featureToneColours,
  interiorWall,
  keyLightInk,
  luminanceRatio,
  DETAIL_MIN_RATIO,
  FILL_SHARE,
  KEY_INTENSITY,
} from '../backdrop';
import { skyPalette } from '../room';
import { ENVIRONMENTS } from '@puffly/game-content';

/** The props the room stands up, as the design's own ink (`props.ts:PROP_INK`). */
const PACK_INK = [0x19, 0x16, 0x12] as const;
const LIGHTER_CAP_INK = [0x2a, 0x26, 0x22] as const;
const PACK_EDGE_INK = [0x25, 0x22, 0x1f] as const;

const srgbToLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};
const luminance = (rgb: readonly [number, number, number]): number =>
  0.2126 * srgbToLinear(rgb[0]) +
  0.7152 * srgbToLinear(rgb[1]) +
  0.0722 * srgbToLinear(rgb[2]);

/**
 * What `MeshStandardMaterial` does with an ink under one light, which is the whole arithmetic this
 * file is about: the light's colour multiplies the ink per channel, and the two intensity terms add.
 */
function litInk(
  ink: readonly [number, number, number],
  light: { rgb: readonly [number, number, number]; intensity: number },
): [number, number, number] {
  const key = light.rgb.map(srgbToLinear);
  return ink.map((channel, i) =>
    linearToSrgb(srgbToLinear(channel) * (FILL_SHARE * 0.9 + light.intensity * (key[i] ?? 0))),
  ) as [number, number, number];
}

/** Every room's palette, as `backgroundStructure` would see it. */
function everyRoomPalette(): {
  id: string;
  wall: readonly [number, number, number];
  silhouette: readonly [number, number, number];
  horizon: readonly [number, number, number];
  skyBottom: readonly [number, number, number];
}[] {
  return ENVIRONMENTS.map((env) => {
    const p = skyPalette(env.lighting, env.background);
    return {
      id: env.id,
      wall: interiorWall(p.horizon, p.silhouette),
      silhouette: p.silhouette,
      horizon: p.horizon,
      skyBottom: p.skyBottom,
    };
  });
}

describe("the room's props are lit by the room's own exposure", () => {
  it('no longer lets the room’s darkness decide how dark its props are', () => {
    // The specific defect: the key light *was* the room's sky, so the room's own luminance multiplied
    // every prop. The repair is that the delivered light no longer varies with the room's darkness,
    // so a night room and a daylight room light the same ink the same way.
    //
    // This is a claim about the *light*, deliberately not about the pixel — see the next test for
    // why the pixel cannot be promised from here.
    // The invariant is *luminance*, not per-channel energy: normalising holds the room's cast (its
    // hue), so a warm room's green channel and a cool room's green channel legitimately differ. What
    // must not survive is the room's *darkness*. The 1.15 bound is not slack — the key's channels go
    // out as 8-bit sRGB, so the round trip quantises the last few percent.
    const delivered = everyRoomPalette().map((room) => {
      const light = keyLightInk(room.skyBottom);
      return luminance(light.rgb as unknown as readonly [number, number, number]) * light.intensity;
    });
    const spread = Math.max(...delivered) / Math.min(...delivered);
    expect(spread).toBeLessThan(1.15);

    // ...and the old light did vary with the room, by a wide margin, which is the defect.
    const oldDelivered = everyRoomPalette().map(
      (room) => luminance(room.skyBottom) * (0.6 + 0.42 * 1.6),
    );
    const oldSpread = Math.max(...oldDelivered) / Math.min(...oldDelivered);
    expect(oldSpread).toBeGreaterThan(3);
  });

  it('is not enough on its own: the pack’s own ink still renders under the scanner floor', () => {
    // The honest bound on this change, and the reason it is not the fix for the plates. The pack's
    // albedo `#191612` is linear 0.0097, so even unit-luminance light returns it below the 26 the
    // scanner calls dark. Measured on the served build: `rgb(2,2,1)` before, `rgb(3,2,2)` after.
    //
    // Pinned so nobody reads the green above as "the plates are gone". Lifting `PROP_INK` — which is
    // the design's own ink and is out of this fix's scope — is what would move this number.
    const quiet = everyRoomPalette().find((room) => room.id === 'quiet-room');
    if (quiet === undefined) throw new Error('quiet-room is not in ENVIRONMENTS');
    const pack = litInk(PACK_INK, keyLightInk(quiet.skyBottom));
    expect(Math.max(...pack)).toBeLessThan(26);
    // It did move, which is the part that is real.
    const before = litInk(PACK_INK, { rgb: quiet.skyBottom, intensity: 0.6 + 0.42 * 1.6 });
    expect(Math.max(...pack)).toBeGreaterThan(Math.max(...before));
  });

  it('keeps the light carrying the room’s own cast instead of a flat white', () => {
    // Normalising must not flatten the rooms into one another: the whole point of the old line's
    // *colour* was that a warm room lights its props warm. `pub-corner` and `station-booth` are the
    // two extremes — one warm and one cool — and their key inks must differ.
    const warm = keyLightInk(skyPalette(
      ENVIRONMENTS.find((e) => e.id === 'pub-corner')!.lighting,
      ENVIRONMENTS.find((e) => e.id === 'pub-corner')!.background,
    ).skyBottom);
    const cool = keyLightInk(skyPalette(
      ENVIRONMENTS.find((e) => e.id === 'station-booth')!.lighting,
      ENVIRONMENTS.find((e) => e.id === 'station-booth')!.background,
    ).skyBottom);
    expect(warm.rgb[0] - warm.rgb[2]).toBeGreaterThan(10);
    expect(cool.rgb[2] - cool.rgb[0]).toBeGreaterThan(10);
  });

  it('preserves the design’s own tonal order: pack darkest, cap lightest', () => {
    // The fix may not buy visibility by re-ordering the props; the brief's palette has the pack
    // under the lighter and the edge between them, and that has to survive every room.
    const offenders: string[] = [];
    for (const room of everyRoomPalette()) {
      const light = keyLightInk(room.skyBottom);
      const pack = luminance(litInk(PACK_INK, light));
      const edge = luminance(litInk(PACK_EDGE_INK, light));
      const cap = luminance(litInk(LIGHTER_CAP_INK, light));
      if (!(pack < edge && edge < cap)) {
        offenders.push(
          `${room.id}: pack=${pack.toFixed(4)} edge=${edge.toFixed(4)} cap=${cap.toFixed(4)}`,
        );
      }
    }
    expect(
      offenders,
      `rooms where the props' tonal order broke: ${offenders.join('; ')}`,
    ).toEqual([]);
  });

  it('reports the light as dark as the sky would have been, so the rule cannot be silently undone', () => {
    // The positive control. The broken build handed the sky over as it stood; this is that light,
    // reconstructed, and the assertion is that it *does* crush the pack — otherwise every claim
    // above would pass on the broken build too and prove nothing.
    const broken = { rgb: [46, 44, 43] as const, intensity: 0.6 + 0.42 * 1.6 };
    const crushed = litInk(PACK_INK, broken);
    expect(Math.max(...crushed)).toBeLessThan(12);

    // ...and the repair is what moves it: the same ink under the normalised light is legible.
    const repaired = keyLightInk([46, 44, 43]);
    const lifted = litInk(PACK_INK, repaired);
    expect(Math.max(...lifted)).toBeGreaterThanOrEqual(12);
    expect(KEY_INTENSITY).toBeGreaterThan(0);
    expect(FILL_SHARE).toBeGreaterThan(0);
  });

  it('names the rooms in the message when the light is the one the build shipped', () => {
    // The house style: a failing palette has to say *which* room, because the fix is per-room
    // invisible and the id is the only handle a reader has.
    const offenders = everyRoomPalette()
      .filter((room) => {
        const broken = { rgb: room.skyBottom, intensity: 0.6 + 0.42 * 1.6 };
        return Math.max(...litInk(PACK_INK, broken)) < 12;
      })
      .map((room) => room.id);
    // 18 of the 21, reconstructing the old light from each room's own sky. It is not all 21 because
    // the three brightest rooms (`balcony`, `mountain`, `cafe-terrace`) delivered just enough energy
    // to clear the floor — which is exactly why the fix is a rule and not a blacklist: the three
    // that "passed" this reconstruction still measured 13–19× against their own walls on the real
    // frame, because the wall they stand on is bright too.
    expect(offenders.length).toBe(18);
    const message = `rooms whose pack was crushed to black by the sky-coloured key: ${offenders.join(', ')}`;
    expect(message).toContain('quiet-room');
    expect(message).toContain('late-night-desk');
    // ...and the three that this reconstruction alone would have let through, named so the 18 is not
    // read as "three rooms were fine".
    expect(offenders).not.toContain('balcony');
    expect(offenders).not.toContain('mountain');
    expect(offenders).not.toContain('cafe-terrace');
  });
});

describe("the room's wall marks never land on the wall's own luminance", () => {
  it('holds every detail kind off the wall in all 21 rooms', () => {
    const offenders: string[] = [];
    for (const room of everyRoomPalette()) {
      for (const kind of [0, 1, 2, 3]) {
        const tone = detailTone(room.silhouette, room.horizon, kind);
        const ratio = luminanceRatio(room.wall, tone);
        if (ratio < DETAIL_MIN_RATIO) {
          offenders.push(`${room.id} kind ${kind}: ratio ${ratio.toFixed(3)}`);
        }
      }
    }
    expect(
      offenders,
      `wall marks indistinguishable from the wall they stand on: ${offenders.join('; ')}`,
    ).toEqual([]);
  });

  it('keeps the lit window brighter than the wall and the rest darker', () => {
    // A floor alone could be met by pushing every mark the same way; the lit window is the one that
    // gives light back (§2), so it is the one that must sit *above* the wall.
    const offenders: string[] = [];
    for (const room of everyRoomPalette()) {
      const lit = luminance(detailTone(room.silhouette, room.horizon, 2));
      const wall = luminance(room.wall);
      if (!(lit > wall)) offenders.push(`${room.id}: lit window ${lit.toFixed(4)} <= wall ${wall.toFixed(4)}`);
      for (const kind of [0, 1, 3]) {
        const dark = luminance(detailTone(room.silhouette, room.horizon, kind));
        if (!(dark < wall)) {
          offenders.push(`${room.id} kind ${kind}: ${dark.toFixed(4)} >= wall ${wall.toFixed(4)}`);
        }
      }
    }
    expect(offenders, `wall marks on the wrong side of the wall: ${offenders.join('; ')}`).toEqual([]);
  });

  it('reports the room ids when a palette makes its own wall marks invisible', () => {
    // The positive control. `detailTone`'s old 0.5 mix is reconstructed here against the wall it was
    // mixed from, and it must be reported — in every room — or the guard above is measuring nothing.
    const offenders: string[] = [];
    for (const room of everyRoomPalette()) {
      const old = mixHalf(room.horizon, room.silhouette);
      const ratio = luminanceRatio(room.wall, old);
      if (ratio < DETAIL_MIN_RATIO) offenders.push(`${room.id}: old kind 2 at ratio ${ratio.toFixed(3)}`);
    }
    expect(offenders.length).toBe(ENVIRONMENTS.length);
    expect(offenders.join(', ')).toContain('quiet-room');
  });

  it('holds the furniture’s ink tone off the wall in all 21 rooms', () => {
    // The third tone in the same family, and the one that survived the first sweep: `ink` mixes the
    // silhouette 45 % toward black, which is a real push but not enough of one where the silhouette
    // is already near-black. `night-city`, `neon-street` and `late-night-desk` measured 1.19–1.25.
    const offenders: string[] = [];
    for (const room of everyRoomPalette()) {
      const ink = featureToneColours(room.silhouette, room.horizon).ink.rgb;
      const ratio = luminanceRatio(room.wall, ink);
      if (ratio < DETAIL_MIN_RATIO) {
        offenders.push(`${room.id}: ink at ratio ${ratio.toFixed(3)}`);
      }
    }
    expect(
      offenders,
      `rooms whose named furniture is drawn in the wall's own colour: ${offenders.join('; ')}`,
    ).toEqual([]);
  });

  it('reports the three rooms the old ink tone was invisible in', () => {
    // The positive control for the line above: the shipped 0.45 mix, reconstructed, must be reported
    // in exactly the rooms the frame showed — otherwise nothing was measured.
    const offenders = everyRoomPalette()
      .filter((room) => {
        const old = mixToward(room.silhouette, [0, 0, 0], 0.45);
        return luminanceRatio(room.wall, old) < DETAIL_MIN_RATIO;
      })
      .map((room) => room.id);
    expect(offenders).toEqual(['night-city', 'neon-street', 'late-night-desk']);
  });
});

/** A plain mix, transcribed, so the old behaviour can be reconstructed as a control. */
function mixToward(
  from: readonly [number, number, number],
  toward: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [0, 1, 2].map((i) =>
    Math.round((from[i] ?? 0) + ((toward[i] ?? 0) - (from[i] ?? 0)) * t),
  ) as [number, number, number];
}

/** `detailTone`'s old kind-2 arm, transcribed: half way from the silhouette to the horizon. */
function mixHalf(
  horizon: readonly [number, number, number],
  silhouette: readonly [number, number, number],
): [number, number, number] {
  return mixToward(silhouette, horizon, 0.5);
}

/**
 * A soft disc, generated in code.
 *
 * The 2D layer's puffs are radial-gradient sprites it bakes at startup; the 3D layer needs the same
 * softness without reaching for a canvas (the whole point of this rewrite is that the interface
 * layer stops being canvas), so the alpha falloff is written straight into a `DataTexture`. One
 * texture, one shape: a puff is a soft disc whatever size it is drawn at.
 */
import * as THREE from 'three';

/**
 * `power` shapes the falloff: a higher power keeps the middle solid for longer and makes the rim
 * thinner, which is what stops a big puff from reading as a ring.
 */
export function softDisc(size = 64, power = 2.2): THREE.DataTexture {
  return discTexture(size, power);
}

/**
 * The plume's own sprite: the same disc, at the falloff a *breath* is drawn with.
 *
 * A puff's centre alpha is authored low on purpose (§15: emission is per particle, and a single
 * opaque disc shows its own edge), so the radius that survives a given visibility threshold is a
 * small fraction of the sprite: at the pool's own median centre alpha of 0.018 and a 0.05 threshold,
 * `softDisc`'s `(1-r)^2.2` puts that edge at 11% of the drawn radius. Neighbouring puffs whose
 * *full* discs overlap therefore still show dark air between their visible cores, which is the
 * "string of beads" the eye reports — and `plume-continuity` cannot see it, because that guard
 * measures the full drawn radius rather than the visible one.
 *
 * `PLUME_DISC_POWER` (1.45) keeps the same centre (the texture is 1.0 at r=0 whatever the power) and
 * the same rim (0 at r=1), and only widens the *shoulder*, so more of each disc is above threshold.
 * The centre brightness is unchanged, which is what keeps this off the peak-to-room contrast floor;
 * the column simply stops breaking into knots. `softDisc` keeps its 2.2 for the sparks, the ash
 * halo, the trays' pools and the graveyard: those are shapes with edges, not plumes.
 *
 * Measured, 2026-10-13 (phone portrait, mid-break, `tests/smoke/probe-smoke-pixels.mjs` on the
 * smoke mesh alone): the visible coverage of the column goes from 79.2% of its rows at ΔL≥8 to
 * 100%, with the longest unlit run falling from 3 bins to 0. `PLUME_DISC_POWER` is read by
 * `softPlumeDisc`, which is the only sprite the smoke instanced mesh is built with.
 */
export const PLUME_DISC_POWER = 1.45;

/** The sprite the smoke cloud is drawn with — see `PLUME_DISC_POWER` for the number and its reason. */
export function softPlumeDisc(size = 64): THREE.DataTexture {
  return discTexture(size, PLUME_DISC_POWER);
}

/** The one place a radial alpha ramp is written; `softDisc` and `softPlumeDisc` differ only here. */
function discTexture(size: number, power: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.pow(1 - r, power);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * A solid disc, feathered only at the very rim.
 *
 * A grain of ash is a shape, not a puff: the painted layer draws it with `ctx.ellipse` — a hard edge
 * — and a `softDisc` would turn every flake into a smudge. The feather is one texel-ish band so the
 * edge is not jagged at the sizes the stage draws.
 */
export function solidDisc(size = 32, feather = 0.16): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.hypot(dx, dy);
      const t = r <= 1 - feather ? 1 : Math.max(0, (1 - r) / feather);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.min(1, t) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * A rounded rectangle: opaque inside, feathered at the edge, corners turned by `radiusX`/`radiusY`
 * (each as a fraction of that axis's half-size, so a wide card's corners stay round). Both at 0.5
 * is a stadium — the pill's shape, since its CSS asks for a 30px radius on a 58px box and the
 * browser clamps it to half the height — and both at 1 is a circle.
 */
export function roundedRect(
  size = 128,
  radiusX = 0.5,
  radiusY = radiusX,
  feather = 1.5,
  /**
   * Per-corner radii in CSS order — top-left, top-right, bottom-right, bottom-left — each `[rx, ry]`
   * normalised like the scalars above. Omitted means all four corners take `radiusX/radiusY`, which
   * is what the stadium cards and the dials want. The sheet is why this exists: 22 px on its top two
   * corners and square at the bottom, and a uniformly rounded bottom would show two corners the
   * design does not have.
   */
  corners?: ReadonlyArray<readonly [number, number]>,
): THREE.DataTexture {
  const radii = corners ?? [
    [radiusX, radiusY],
    [radiusX, radiusY],
    [radiusX, radiusY],
    [radiusX, radiusY],
  ];
  return maskTexture(size, size, roundedMask(size, 1, 1, radii, feather));
}

/**
 * The same shape as a ring — the outer rounded rectangle minus an inner one inset by the border
 * width — which is what a control's 1px border is. CSS's own rule for the inner corner comes along:
 * its radius is the outer radius minus the border. Both edges keep their own feather, so a hairline
 * stays a hairline instead of turning into a soft band.
 */
export function frameRect(
  size: number,
  outer: ReadonlyArray<readonly [number, number]>,
  insetX: number,
  insetY: number,
  feather = 1.5,
): THREE.DataTexture {
  const inner = outer.map(
    ([rx, ry]) => [Math.max(0, rx - insetX), Math.max(0, ry - insetY)] as [number, number],
  );
  const whole = roundedMask(size, 1, 1, outer, feather);
  const hole = roundedMask(
    size,
    Math.max(1e-6, 1 - insetX),
    Math.max(1e-6, 1 - insetY),
    inner,
    feather,
  );
  const coverage = new Float32Array(size * size);
  for (let i = 0; i < coverage.length; i += 1) {
    coverage[i] = Math.max(0, (whole[i] ?? 0) - (hole[i] ?? 0));
  }
  return maskTexture(size, size, coverage);
}

/**
 * The flame gradient's alpha profile, hue-free: 0.7 on the wick, 0.85 at the belly, gone by the
 * tip — the vertical slice the scene multiplies its vertex colours by (the painted layer's three
 * `addColorStop` opacities, in one place).
 */
export function flameAlpha(): THREE.DataTexture {
  const width = 2;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    const alpha = t <= 0.45 ? 0.7 + (0.85 - 0.7) * (t / 0.45) : 0.85 * (1 - (t - 0.45) / 0.55);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Rounded-rectangle coverage per texel, 0..1 — the one copy of the corner distance math. */
function roundedMask(
  size: number,
  spanX: number,
  spanY: number,
  radii: ReadonlyArray<readonly [number, number]>,
  feather: number,
): Float32Array {
  const mask = new Float32Array(size * size);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.abs((x - centre) / centre);
      const dy = Math.abs((y - centre) / centre);
      // The data's y=0 row is the card's bottom edge on screen (a DataTexture is not flipped and
      // the card's uvs put v=0 at its lower edge), so the quadrants map onto CSS corners like this.
      const corner =
        y < centre
          ? x < centre
            ? (radii[3] ?? radii[0])
            : (radii[2] ?? radii[0])
          : x < centre
            ? (radii[0] ?? radii[1])
            : (radii[1] ?? radii[0]);
      const [cornerX, cornerY] = corner ?? [0.5, 0.5];
      // The edge bounds and the radius that turns them — per axis, so a card on a wide quad keeps
      // round corners instead of stretched ones. A radius never exceeds its half-span, the way CSS
      // clamps.
      const rx = Math.min(cornerX, spanX);
      const ry = Math.min(cornerY, spanY);
      const edgeX = Math.max(1e-6, spanX - rx);
      const edgeY = Math.max(1e-6, spanY - ry);
      const cx = Math.max(0, dx - edgeX) / Math.max(1e-6, rx);
      const cy = Math.max(0, dy - edgeY) / Math.max(1e-6, ry);
      const distance = Math.hypot(cx, cy);
      // The feather is a width in texels and so wants a single number; the smaller radius is the one
      // whose arc the softness would otherwise smear the most.
      const soft = Math.max(1e-6, Math.min(rx, ry));
      mask[y * size + x] =
        distance <= 1
          ? 1
          : Math.max(
              0,
              Math.min(1, (1 + feather / (centre * soft) - distance) * ((centre * soft) / feather)),
            );
    }
  }
  return mask;
}

function maskTexture(
  width: number,
  height: number,
  coverage: ArrayLike<number>,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const base = i * 4;
    data[base] = 255;
    data[base + 1] = 255;
    data[base + 2] = 255;
    data[base + 3] = Math.round(Math.min(1, Math.max(0, coverage[i] ?? 0)) * 255);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * A horizontal stadium — a rectangle with half-disc caps — as a mask, built in its own pixel space.
 *
 * Unlike the other helpers this one is baked at the size it will be drawn at on purpose: a stretched
 * texture would oval the caps, and the shapes this mirrors are DOM boxes whose `border-radius` is
 * the browser's own clamp (a 3 px bar with `border-radius: 3px`, the §2 灰堆's `11px` on 22 px, the
 * 31 px on the 62 px button).
 *
 * `feather` is the width of the fade *outside* the shape, in texture pixels, so one texel of
 * softness stays one CSS pixel of it whatever the box's size — that is how `filter: blur(3px)` and
 * a `box-shadow` blur radius get painted. `pad` is the room the canvas leaves for that fade: with
 * `pad` 0 the shape fills its own texture and anything past the boundary is clipped, which is right
 * for a bar whose softness is inside its box and wrong for a halo.
 */
export function stadiumBar(width: number, height: number, feather = 1, pad = 0): THREE.DataTexture {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const p = Math.max(0, Math.round(pad));
  const cw = w + p * 2;
  const ch = h + p * 2;
  const radius = Math.min(h / 2, w / 2);
  const coverage = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      // The stadium itself stays `w × h`; `pad` is the room drawn around it, so a falloff that
      // leaves the shape can live inside the same texture instead of being clipped by it.
      const across = Math.max(0, Math.abs(x + 0.5 - cw / 2) - (w / 2 - radius));
      const along = Math.abs(y + 0.5 - ch / 2);
      const distance = Math.hypot(across, along) - radius;
      // Outside the shape the coverage follows the blur's own curve. A CSS blur is a Gaussian, and
      // the two mistakes this replaces were both in this line: negating `distance` (every point
      // past the boundary came out 0, so the feather painted nothing and §2's `filter: blur(3px)`
      // landed as a hard edge), then a straight ramp, which keeps a quarter of the light all the way
      // to the end of the blur and reads as a halo that reaches too far. Normalised so the curve
      // still ends at exactly zero on the canvas edge.
      const t = Math.min(1, distance / Math.max(0.5, feather));
      const curve = Math.exp(-3.2 * t * t) - Math.exp(-3.2);
      coverage[y * cw + x] = distance <= 0 ? 1 : Math.max(0, curve / (1 - Math.exp(-3.2)));
    }
  }
  return maskTexture(cw, ch, coverage);
}

/**
 * The room's vignette, as a texture: clear in the middle, opaque at the rim.
 *
 * The painted layer draws a radial gradient from the canvas centre out to `max(w, h) * 0.78`; the 3D
 * layer lays the same shape over the backdrop as a plane. `inner` is the fraction of the radius that
 * stays clear, `outer` where it is fully dark — one stop each, like the two colour stops it replaced.
 */
export function radialVignette(size = 128, inner = 0.25, outer = 1): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.hypot(dx, dy);
      const t = Math.max(0, Math.min(1, (r - inner) / Math.max(1e-6, outer - inner)));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(t * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * §2's bottom scrim, in the Demo's own numbers: the height of the band as a share of the stage, and
 * how dark its floor is. Two screens have one (待机 at 34 % / .55, 点燃 at 30 % / .5); the three
 * screens with the rod in the mouth have none, so a caller has to be able to say "no band".
 */
export const SCRIM = {
  idle: { share: 0.34, alpha: 0.55 },
  lighting: { share: 0.3, alpha: 0.5 },
} as const;

/**
 * The ramp `linear-gradient(180deg,transparent,rgba(0,0,0,1))` written straight into a
 * `DataTexture`: clear at the top of the band, opaque along its bottom edge, and the caller sets the
 * material's opacity to the screen's own alpha. Row 0 is v = 0, which is the *bottom* of the plane,
 * so the ramp begins at its darkest end.
 *
 * White ink with the darkness carried in alpha, square, and linear-filtered — the shape every other
 * overlay on this stage already has, and not a stylistic choice: a 2×64 strip of these same numbers
 * sat on this mesh and painted nothing at all through the WebGPU backend, while the square one
 * darkens it by the full measured amount. The ink itself is the material's colour, set after
 * construction the way `radialVignette` does it.
 */
export function scrimRamp(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const alpha = Math.round((1 - y / (size - 1)) * 255);
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

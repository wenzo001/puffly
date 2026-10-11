/**
 * The plume, driven by the core rather than by a recipe copied out of the 2D renderer.
 *
 * The pool itself is the Canvas 2D layer's own (`ParticlePool`): its physics, its noise field and
 * its lifetimes are exactly what the picture has been built on, and P5 moves it here for good. What
 * is *not* copied is the recipe — how many puffs a second and how they look arrives in the state
 * view (`smoke.emissionRate`, `smoke.density`, `smoke.turbulence`, `smoke.riseSpeed`,
 * `smoke.dispersion`, `smoke.tint`), because a second copy of a recipe is how this repository ended
 * up with a browser layer that reported a working game as eight broken ones.
 */
import { MAX_SMOKE_RADIUS_PX, PUFF_SPREAD } from './paint';

/**
 * How hard still air drags a puff back to rest, per second. Not a number invented here: it is the
 * renderer's own `SMOKE_DRAG` (6), and the ash's separate 0.9 is why the two do not share one.
 */
/**
 * How wide to draw one puff, in world units.
 *
 * The 2D layer draws a puff at `radius * scale * size * depthScale * PUFF_SPREAD` pixels, clamped to
 * `MAX_SMOKE_RADIUS_PX`; a disc of side 2r in world units is the same shape, so the formula travels
 * and only the unit changes. Copying the *values* would be a second source; using the same rule is
 * the point.
 */
export function puffDiameterWorld(
  particle: { radius: number; scale: number; size: number; depth: number },
  worldHeight: number,
  worldHeightPx: number,
): number {
  const radiusWorld =
    particle.radius * particle.scale * particle.size * (0.72 + particle.depth * 0.5) * PUFF_SPREAD;
  const cappedWorld = (MAX_SMOKE_RADIUS_PX / Math.max(1, worldHeightPx)) * worldHeight;
  return Math.min(radiusWorld * worldHeight * 2, cappedWorld * 2);
}

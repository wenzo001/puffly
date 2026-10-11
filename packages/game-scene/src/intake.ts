/**
 * Burst intake: a Game Core recipe becomes particles.
 *
 * The recipe carries a seed, so this expansion is reproducible — the same session replays
 * into the same smoke (§71) while still never looking like the previous puff (§16).
 * Everything here works in normalised stage units, so resolution never changes the physics.
 */

import { createRng } from '@puffly/shared';
import type { Rgb } from '@puffly/shared';
import type { Burst, BurstKind } from '@puffly/game-core';
import type { ParticlePool, PlumeLayer } from './particles';

/** Lattice size for the curl field: about eight cells across the visible stage. */
export const FIELD_SCALE = 8;

export interface IntakeOptions {
  /** 0..1; quality and reduced motion both arrive here already decided by settings (§64). */
  densityScale: number;
  /** Only draw puffs this far into the future; used to keep a stalled tab from dumping. */
  maxSpawnPerFrame?: number;
  /**
   * §6.1: the 烟羽 layer of a skin, or `undefined` for the scene as the content made it. The
   * plume is made of particles, not of the haze behind them, so a colour layer that stops at
   * the haze changes nothing a player can see.
   */
  plumeTint?: Rgb;
  /**
   * S6's 「吐烟的烟羽整体偏亮一档」, as far as this renderer's 写实度 allows: 1 is the brightness the
   * core authored, and the cartoon side lifts the *breath* above it so the player can see the shape
   * they made. Only `exhale` reads it — the rod's own thread, the cherry's ribbon and every piece of
   * material keep the alpha the simulation gave them.
   */
  plumeLift?: number;
}

/**
 * The tobacco's own material — a melted filter, a grain of ash, the dust a rod knocks loose.
 * A skin may recolour smoke; it has no business recolouring what is not smoke.
 *
 * Exported for the plume measurements: a point cloud that mixes a falling ash column into the breath
 * is not a picture of the smoke, and its footprint then moves whenever a column happens to drop.
 */
export const MATERIAL_BURSTS: ReadonlySet<BurstKind> = new Set(['ember', 'ash', 'impact']);

/**
 * How fast still air brings each kind of particle back to rest, per second.
 *
 * Two failures sit on either side of this number, and both were real. At 0.9 — a flake of ash's
 * relaxation time, borrowed for smoke — the exhaled cloud reached four to eleven tenths of a
 * stage height per second and was outside the frame before the player had finished the breath.
 * At 12, the fix for that, it reached a hundred and twentieth of one: the whole breath became a
 * small tight body parked on the mouth, which is what plume-column.test.ts（2026-10-10 随 2D 光栅套件退役） now measures.
 *
 * 6 is the middle that matches what a breath actually does — about a tenth of a screen height
 * per second, most of it within a quarter second of letting go. Buoyancy is the acceleration
 * and this is the air's answer to it; the product of the two is the speed, so neither number can
 * be moved alone.
 */
export const SMOKE_DRAG = 6;
export const MATERIAL_DRAG = 0.9;

const dragFor = (kind: BurstKind): number =>
  MATERIAL_BURSTS.has(kind) ? MATERIAL_DRAG : SMOKE_DRAG;

/**
 * The plume bodies — the ones that are meant to be *watched rising*. A spark, a flake of ash and
 * the puff of a struck flint are all events, and an event that fades in over a second is a bug.
 */
const STREAMED_BURSTS: ReadonlySet<BurstKind> = new Set(['puff', 'exhale', 'drift']);

/**
 * How long each kind of plume body keeps leaving its source, as a share of its own life.
 *
 * The three are different events and one number could only be right for one of them. A breath is a
 * second of smoke, so its burst is spread over a second. A drift batch is a clump that arrives
 * every few hundred milliseconds, and spreading *it* over a second is what beaded the thread: the
 * clump's ten discs were pushed apart along the column instead of filling the gap behind the last
 * clump. The window is the event, not the particle.
 */
const STREAM_SHARE: Partial<Record<BurstKind, number>> = {
  exhale: 0.44,
  puff: 0.25,
  drift: 0.3,
};
const STREAM_MAX_MS = 1600;
/** How much dimmer the last of the breath is than the first. */
const STREAM_TAPER = 0.5;

/**
 * How much of the room's eddies a smoke particle feels sideways. The curl field is authored at
 * room scale — eight cells across the stage — so taken whole it wanders a rising column a tenth
 * of a screen width in four seconds, which is the same complaint the smoke arrived with
 * (「那个烟会到左上角」) seen from the other side. Buoyancy is the column's own momentum and the
 * eddies are not; only the horizontal pays for that.
 */
const LATERAL_SWING = 0.45;

/**
 * S7's 「烟羽分层：主体、边缘、卷曲三层独立速度与透明度」 — what each layer is born with, as a multiple
 * of what the simulation authored for the plume as a whole.
 *
 * The column was already one body of air (#38), on stage (#39) and continuous (#40), but every puff
 * in it had the same brightness, the same buoyancy and the same share of the room's eddies. That is
 * why it read as one rope. A plume has a body, an edge that did not keep up, and curls that leave:
 *
 * - `core` *is* the authored picture, so the head of a breath still moves at the speed the three
 *   calibrated plume files were measured against;
 * - `edge` is dimmer and slower, so it hangs out to the sides of the body instead of stacking on it;
 * - `curl` is the dimmest and slowest, and the only layer a venue's draught pulls further (the
 *   `curlShred` argument of `ParticlePool.update`) — 「卷曲后变淡」 as motion rather than as a fade.
 *
 * The three `swing`s weigh out to exactly 1 over the shares `plumeLayerFor` deals, so the layering
 * buys structure without moving the cloud: against this same table collapsed to one layer, the plume's
 * footprint goes 22.2% → 23.0% of the stage and a breath's lit width at 2 s 0.103 → 0.092 stage heights.
 * The `alpha`s weigh out to 1.03 rather than 1 on purpose — the halo is *added* light instead of the
 * body's light spent on it, and spending it is what brought 烟看不清 back (equal alpha alone puts the
 * peak-to-room ratio at 4.60, under the floor plume-contrast.test.ts（2026-10-10 随 2D 光栅套件退役） holds at 5). The `rise`s are not
 * weighed at all: the head of a breath is the body's, and it keeps the authored buoyancy, while the
 * outer layers lag behind it. `plume-layers.test.ts` reads all three numbers per layer and per rod.
 */
const PLUME_LAYERS = {
  core: { alpha: 1.5, rise: 1, swing: 0.55 },
  edge: { alpha: 0.7, rise: 0.72, swing: 1.15 },
  curl: { alpha: 0.35, rise: 0.5, swing: 1.9 },
} satisfies Record<PlumeLayer, { alpha: number; rise: number; swing: number }>;

/** What a particle that is not plume air is born with: the authored numbers, and the whole field. */
const UNSPLIT = { alpha: 1, rise: 1, swing: 1 };

/**
 * Which layer the `index`th birth of a burst belongs to: five body, three edge, two curl, dealt so
 * that **any five consecutive births contain all three**.
 *
 * The order is the substance. A burst is a *stream* (see `streamWindow`), so birth index is position
 * along the column: dealing all the cores first would put the body at the head of the breath and the
 * curls at the mouth — three layers sliced in time, which is the picture this replaces — instead of a
 * body with an edge and a curl around it at every height. The three slots of each layer also sit at
 * the same mean position, which is why the layers separate by *speed* rather than by arrival time.
 */
export function plumeLayerFor(index: number): PlumeLayer {
  const slot = index % 10;
  if (slot === 3 || slot === 6) return 'curl';
  if (slot === 1 || slot === 4 || slot === 8) return 'edge';
  return 'core';
}

const streamWindow = (burst: Burst): number => {
  const share = STREAM_SHARE[burst.kind];
  return share === undefined ? 0 : Math.min(burst.lifeMs.min * share, STREAM_MAX_MS);
};

/**
 * The one plume the player is responsible for. The deck puts 「整体偏亮一档」 on its cartoon side, and
 * the reason it needs a lift at all is measurable: the core authors the breath at
 * `0.08 + 0.1 × intensity` (≤ 0.18) and the smouldering thread at a flat `0.18` — before any lifting,
 * the shape the player made is the dimmer of the two.
 */
const BREATH_BURST: BurstKind = 'exhale';

const liftFor = (kind: BurstKind, lift: number): number => (kind === BREATH_BURST ? lift : 1);

const tintFor = (burst: Burst, plumeTint: Rgb | undefined): Rgb =>
  plumeTint && !MATERIAL_BURSTS.has(burst.kind) ? plumeTint : burst.tint;

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export function intakeBurst(burst: Burst, pool: ParticlePool, options: IntakeOptions): number {
  const rng = createRng(burst.seed);
  const limit = options.maxSpawnPerFrame ?? 240;
  const requested = Math.min(burst.count, limit);
  const spawnCount = Math.max(1, Math.round(requested * options.densityScale));
  let spawned = 0;
  const windowMs = streamWindow(burst);
  const lift = liftFor(burst.kind, options.plumeLift ?? 1);

  for (let i = 0; i < spawnCount; i++) {
    // 0 at the first particle, 1 at the last. Even spacing is what keeps the column continuous:
    // bunching the births made the breath front-loaded in *mass* as well as in brightness, and the
    // clumps read as a dashed line once they had risen.
    const share = spawnCount > 1 ? i / (spawnCount - 1) : 0;
    // The layer comes from the birth index and not from the RNG: an extra draw here would move
    // every number the calibrated plume pictures were measured against (§71).
    const layer = STREAMED_BURSTS.has(burst.kind) ? plumeLayerFor(i) : null;
    const authoring = layer === null ? UNSPLIT : PLUME_LAYERS[layer];
    const angle = degToRad(
      burst.directionDeg + rng.range(-burst.spreadDeg / 2, burst.spreadDeg / 2),
    );
    const speed = rng.range(burst.speed.min, burst.speed.max);
    const radius = rng.range(burst.radius.min, burst.radius.max);
    const life = rng.range(burst.lifeMs.min, burst.lifeMs.max);

    const particle = pool.spawn({
      x: burst.origin.x + rng.range(-radius, radius) * 0.4,
      y: burst.origin.y + rng.range(-radius, radius) * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      alphaPeak:
        burst.alphaPeak * rng.range(0.7, 1.1) * (1 - STREAM_TAPER * share) * lift * authoring.alpha,
      alphaDecay: burst.alphaDecay,
      life,
      noiseSeed: rng.int(0, 65535),
      rotation: rng.range(-Math.PI, Math.PI),
      scale: rng.range(0.7, 1.35),
      scaleGrowth: burst.scaleGrowth * rng.range(0.8, 1.2),
      turbulence: burst.turbulence,
      rise: burst.rise * rng.range(0.75, 1.25) * authoring.rise,
      gravity: burst.gravity,
      drag: dragFor(burst.kind),
      swing: layer === null ? 1 : LATERAL_SWING * authoring.swing,
      layer,
      tint: tintFor(burst, options.plumeTint),
      heat: burst.heat * rng.range(0.6, 1),
      // Depth is sampled, not derived from index, so a puff never bands into layers.
      depth: rng.range(0.25, 1),
      // Only a struck flint throws sparks. Hot smoke is still smoke: promoting a fifth of the
      // cherry's puff to an additive streak is what put a line of light bulbs up the ribbon.
      spark: burst.kind === 'ember',
      delay: windowMs * share,
    });
    if (particle) spawned += 1;
  }

  return spawned;
}

/**
 * How full the pool may get for a quality tier. The numbers are the core's budget table
 * (SPEC.md §54) with reduced motion taking the smallest share.
 */
export function budgetFor(
  reducedMotion: boolean,
  quality: 'auto' | 'high' | 'balanced' | 'light',
): number {
  if (reducedMotion) return 160;
  switch (quality) {
    case 'light':
      return 380;
    case 'balanced':
      return 800;
    case 'high':
      return 1400;
    default:
      return 1000;
  }
}

/**
 * Particle system — SPEC.md §15, §16, §54.
 *
 * Fixed-size pool, zero allocation in the per-frame loop, and an explicit budget. The
 * particle record carries exactly the fields §15 names, plus the few the integrator
 * needs. Particles are never touched by Vue and never become reactive (§54, §81 (9)).
 */

import type { Rgb } from '@puffly/shared';
import { curl2 } from './noise';

/**
 * S7's 「主体、边缘、卷曲三层」 — the three layers a plume is made of, each with its own speed and
 * its own brightness. `null` means *this particle is not plume air*: a spark, a flake of ash and the
 * puff of a struck flint are events, and an event has no halo.
 */
export type PlumeLayer = 'core' | 'edge' | 'curl';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
  noiseSeed: number;
  rotation: number;
  /** Multiplier sampled at spawn, so identical bursts still vary in size (§16). */
  scale: number;
  /** How much wider the puff is at the end of its life than at the start. */
  scaleGrowth: number;
  /** 1..1+scaleGrowth, derived from age: smoke spreads, but it does not fill the room. */
  size: number;
  /** 0..1 through this particle's life. */
  age: number;
  alphaPeak: number;
  alphaDecay: number;
  turbulence: number;
  rise: number;
  gravity: number;
  /**
   * How hard still air drags this particle back to rest, per second. Smoke and ash are not the
   * same object: a micron of aerosol relaxes in a fraction of a second, a flake of ash does not.
   */
  drag: number;
  tint: Rgb;
  heat: number;
  /** 0 = far away and dim, 1 = at the front of the frame. Lets smoke read as volume. */
  depth: number;
  /**
   * How much of the room's eddies this particle actually feels sideways, 0..1. A column of smoke
   * denser than air is not a passive tracer: it keeps climbing its own buoyancy path and meanders
   * far less than the same turbulence would push a speck of dust.
   */
  swing: number;
  /** Which of the plume's three layers this body belongs to, or `null` for a non-plume event. */
  layer: PlumeLayer | null;
  /** Previous position, so a spark can be drawn as a streak instead of a dot. */
  px: number;
  py: number;
  spark: boolean;
  /**
   * Milliseconds before this particle is born. A breath is not instantaneous: the smoke keeps
   * leaving the mouth while the head of the column is already above it, and a particle that has
   * not been born yet holds still and draws nothing.
   */
  delay: number;
  active: boolean;
}

export interface SpawnInit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alphaPeak: number;
  alphaDecay: number;
  life: number;
  noiseSeed: number;
  rotation: number;
  scale: number;
  scaleGrowth: number;
  turbulence: number;
  rise: number;
  gravity: number;
  drag: number;
  swing?: number;
  layer: PlumeLayer | null;
  tint: Rgb;
  heat: number;
  depth: number;
  spark: boolean;
  /** See `Particle.delay`: milliseconds before this one is born. */
  delay?: number;
}

/**
 * S12's 「火星飞溅用夸张粒子，落地有弹跳（比真实更脆）」.
 *
 * A real spark is taken by the table in one hop. 比真实更脆 asks for the opposite exaggeration, so
 * this throws back more than half of what it brought and keeps most of the sideways speed — the
 * player sees the table *take* the spark instead of swallowing it. The numbers were picked after
 * measuring what happens without them: every spark from the lighting crossed the table's horizon
 * with vy≈0.42 and 0.8–1.3 s of life left, and died at y 1.00–1.30 of a stage that ends at 1.0.
 * They fell through the one surface the scene draws.
 */
const SPARK_BOUNCE = 0.55;
/**
 * The most a spark may be given back. Restitution at or above 1 returns more than it brought, so
 * every hop would rise higher than the last and the table would look like a trampoline; the deck's
 * cartoon side asks for 「比真实更脆」, not for energy from nowhere.
 */
const SPARK_BOUNCE_MAX = 0.9;
const SPARK_SCATTER = 0.72;
/** A landing spends a fifth of what the spark has left, so a spark that lands dies on the table. */
const SPARK_LANDING_COST = 0.8;

const EMPTY: Particle = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 1,
  alpha: 0,
  life: 0,
  maxLife: 1,
  noiseSeed: 0,
  rotation: 0,
  scale: 1,
  size: 1,
  age: 0,
  scaleGrowth: 1,
  alphaPeak: 0,
  alphaDecay: 1,
  turbulence: 0,
  rise: 0,
  gravity: 0,
  drag: 0.9,
  swing: 1,
  layer: null,
  tint: [200, 200, 200],
  heat: 0,
  depth: 0.5,
  px: 0,
  py: 0,
  spark: false,
  delay: 0,
  active: false,
};

export class ParticlePool {
  private readonly items: Particle[] = [];
  private cursor = 0;
  private activeCount = 0;

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) this.items.push({ ...EMPTY });
  }

  get capacity(): number {
    return this.items.length;
  }

  get size(): number {
    return this.activeCount;
  }

  /**
   * Ring-buffer allocation: no search, no `splice`, no garbage. When the pool is full the
   * oldest slot is recycled, which keeps a puff's tail rather than its head — visually the
   * least damaging thing to lose.
   */
  spawn(init: SpawnInit): Particle | null {
    const slot = this.items[this.cursor];
    if (!slot) return null;
    this.cursor = (this.cursor + 1) % this.items.length;
    if (!slot.active) this.activeCount += 1;

    slot.x = init.x;
    slot.y = init.y;
    slot.vx = init.vx;
    slot.vy = init.vy;
    slot.radius = init.radius;
    slot.alpha = 0;
    slot.life = init.life;
    slot.maxLife = init.life;
    slot.noiseSeed = init.noiseSeed;
    slot.rotation = init.rotation;
    slot.scale = init.scale;
    slot.size = 1;
    slot.age = 0;
    slot.scaleGrowth = init.scaleGrowth;
    slot.alphaPeak = init.alphaPeak;
    slot.alphaDecay = init.alphaDecay;
    slot.turbulence = init.turbulence;
    slot.rise = init.rise;
    slot.gravity = init.gravity;
    slot.drag = init.drag;
    slot.swing = init.swing ?? 1;
    slot.layer = init.layer;
    slot.tint = init.tint;
    slot.heat = init.heat;
    slot.depth = init.depth;
    slot.spark = init.spark;
    slot.px = init.x;
    slot.py = init.y;
    slot.delay = init.delay ?? 0;
    slot.active = true;
    return slot;
  }

  /**
   * Integrate everything in one pass. `drift` is the wind **velocity** from Game Core
   * (`SmokeField.drift`, normalised units per second), so it is added to the particle's own
   * velocity rather than treated as an acceleration — the difference is a column that leans
   * with the gust instead of creeping sideways long after it.
   *
   * `sparkFloor` is the table plane in the same stage units, or `null` for a scene that offers no
   * surface. It answers sparks and nothing else: ash is simulated by Game Core, and a plume of
   * smoke that could not fall past a line would be a wall.
   *
   * `sparkBounceScale` is S6's 写实度 as the frame reads it: 1 is `SPARK_BOUNCE` itself, 0 lets the
   * table keep the spark, and the cartoon end is capped inside this file at `SPARK_BOUNCE_MAX` so a
   * hop always settles instead of growing.
   *
   * `curlShred` is the venue's share of the plume's *structure*, 0..1: a draught does not tear a plume
   * in half, it takes the outside first. Only the 卷曲 layer pays for it, so an open place peels the
   * wisps off while the 主体 keeps the line the player breathed — which is the part of S7's 「分层」 that
   * #57's 通风系数 could not reach, because that number changes how the plume is *painted*, not how it
   * comes apart.
   */
  update(
    dtMs: number,
    drift: { x: number; y: number },
    fieldScale: number,
    timeSeconds: number,
    sparkFloor: number | null,
    sparkBounceScale = 1,
    curlShred = 0,
  ): void {
    if (this.activeCount === 0) return;

    for (const particle of this.items) {
      if (!particle.active) continue;

      // Not born yet: it holds its place at the mouth and draws nothing, which is what lets one
      // burst be a stream instead of a lump. A step that reaches past the birth still owes the
      // particle the rest of it — otherwise one long frame, like a tab that was in the background,
      // would freeze the whole stream and hand back a slot that has never aged.
      let step = dtMs;
      if (particle.delay > 0) {
        if (particle.delay >= step) {
          particle.delay -= step;
          continue;
        }
        step -= particle.delay;
        particle.delay = 0;
      }
      const dt = step / 1000;

      particle.life -= step;
      if (particle.life <= 0) {
        particle.active = false;
        this.activeCount -= 1;
        continue;
      }

      const age = 1 - particle.life / particle.maxLife;
      // One field for the whole room. `curl2`'s seed picks a different noise *lattice*, not a
      // different place in the same one, so handing every particle its own seed — which is what
      // this did — means two neighbours standing side by side are pushed in unrelated directions.
      // That is not turbulence, it is a swarm: the column has no body to it, and the eye reads
      // fog that is out of focus (像雾, 没对上焦). Coherence comes from sharing the air; the
      // individual texture comes from where in the field each puff happens to sit, plus a
      // sub-cell offset so particles at the same point are not locked to one another.
      const jitter = ((particle.noiseSeed & 255) / 255) * 0.12;
      const swirl = curl2(
        particle.x * fieldScale + timeSeconds * 0.12 + jitter,
        particle.y * fieldScale - timeSeconds * 0.2,
        0,
      );

      // Turbulence is the acceleration; the wind is the air the particle is sitting in. The draught
      // is added where the plume is weakest: a torn-off curl goes sideways, while the body keeps
      // climbing its own buoyancy path.
      const swing = particle.layer === 'curl' ? particle.swing * (1 + curlShred) : particle.swing;
      particle.vx += swirl.vx * particle.turbulence * swing * dt;
      particle.vy += (swirl.vy * particle.turbulence - particle.rise + particle.gravity) * dt;

      // Air drags a particle back to still; without this it accelerates into streaks. The rate is
      // the particle's own, because smoke and ash are different objects in the same air: an
      // aerosol relaxes in a fraction of a second, a flake of ash takes a second or more. One
      // shared constant had to be wrong for one of them, and for smoke it was wrong by an order
      // of magnitude — which is what put the whole breath outside the frame in under two seconds.
      const damp = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= damp;
      particle.vy *= damp;

      particle.px = particle.x;
      particle.py = particle.y;
      particle.x += (particle.vx + drift.x) * dt;
      particle.y += (particle.vy + drift.y) * dt;

      if (particle.spark && sparkFloor !== null && particle.vy > 0 && particle.y >= sparkFloor) {
        // Clamped to the plane rather than reflected off wherever it happened to be: a frame is
        // 16 ms and a spark moves, so the hop has to start from the table and not from under it.
        //
        // A landing is *crossing* the plane, not sitting on it: with no restitution left to give the
        // spark (the 写实 end of the dial) it stays clamped to the table and re-enters this branch
        // every frame, so an unconditioned cost would kill it in five frames instead of letting it
        // glow out on the surface. `py` is last frame's y, which the clamp already left at the plane.
        const arriving = particle.py < sparkFloor;
        particle.y = sparkFloor;
        particle.vy = -particle.vy * Math.min(SPARK_BOUNCE_MAX, SPARK_BOUNCE * sparkBounceScale);
        particle.vx *= SPARK_SCATTER;
        if (arriving) particle.life *= SPARK_LANDING_COST;
      }

      // Diffusion-ish: the puff widens across its own lifetime. Deliberately *not*
      // `radius *= 1 + k*dt`, which compounds and turns a wisp into a wall of fog.
      particle.age = 1 - particle.life / particle.maxLife;
      particle.size = 1 + particle.scaleGrowth * particle.age;
      particle.rotation += (particle.turbulence * 0.4 + 0.15) * dt;

      // In fast, out slow: what makes a wisp read as smoke rather than a fading dot.
      const attack = Math.min(1, age / 0.12);
      const release = Math.pow(1 - age, particle.alphaDecay);
      particle.alpha = particle.alphaPeak * attack * release;
    }
  }

  forEachActive(visit: (particle: Particle, index: number) => void): void {
    if (this.activeCount === 0) return;
    for (let i = 0; i < this.items.length; i++) {
      const particle = this.items[i];
      if (particle && particle.active) visit(particle, i);
    }
  }

  clear(): void {
    for (const particle of this.items) particle.active = false;
    this.activeCount = 0;
    this.cursor = 0;
  }
}

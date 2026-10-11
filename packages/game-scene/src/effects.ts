/**
 * Discrete scene feedback — SPEC.md §19, §20, §60.
 *
 * A ring where something landed, a flash where the cherry died, a wobbling tray. These
 * are *render-time* effects: they are born from a burst and decay, so they never enter
 * game state and never need to be serialised. That is what keeps §48 honest while the
 * scene still answers the player immediately (§60: every action gets visual feedback).
 */

export type EffectKind = 'ring' | 'flash' | 'ripple';

export interface SceneEffect {
  kind: EffectKind;
  /** Normalised stage coordinates. */
  x: number;
  y: number;
  bornMs: number;
  ttlMs: number;
  strength: number;
  /** Ring radius growth, in stage units over the lifetime. */
  reach: number;
  tint: readonly [number, number, number];
}

const MAX_EFFECTS = 12;

export class EffectList {
  private items: SceneEffect[] = [];

  push(effect: SceneEffect): void {
    this.items.push(effect);
    if (this.items.length > MAX_EFFECTS) this.items = this.items.slice(-MAX_EFFECTS);
  }

  /** Newest last, so a flash drawn over a ring reads correctly. */
  active(nowMs: number): SceneEffect[] {
    this.items = this.items.filter((effect) => nowMs - effect.bornMs < effect.ttlMs);
    return this.items;
  }

  clear(): void {
    this.items = [];
  }
}

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly SceneEffect[],
  nowMs: number,
  toPx: (x: number, y: number) => { x: number; y: number },
  toLen: (units: number) => number,
): void {
  if (effects.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const effect of effects) {
    const age = Math.min(1, (nowMs - effect.bornMs) / effect.ttlMs);
    const eased = 1 - (1 - age) * (1 - age);
    const alpha = effect.strength * (1 - age) * (1 - age);
    if (alpha <= 0.004) continue;
    const centre = toPx(effect.x, effect.y);

    if (effect.kind === 'flash') {
      const radius = toLen(0.05 + eased * effect.reach);
      const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius);
      glow.addColorStop(
        0,
        `rgba(${effect.tint[0]}, ${effect.tint[1]}, ${effect.tint[2]}, ${alpha.toFixed(3)})`,
      );
      glow.addColorStop(1, `rgba(${effect.tint[0]}, ${effect.tint[1]}, ${effect.tint[2]}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const radius = toLen(0.012 + eased * effect.reach);
    ctx.strokeStyle = `rgba(${effect.tint[0]}, ${effect.tint[1]}, ${effect.tint[2]}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, toLen(0.004) * (1 - eased * 0.6));
    ctx.beginPath();
    if (effect.kind === 'ripple') {
      // A squashed circle: the ripple is on a surface, not in the air.
      ctx.ellipse(centre.x, centre.y, radius, radius * 0.34, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The plume has to stay where the player is looking — SPEC.md §15.
 *
 * Shape was measured for a long time without direction: a cloud that leaves the frame upward and
 * a cloud that hangs in it have the same elongation. This is the assertion that catches the
 * difference, and it was written after the fact — every one of the eleven cigarettes had its
 * exhaled cloud entirely outside the stage two seconds after the breath (the default: 1.06 stage
 * heights of travel by then), because the pool's air drag was a single 0.9/s borrowed from ash.
 *
 * The rule is stated in brightness, not in time, because "gone" and "faded" are different
 * failures: a cloud may leave the frame once it is nearly invisible, and may not while it is
 * still more than half lit.
 *
 * What it measures moved, and the reason is worth keeping. It used to demand that 95% of the cloud
 * be inside the stage box two seconds after the release, which treats the box as the room. A plume
 * that reaches an eighth of a screen height in the first second — which is what the design's 吐烟
 * does, and what plume-column.test.ts（2026-10-10 随 2D 光栅套件退役） now pins — has its leading edge out of the top of the frame
 * well before it has finished being bright. The two claims cannot both hold, and the one that had
 * to move is this one, because what the player reported was the smoke going to a *corner*, not
 * smoke rising out of sight at the top the way smoke does. So the box rule is now the whole cloud
 * at 1.2 s and the cloud's centre at 2 s, and the sideways rule is untouched.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { Burst } from '@puffly/game-core';
import { FIELD_SCALE, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

interface Cloud {
  /** Share of the live particles still inside the stage box. */
  inFrame: number;
  /** Share of the cloud's own centre of mass still inside the box. */
  centreInFrame: number;
  /** How far the cloud's centre has slid sideways, in stage widths. */
  driftX: number;
  /** Mean alpha, against the brightest particle still in the air. */
  meanAlpha: number;
  peakAlpha: number;
}

/** One real breath from one real cigarette, ridden out to `seconds`. */
function breathOf(cigaretteId: string): (seconds: number) => Cloud | null {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId });
  lit(h);
  let burst: Burst | null = null;
  h.engine.on((event) => {
    if (!burst && event.kind === 'burst' && event.burst.kind === 'exhale') burst = event.burst;
  });
  h.press('cigarette');
  h.engine.advance(1400);
  h.release('cigarette');
  h.engine.advance(600);
  if (!burst) throw new Error(`${cigaretteId} never breathed`);

  const pool = new ParticlePool(1400);
  intakeBurst(burst, pool, { densityScale: 1 });
  const origin: Burst['origin'] = (burst as Burst).origin;
  let elapsed = 0;

  return (seconds: number) => {
    const steps = Math.round(((seconds - elapsed) * 1000) / STEP);
    for (let i = 0; i < steps; i++) {
      pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, elapsed, null);
      elapsed += STEP / 1000;
    }
    let live = 0;
    let inside = 0;
    let sum = 0;
    let peak = 0;
    let sumX = 0;
    let sumY = 0;
    pool.forEachActive((particle) => {
      live += 1;
      sumX += particle.x;
      sumY += particle.y;
      // The stage box is the unit the whole engine works in, so 0..1 is the frame itself.
      if (particle.y >= 0 && particle.y <= 1 && particle.x >= 0 && particle.x <= 1) inside += 1;
      sum += particle.alpha;
      peak = Math.max(peak, particle.alpha);
    });
    if (live === 0) return null;
    const centreY = sumY / live;
    return {
      inFrame: inside / live,
      centreInFrame: centreY >= 0 && centreY <= 1 ? 1 : 0,
      driftX: sumX / live - origin.x,
      meanAlpha: sum / live,
      peakAlpha: peak,
    };
  };
}

const ids = DEFAULT_CONTENT.cigarettes.map((cigarette) => cigarette.id);

describe('the breath stays on the stage while it is lit (§15)', () => {
  it('measures every cigarette the content ships', () => {
    // The denominator of the two rules below, stated where it cannot go stale.
    expect(ids.length).toBe(11);
  });

  it.each(ids)('%s keeps its breath in frame through the breath', (id) => {
    const cloud = breathOf(id)(1.2);
    expect(cloud, `${id} had no cloud left at 1.2 s`).not.toBeNull();
    expect(cloud?.inFrame).toBeGreaterThanOrEqual(0.95);
  });

  it.each(ids)('%s never runs sideways off the tip', (id) => {
    const atFour = breathOf(id)(4);
    if (!atFour) return;
    // 「点击抽烟的那个按钮 那个烟会到左上角」 is this rule horizontally, and at the old damping the cloud
    // slid 0.145 of a stage leftward on its way out of the frame.
    expect(Math.abs(atFour.driftX), `${id} ran sideways off the tip`).toBeLessThanOrEqual(0.05);
  });

  it.each(ids)('%s still has the body of its breath on stage two seconds in', (id) => {
    // A written-down mistake, kept here because it is the kind this file exists to catch. The
    // version before this one walked the breath forward to the moment its centre crossed the top
    // edge and demanded the cloud be faint by then. No plume can do that and also be a plume: the
    // tip is held at 0.42 of a stage height from the top, so a breath that climbs at the speed the
    // design's 吐烟 climbs has its centre cross that edge in four seconds, while it is halfway
    // through a life the content authored at three and a half to eight seconds. "Gone by the time
    // it leaves" is only satisfiable by smoke that never leaves, which is the nub this whole pass
    // started from. So the vertical claim is about the body being *there* while the player is
    // looking at the breath, and the runaway is caught by the 1.2 s case above.
    const atTwo = breathOf(id)(2);
    expect(atTwo, `${id} had no cloud left at 2 s`).not.toBeNull();
    expect(atTwo?.centreInFrame, `${id} had lost its whole body off the top by 2 s`).toBe(1);
  });
});

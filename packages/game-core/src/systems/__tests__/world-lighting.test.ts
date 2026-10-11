/**
 * A shadow passing outside takes light off the room — SPEC.md §22, and the brief's 「声音是一定要
 * 跟画面连接的」.
 *
 * This is the surviving half of tests/world-and-picture.test.ts, retired with the 2D renderer on
 * 2026-10-10. The painted-frame halves (the sky/vignette gradient and the dust mote pixels) retired
 * with that package; the claim that cannot retire is the core one: while a SHADOW_CHANGE is live,
 * `world.light.ambient` is the room's own ambient dimmed by exactly `SHADOW_SHARE`, and on a quiet
 * frame it is byte-identical to the baseline. The scene's own room tests cover that its backdrop
 * reads this field.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { WorldEventId } from '../../types/events';
import { harness } from '../../__tests__/harness';
import { resolveLighting, SHADOW_SHARE } from '../world';

const STEP = 1000 / 60;
const ROOM = DEFAULT_CONTENT.environments.find((e) => e.id === 'quiet-room');

describe('a shadow passing outside takes light off the room (§22)', () => {
  it('depresses the room light only while the event is live, by the pinned share', () => {
    expect(ROOM, 'quiet-room is in the shipped content').toBeTruthy();
    const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
    let clear: { ambient: number; base: number } | null = null;
    let shadowed: { ambient: number; base: number; shadow: number } | null = null;
    for (let i = 0; i < 60 * 200 && (!clear || !shadowed); i += 1) {
      h.run(STEP);
      const s = h.state();
      const base = resolveLighting(ROOM!, s.world.timeOfDay).ambient;
      if (s.world.activeEvents.length === 0 && s.world.shadow < 0.01) {
        clear = { ambient: s.world.light.ambient, base };
      }
      if (
        shadowed === null &&
        s.world.activeEvents.some((e) => e.type === WorldEventId.SHADOW_CHANGE) &&
        s.world.shadow > 0.2
      ) {
        shadowed = { ambient: s.world.light.ambient, base, shadow: s.world.shadow };
      }
    }
    expect(shadowed, 'no shadow_change came live in 200 s of the shipped room').not.toBeNull();
    expect(clear, 'no quiet frame was found').not.toBeNull();
    console.log(
      `SHADOW clear ${clear!.ambient.toFixed(3)}/${clear!.base.toFixed(3)} ` +
        `shadowed ${shadowed!.ambient.toFixed(3)}/${shadowed!.base.toFixed(3)} ` +
        `at shadow=${shadowed!.shadow.toFixed(3)}`,
    );
    // Both halves, or the claim is only that one number is smaller than another.
    expect(clear!.ambient).toBeCloseTo(clear!.base, 6);
    expect(shadowed!.ambient).toBeLessThan(shadowed!.base - 0.02);
    expect(shadowed!.ambient).toBeCloseTo(
      shadowed!.base * (1 - shadowed!.shadow * SHADOW_SHARE),
      3,
    );
  });
});

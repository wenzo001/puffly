/**
 * S6's 写实度 row, pinned as a limit rather than as a look.
 *
 * The dial is read by five presentation surfaces in `game-scene` and by nothing else. This file exists
 * because the guard that said so lived with the Canvas 2D renderer and retired with it on 2026-10-10
 * without a successor (SPEC.md carries that gap as #140). It sits here, in the package the rule is about,
 * so the day a physical quantity starts reading this knob the red lands where the read happened.
 *
 * The comparison is a whole break's state plus its event log rather than a couple of numbers: a setting
 * that changed one burst would leave the state looking similar while the session record told a different
 * story.
 */
import { describe, expect, it } from 'vitest';
import type { Settings } from '@puffly/game-core';
import { harness, lit, type Harness } from './harness';

/** One break, performed the same whatever the row says: light, a held draw, the ash let go, a knock. */
function breakAt(settings: Partial<Settings>): string[] {
  const h: Harness = harness({ settings });
  lit(h);
  h.press('cigarette');
  h.run(2_000);
  h.release('cigarette');
  h.until(() => h.state().cigarette.ash.ready, 60_000);
  h.tap('ash');
  h.run(3_000);
  return [JSON.stringify(h.state()), ...h.events.map((event) => JSON.stringify(event))];
}

/** The stops the row's tick marks can reach, including the deck's shipped 0.8. */
const DETENTS = [0, 0.2, 0.4, 0.6, 0.8, 1];

describe('the dial cannot reach the burn (Frozen Core, redrawn for a look)', () => {
  const at0 = breakAt({ realism: 0 });

  for (const realism of DETENTS) {
    it(`a break at 写实度 ${realism.toFixed(1)} writes the same session as one at 0`, () => {
      expect(breakAt({ realism })).toEqual(at0);
    });
  }

  it('and the ruler is not vacuous: a setting the core does read changes the session', () => {
    // The retired suite called this its positive control. `quality` is a settings field that reaches
    // the simulation on purpose — `systems/emissions.ts` scales every burst by it — so if this pair
    // came out identical, the six assertions above would be proving nothing.
    const light = breakAt({ quality: 'light' });
    const high = breakAt({ quality: 'high' });
    expect(
      light,
      'the comparison cannot tell two settings apart, so it proves nothing',
    ).not.toEqual(high);
  });
});

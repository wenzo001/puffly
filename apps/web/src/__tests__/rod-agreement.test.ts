/**
 * The rod is one rod. The tube is drawn twice, and only one of the two is the simulation's.
 *
 * Measured on the shipped build, 2026-10-13, with a lit rod at each of the four shapes the product
 * ships on. A scratch probe (since removed) read the scene graph: the `rod` mesh's world matrix, and
 * the `rod-cherry` mesh's world position.
 *
 * | shape | tube length (world) | tube's far end → the cherry |
 * | --- | --- | --- |
 * | phone portrait 393×852 | 1.077 | 0.850 |
 * | phone landscape 844×390 | 2.122 | 0.641 |
 * | **desktop 1280×800** | 1.678 | **2.493** |
 * | wide 1680×900 | 2.045 | 0.042 |
 *
 * On a desktop window the cherry sits **2.49 world units from its own rod's far end — further than
 * the rod is long** — while on `wide` the two agree to 0.04. On landscape the tube is 2.12 units
 * long and lies at `rotZ ≈ -0.885` (51°), which is the giant plank the eye reads as "a rod as big as
 * the stage".
 *
 * The mechanism, reproduced offline as well as in the browser: `canvasToWorld` maps a stage
 * fraction to world with `stageWidth = WORLD_HEIGHT * (box.width / box.height) * viewportAspect` but
 * keeps the y-span at `WORLD_HEIGHT`. `rodBetweenInBox` measures the rod as
 * `hypot(Δx, Δy)` of two such points, so the **x-span scales with the viewport aspect while the
 * y-span does not**, and the rod's length grows with the window. Same published fractions, three
 * shapes, three rods:
 *
 *     portrait   len 0.891   (393×852,  aspect 0.461)
 *     landscape  len 3.076   (844×390,  aspect 2.164)   ← 3.4× the portrait rod
 *     desktop    len 2.527   (1280×800, aspect 1.600)
 *
 * Meanwhile the core owns the rod correctly: `refreshPose` (`packages/game-core/src/systems/pose.ts`)
 * computes `pose.rodLength = CIGARETTE_LENGTH * clamp01(rodRemaining)` in stage units, which is
 * viewport-independent, and publishes it twice more as `readouts.rodMm` (from the content's own
 * `lengthMm`, 70–100 mm per rod, pinned by `readouts.test.ts` and `ash-mass.test.ts`). Neither has a
 * reader in the shell.
 *
 * These checks pin the *contract* rather than the fix: the core's pose is the one owner of the rod's
 * length, and the shell must take the tube's geometry from it. They are the kind of guard this
 * repository has been bitten by twice already (`PROP_INK.ashPile`, `data-reached`) — a well-built
 * pure fact with nothing on the far side reading it.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STAGE = readFileSync(new URL('../components/SceneStage.vue', import.meta.url), 'utf8');
const POSE = readFileSync(
  new URL('../../../../packages/game-core/src/systems/pose.ts', import.meta.url),
  'utf8',
);

describe('the rod is one rod (§1)', () => {
  it('the core owns its length in stage units, so a window cannot stretch it', () => {
    // `refreshPose` is the one writer. If this file stops naming `pose.rodLength`, the rod's length
    // has moved to a second home and the landscape plank is back.
    //
    // The first version of this case was `/pose\.rodLength\s*=\s*rod/`, which still matched a line
    // that scaled the length by an outside factor (`pose.rodLength = rod * (aspect ?? 1)`) — measured
    // by mutation, the red never came and the case was decoration. So the assertion is the whole
    // assignment: what is on the right of that `=` is exactly `rod`, and `rod` is exactly the core's
    // own stage-unit length.
    const assignment = /pose\.rodLength\s*=\s*([^;]+);/.exec(POSE);
    expect(assignment, 'the core no longer writes the rod’s length').not.toBeNull();
    expect(assignment?.[1]?.trim(), 'the rod’s length is no longer just the core’s own').toBe('rod');
    expect(POSE).toMatch(/const rod\s*=\s*CIGARETTE_LENGTH\s*\*\s*clamp01\(rodRemaining\)/);
  });

  it('and the length is already published as a millimetre readout the shell can take', () => {
    // The consumer this round found missing: `readouts.rodMm` is content-owned and tested in the pure
    // layer, and `SceneStage.vue` never reads a rod length at all — it maps two anchor fractions
    // whose world span scales with the viewport.
    const runtime = readFileSync(
      new URL('../../../../packages/game-core/src/runtime.ts', import.meta.url),
      'utf8',
    );
    expect(runtime).toMatch(/rodMm:/);
  });

  it('places the burning end off the core’s pose, not off the anchor pair', () => {
    // The half that already agrees with the core: the burn line, the cherry and the ash collar read
    // `pose.pivot` / `pose.tip`. A future edit that retargets them at `body`/`ember` would make the
    // cherry follow the stretched tube instead of the simulation.
    const start = STAGE.indexOf('function placeRodEnd(');
    expect(start, 'the burning ends are no longer placed off the core’s pose').toBeGreaterThan(-1);
    const body = STAGE.slice(start, STAGE.indexOf('\n}\n', start));
    expect(body).toMatch(/pose\.pivot/);
    expect(body).toMatch(/pose\.tip/);
  });

  it('draws the tube through one place, so there is only one conversion to reason about', () => {
    // Both arms go through `canvasToWorld`; the disagreement is which *pair* each maps. The tube's
    // call is `rodBetweenInBox(body, ember, box, aspect)` (one place, one caller), and nothing in the
    // shell recomputes the rod's length or angle from `rodRemaining` beside it.
    expect(STAGE).toContain('rodBetweenInBox(body, ember, box.value, aspect.value)');
    const rodComputed = /const rod = computed\(\(\) => \{[\s\S]*?\}\);/m.exec(STAGE)?.[0] ?? '';
    expect(rodComputed).not.toMatch(/rodLength/);
  });
});

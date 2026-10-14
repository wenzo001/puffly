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
    expect(assignment?.[1]?.trim(), 'the rod’s length is no longer just the core’s own').toBe(
      'rod',
    );
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

  it('draws the tube from the core’s pose, through the burning ends’ own conversion', () => {
    // The fix of 2026-10-13, after two reverted attempts (the two attempts are recorded in SPEC). The
    // tube's centre, angle and span come from `rodGeometry(state)`, which reads `pose.pivot` /
    // `pose.tip` and maps them through `frame.pxOf(...)` → `frame.toWorld(...)` — the same conversion
    // `placeRodEnd` uses for the burn line, the cherry and the collar.
    //
    // Why that route: `toWorld`'s argument is *canvas pixels*, which is exactly what `pxOf` returns,
    // so the two are one map (verified against `canvasToWorld` for a stage fraction at all three
    // shipped shapes). Two earlier attempts mapped the pose some other way and measured worse: one
    // multiplied by `unitWorld` (the renderer's pixel unit, which saturates at `WORLD_HEIGHT` as soon
    // as the stage is wide — 3.075 / 4.000 / 4.000 per stage unit), the other multiplied the mapped
    // span by `WORLD_HEIGHT` a second time (1.7× long, pointing away from the cherry).
    expect(STAGE).toMatch(/const rodGeometry = \(state/);
    expect(STAGE).toContain('frame.pxOf(pose.pivot)');
    expect(STAGE).toContain('frame.pxOf(pose.tip)');
    expect(STAGE).toContain('frame.toWorld(');
  });

  it('sets the mesh’s own transform from that one reading, in placeRod', () => {
    // The template must not bind `position`/`rotation` of its own: if it did, the mesh would be
    // placed by the anchor pair's span while `placeRod` sized the cylinder from the pose — the exact
    // two-derivations split this round closed. (Measured live: the tube's axis and the burn line's
    // were 0.396 rad ≈ 23° apart on the same frame; after the fix, 0.0000 rad at all four shapes.)
    // (Also: the first version matched `/<TresMesh[\s\S]*?name="rod"[\s\S]*?>/`, whose lazy tail ran
    // to the file's *last* `>` and swallowed other meshes that do bind `:position` — so the case was
    // red on a correct file. The block is taken from the tag's own opening to its closing bracket.)
    const tagStart = STAGE.indexOf('<TresMesh', STAGE.indexOf('name="rod"') - 200);
    const tagEnd = STAGE.indexOf('>', STAGE.indexOf('name="rod"'));
    const rodMesh = tagStart === -1 || tagEnd === -1 ? '' : STAGE.slice(tagStart, tagEnd + 1);
    expect(rodMesh, 'the rod mesh is gone').not.toBe('');
    expect(rodMesh).toContain('name="rod"');
    expect(rodMesh).not.toMatch(/:position=/);
    expect(rodMesh).not.toMatch(/:rotation=/);
    // And the transform is written in `placeRod`, from the same reading as the span.
    const place =
      /function placeRod\(state: GameStateView \| null\)[\s\S]*?\n}\n/.exec(STAGE)?.[0] ?? '';
    expect(place).toContain('rodGeometry(state)');
    expect(place).toMatch(/mesh\.position\.set\(geometryOfRod\.mid/);
    expect(place).toMatch(/mesh\.rotation\.set\(0, 0, geometryOfRod\.angle - Math\.PI \/ 2\)/);
    expect(
      /const len = Math\.max\(1e-4, geometryOfRod\.span\);/.exec(place),
      'the tube’s length must come from the pose’s own span',
    ).not.toBeNull();
  });

  it('writes the rod’s visibility every frame, not only when it hides', () => {
    // A regression this round introduced and then caught by re-reading: taking over the transform
    // meant taking over `visible` too, and the first version wrote `mesh.visible = false` in the
    // degenerate arm with nothing ever setting it back — so a pose that degenerated for one frame
    // mid-move hid the rod for the rest of the break. The template's own `:position` never touched
    // `visible`, which is why the pre-fix code got away without it. The hide and the restore have to
    // be a pair in the same function, both driven by this frame's reading.
    const place =
      /function placeRod\(state: GameStateView \| null\)[\s\S]*?\n}\n/.exec(STAGE)?.[0] ?? '';
    expect(place).toMatch(/mesh\.visible = false/);
    expect(
      place,
      'the rod must be re-shown on the next publishable frame — a one-frame hide must not stick',
    ).toMatch(/mesh\.visible = true/);
  });
});

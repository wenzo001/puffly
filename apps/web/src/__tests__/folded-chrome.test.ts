/**
 * §10 folds the chrome after the break; the scene must not keep painting a copy of it.
 *
 * Found on 2026-10-13 by looking at what the audit called the "rested" frames: the head-up row, the
 * pill's diagram and every rail icon were rendered **crushed into the top-left corner** of the stage,
 * at roughly a tenth of their size, and they stayed there for as long as the chrome remained folded.
 * That is the state the product is in most of the time after a break, so it was the single most
 * visible thing on the resting screen.
 *
 * The cause was one guard. `App.vue` folds the chrome with `v-show`, so `.hud` / `.cta` / `.rail`
 * become `display: none`. `placeInk` hid its rigs only when `getScreenCTM()` returned `null` — which
 * is what a *detached* element returns, and **not** what a `display: none` one returns. Measured on
 * the served build: with the chrome folded, every box reads `0,0,0,0` and the matrix reads
 * `[a=1, d=1, e=0, f=0]`. So the guard passed, the group was placed at the world origin, and its
 * scale — `unitX - origin` — was 0. A group at the origin scaled by zero is the top-left cluster.
 *
 * A source read, for the reason this folder's other source reads give: apps/web has no component
 * harness and the placement pass only runs inside a live scene. What it proves is that the degenerate
 * transform is rejected before any rig is placed; it cannot prove the pixels. That half is the
 * browser measurement recorded in SPEC (2861 stray orange pixels → 0).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STAGE = readFileSync(new URL('../components/SceneStage.vue', import.meta.url), 'utf8');

/** `placeInk`, from its signature to the block that consumes the transform. */
function placeInk(): string {
  const start = STAGE.indexOf('function placeInk(');
  expect(start, 'the scene no longer mirrors DOM line art').toBeGreaterThan(-1);
  const end = STAGE.indexOf('const marks = [', start);
  expect(end, 'placeInk no longer reads its marks').toBeGreaterThan(start);
  return STAGE.slice(start, end);
}

describe('the folded chrome leaves no ink behind (§10)', () => {
  it('rejects a degenerate screen transform, not only a missing one', () => {
    const body = placeInk();
    // The transform still has to be asked for…
    expect(body).toContain('getScreenCTM()');
    // …and the hidden case has to be recognised. `ctm === null` alone is what let the cluster
    // through: a `display: none` subtree answers with a zero-translation matrix instead of null.
    expect(
      /ctm\.a\s*===\s*0|ctm\.d\s*===\s*0/.test(body),
      'placeInk must treat a zero-scaled matrix as hidden — `ctm === null` does not catch v-show',
    ).toBe(true);
  });

  it('hides every rig rather than placing it at the origin', () => {
    const body = placeInk();
    // The rejection arm has to be the same one that hides the rigs. A `return` that skipped only the
    // transform would leave the meshes visible at last frame's place.
    const guard = /const degenerate[\s\S]*?if \([\s\S]*?\)\s*\{([\s\S]*?)\n\s{2}\}/.exec(body);
    expect(guard, 'the degenerate-transform guard is gone').not.toBeNull();
    expect(guard?.[1] ?? '').toContain('rig.mesh.visible = false');
  });

  it('still places the ink when the chrome is on screen', () => {
    // The other half: the guard must not swallow the *visible* case. A zero-scaled matrix is what a
    // hidden element gives; a shown one always has a non-zero determinant, so the group is still
    // positioned and scaled from the element's own origin and unit vectors.
    const body = placeInk();
    expect(body).toContain('group.position.set(origin[0], origin[1], RUN_TEXT_Z)');
    expect(body).toContain('group.scale.set(unitX[0] - origin[0], unitY[1] - origin[1], 1)');
  });

  it('folds the chrome with a rule the scene can see (v-show, not v-if)', () => {
    // Why the fix belongs in `placeInk` and not in the shell: `App.vue` uses `v-show`, which keeps
    // the element in the tree at `display: none`. If that ever became `v-if` the element would be
    // removed and the ref would go null — a different path, and this note is where that shows up.
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    expect(app).toMatch(/v-show="chrome"/);
  });

  it('every other reader of the chrome’s geometry hides on a collapsed rect', () => {
    // The family, not the one bug. `getScreenCTM()` is not the only way this scene mirrors the DOM:
    // `fillCard`, `placeRingRig` and the pill's glow each measure the element's bounding rect, so
    // they were never exposed to the degenerate matrix. This case exists so that the *next* reader
    // added to this file is checked against whichever of the two exposures applies — a third guard
    // written on `ctm === null` alone would be the same bug under a new name.
    //
    // Verified live, not only in source, on 2026-10-13 with `tests/smoke/probe-folded.mjs`: 2 s after
    // the chrome folds, no mesh in the scene is drawn at a zero scale. The probe's own first version
    // is the cautionary tale — it counted "at the world origin with a non-zero scale" as degenerate
    // and reported 18 orphans that were all healthy instanced pools (`smoke`, `sparks`, `dust`,
    // `rain`, `ash-flakes`), which live at the origin by construction.
    for (const reader of ['function fillCard(', 'function placeRingRig(']) {
      const start = STAGE.indexOf(reader);
      expect(start, `${reader} is gone — the family it belongs to just changed shape`).toBeGreaterThan(-1);
      const end = STAGE.indexOf('\n}\n', start);
      const body = STAGE.slice(start, end === -1 ? undefined : end);
      expect(body, `${reader} must not draw a collapsed element`).toMatch(
        /rect\.width === 0 \|\| rect\.height === 0/,
      );
    }
    const glow = /const shadow = parseDropShadow[\s\S]{0,400}/.exec(STAGE)?.[0] ?? '';
    expect(glow, 'the pill’s glow must not draw a collapsed element').toMatch(
      /rect\.width === 0 \|\| rect\.height === 0/,
    );
  });
});

/**
 * §2's bottom scrim exists on two of the five core-loop screens and on no others, so the only
 * judgment worth guarding here is *which* screens: a band that followed the smoke onto 吸入 / 吐烟 /
 * 磕灰 would darken three screens the Demo never darkened, and nothing would say so out loud — the
 * picture would just read as a moodier room.
 *
 * A source read, for the usual reason in this folder: apps/web has no component harness, and the
 * placement pass only runs inside a live scene. It proves which states the gate names; it cannot
 * prove the mesh moves.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STAGE = readFileSync(new URL('../components/SceneStage.vue', import.meta.url), 'utf8');

/** The placement pass, from its own guard to the block that follows it. */
function scrimPass(): string {
  const start = STAGE.indexOf('if (scrimMesh !== null && scrimMaterial !== null)');
  expect(start, 'the scrim placement pass is gone').toBeGreaterThan(-1);
  const end = STAGE.indexOf('if (nosingMesh !== null && nosingMaterial !== null)', start);
  expect(end, 'the scrim pass runs to the end of the file').toBeGreaterThan(start);
  return STAGE.slice(start, end);
}

describe('the scrim follows §2’s screen map rather than the smoke', () => {
  it('names the three states that have a band and no fourth', () => {
    const block = scrimPass();
    for (const state of ['IDLE', 'PICKED_UP', 'LIGHTING']) {
      expect(block, `${state} no longer asks for a band`).toContain(`'${state}'`);
    }
    // The two bands are the ones the pure layer publishes — a third branch here would be a band §2
    // never drew, and dropping one would take the floor out from under the props.
    expect(block).toContain('SCRIM.lighting');
    expect(block).toContain('SCRIM.idle');
    // Everything else — the rod at the mouth, the rod put out — lands on the null arm.
    expect(block).toMatch(/:\s*null;/);
  });

  it('has no state id on the dark side that §2 gives a band', () => {
    // A state appearing twice would mean it is both compared for and fallthrough-lit; §2's 吸入 /
    // 吐烟 / 磕灰 screens have nothing like a band, so their states must not be named at all.
    const named = new Set([...scrimPass().matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]));
    for (const state of ['PUFFING', 'BURNING', 'RESTING', 'ASH_READY', 'EXTINGUISHING']) {
      expect(named.has(state), `${state} must not carry a band`).toBe(false);
    }
  });

  it('takes the band’s own numbers from the pure layer, not from literals in the shell', () => {
    // The screen's share and alpha only exist in `SCRIM`, so the Demo's figures have one home.
    expect(scrimPass()).not.toMatch(/share:\s*0?\.\d/);
    expect(scrimPass()).not.toMatch(/opacity = 0?\.\d/);
  });
});

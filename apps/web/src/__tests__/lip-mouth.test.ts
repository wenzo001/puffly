/**
 * The abstract mouth (§puffAnimations) as the scene gates it: lips and the airflow column exist
 * only while a draw is actually being taken, and a 品鉴型 rod (savourMs > 0) never gets them even
 * though its action still rolls. The S3 stage ring follows the same draw-active gate.
 *
 * Geometry itself is owned by the pure `game-scene/lips` module (lips.test.ts); this file is the
 * wiring source-read, because the scene has no harness that drives a browser here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SCENE = readFileSync(new URL('../components/SceneStage.vue', import.meta.url), 'utf8');

/** The placement block, from its gate to its probe report. */
function placeMouthBlock(): string {
  const start = SCENE.indexOf('function placeMouth(');
  expect(start).toBeGreaterThan(-1);
  const end = SCENE.indexOf('\n}\n', start);
  return SCENE.slice(start, end);
}

/** The stage ring placement block. */
function placeRingBlock(): string {
  const start = SCENE.indexOf('function placeStageRing(');
  expect(start).toBeGreaterThan(-1);
  const end = SCENE.indexOf('\n}\n', start);
  return SCENE.slice(start, end);
}

describe('the mouth only exists during an inhaled draw', () => {
  it('gates on the PUFFING state, a visible pose and a rolled action', () => {
    const block = placeMouthBlock();
    expect(block).toContain("state.cigarette.state !== 'PUFFING'");
    expect(block).toContain('state.cigarette.pose.visible');
    expect(block).toContain('puff.lipAction === null');
  });

  it('asks showsLipLine before drawing anything, with the readout’s own savourMs', () => {
    expect(SCENE).toContain('showsLipLine(state.cigarette.readouts.savourMs)');
    // The gate is in the placement block itself, not in a helper that might stop being called.
    expect(placeMouthBlock()).toContain('showsLipLine');
  });

  it('reads the action and its tier from the state the engine publishes', () => {
    const block = placeMouthBlock();
    expect(block).toContain('puff.lipAction');
    expect(block).toContain('puffTierFor(puff.heldMs)');
    expect(block).toContain('lipArt(action)');
  });

  it('reports exactly what a browser check needs from the probe', () => {
    const block = placeMouthBlock();
    expect(block).toMatch(/probe\.lip = \{[\s\S]*visible: true/);
    expect(block).toContain("kind: 'savor'");
    expect(block).toContain("kind: 'inhale'");
    expect(block).toContain('columnWidthPx');
  });
});

describe('the S3 stage ring follows the same gate', () => {
  it('is the Demo’s 104 / 46 / 8 geometry and shows only while puffing', () => {
    const block = placeRingBlock();
    expect(block).toContain("state.cigarette.state !== 'PUFFING'");
    expect(SCENE).toContain('new THREE.RingGeometry(42, 50, 64)');
    expect(SCENE).toContain('opacity: 0.22');
    // The arc ember is set imperatively so the text-colour guard does not read it as a word.
    expect(SCENE).not.toContain("new THREE.Color('#FF8A3D')");
    expect(SCENE).toContain('1, 0.541, 0.239, THREE.SRGBColorSpace');
    expect(block).toContain('puff.progress');
    expect(block).toContain('puff.heldMs');
  });

  it('positions the ring at the rod body and scales its CSS px to the stage', () => {
    const block = placeRingBlock();
    expect(block).toContain('state.anchors.body');
    expect(block).toContain('pxToWorld(1)');
    expect(block).toContain('const seconds = (puff.heldMs / 1000).toFixed(1)');
  });
});

describe('the new geometry is hooked into the frame', () => {
  it('places glyph icons, the ring and the mouth from the one step loop', () => {
    const step = SCENE.slice(
      SCENE.indexOf('function step('),
      SCENE.indexOf('\n}\n', SCENE.indexOf('function step(')),
    );
    expect(step).toContain('placeGlyphIcons()');
    expect(step).toContain('placeStageRing(state)');
    expect(step).toContain('placeMouth(state)');
  });

  it('mirrors filled rects as well as strokes when painting Demo icons', () => {
    // The Demo icons are mostly rounded rects; a mirror that only does paths would paint blank.
    expect(SCENE).toContain("'path, line, polyline, circle, rect'");
  });
});

import { describe, expect, it } from 'vitest';
import {
  canvasToWorld,
  parseAim,
  parseStageBox,
  rodBetweenInBox,
  rodEnds,
  stageWorldSize,
  WORLD_HEIGHT,
} from '../stage';

/**
 * The rod's angle and length are judged through `rodBetweenInBox`, which is the one the scene calls
 * (`SceneStage.vue`'s `rod(...)`). It used to be judged with `rodBetween`, a twin that takes no stage
 * box — that twin had three cases and no production reader, so the numbers actually reaching the
 * screen had none (#143). Over a full box these two are the same arithmetic, which is why the
 * expectations below are unchanged; the last case is the one only the in-box variant can answer.
 */
const FULL_BOX = { x: 0, y: 0, width: 1, height: 1 };

describe('the scene reads the shell’s own mirror, and nothing else', () => {
  it('parses the five points out of the data-aim string', () => {
    const aim = parseAim(
      'body:0.6,0.4 ember:0.7,0.35 lighter:0.1,0.8 ashtray:0.5,0.9 pack:0.2,0.85',
    );
    expect(Object.keys(aim).sort()).toEqual(['ashtray', 'body', 'ember', 'lighter', 'pack']);
    expect(aim.body).toEqual({ x: 0.6, y: 0.4 });
  });

  it('ignores junk instead of inventing a point at (0,0)', () => {
    const aim = parseAim('body:0.6,0.4 nonsense:x,y pack:0.2,0.85 later:0.9,0.9');
    expect(Object.keys(aim).sort()).toEqual(['body', 'pack']);
  });

  it('maps fractions to world units with y flipped, so the table is not upside down', () => {
    // Written through the box rather than the old full-canvas helper: over a full box the two are the
    // same arithmetic, and the box version is the one the scene actually calls.
    const centre = canvasToWorld({ x: 0.5, y: 0.5 }, FULL_BOX, 1);
    expect(centre).toEqual([0, 0, 0]);
    const top = canvasToWorld({ x: 0.5, y: 0.25 }, FULL_BOX, 1);
    expect(top[1]).toBeCloseTo(WORLD_HEIGHT * 0.25, 6);
    const right = canvasToWorld({ x: 0.75, y: 0.5 }, FULL_BOX, 2);
    expect(right[0]).toBeCloseTo(WORLD_HEIGHT * 2 * 0.25, 6);
  });

  it('takes the rod’s angle from the two published points', () => {
    const straight = rodBetweenInBox({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, FULL_BOX, 1);
    expect(straight.angle).toBeCloseTo(0, 6);
    // The pair is (45 % of the rod, tip) and the mesh is the whole rod, so its centre is the rod's
    // own middle. The first version centred it on the pair's midpoint and hung it ~0.15 world past
    // the tip — measured live, the standing ash (anchored at the true ember) read as floating
    // mid-rod. This pins both the centre and the tip end.
    const pivot = rodEnds({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }).pivot;
    const a = canvasToWorld(pivot, FULL_BOX, 1);
    const b = canvasToWorld({ x: 0.6, y: 0.5 }, FULL_BOX, 1);
    expect(straight.mid[0]).toBeCloseTo((a[0] + b[0]) / 2, 6);
    expect(straight.length).toBeCloseTo(Math.hypot(b[0] - a[0], b[1] - a[1]), 6);
    expect(straight.mid[0] + Math.cos(straight.angle) * (straight.length / 2)).toBeCloseTo(b[0], 6);
    const rising = rodBetweenInBox({ x: 0.5, y: 0.6 }, { x: 0.5, y: 0.4 }, FULL_BOX, 1);
    expect(rising.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('a rod inside a letterboxed stage is the box’s rod, not the canvas’s', () => {
    // The portrait letterbox the core publishes: the stage is shorter than the canvas, so a stage
    // fraction covers more world than a canvas fraction does, and a rod built through the canvas
    // would come out short. A box that merely sits centred inside the canvas changes nothing here
    // (the two maps coincide), so the height is what makes this case say anything.
    const box = { x: 0, y: 0.192, width: 1, height: 0.616 };
    const aspect = 390 / 844;
    const body = { x: 0.4, y: 0.5 };
    const ember = { x: 0.6, y: 0.5 };
    const inBox = rodBetweenInBox(body, ember, box, aspect);
    const a = canvasToWorld(rodEnds(body, ember).pivot, box, aspect);
    const b = canvasToWorld(ember, box, aspect);
    expect(inBox.length).toBeCloseTo(Math.hypot(b[0] - a[0], b[1] - a[1]), 6);
    expect(inBox.mid[1]).toBeCloseTo((a[1] + b[1]) / 2, 6);
    expect(inBox.mid[0] + Math.cos(inBox.angle) * (inBox.length / 2)).toBeCloseTo(b[0], 6);
    expect(inBox.length).toBeGreaterThan(
      rodBetweenInBox(body, ember, FULL_BOX, aspect).length * 1.5,
    );
  });

  it('a rod has length even when the two points coincide', () => {
    const degenerate = rodBetweenInBox({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, FULL_BOX, 1);
    expect(Number.isFinite(degenerate.length)).toBe(true);
    expect(degenerate.length).toBeLessThan(0.01);
  });
});

describe('the stage box is what makes a fraction land where the core says', () => {
  it('refuses a box it cannot read rather than pretending the canvas is the stage', () => {
    expect(parseStageBox('0,0.1,1,0.7')).toEqual({ x: 0, y: 0.1, width: 1, height: 0.7 });
    expect(parseStageBox('junk')).toBeNull();
    expect(parseStageBox('0,0,0,1')).toBeNull();
    expect(parseStageBox('0,0,1')).toBeNull();
  });

  it('puts the stage centre at the world origin whatever the letterbox', () => {
    const box = { x: 0.1, y: 0.2, width: 0.8, height: 0.5 };
    const centre = canvasToWorld({ x: 0.5, y: 0.45 }, box, 0.5);
    expect(centre[0]).toBeCloseTo(0, 6);
    expect(centre[1]).toBeCloseTo(0, 6);
  });

  it('lands the box’s own edges on the stage’s world edges', () => {
    // A 3:4 stage inside a 390×844 canvas: full width, and a letterbox top and bottom.
    const box = { x: 0, y: 0.192, width: 1, height: 0.616 };
    const viewportAspect = 390 / 844;
    const topLeft = canvasToWorld({ x: 0, y: 0.192 }, box, viewportAspect);
    const bottomRight = canvasToWorld({ x: 1, y: 0.808 }, box, viewportAspect);
    const size = stageWorldSize(box, viewportAspect);
    expect(topLeft[1]).toBeCloseTo(size.height / 2, 6);
    expect(bottomRight[1]).toBeCloseTo(-size.height / 2, 6);
    expect(topLeft[0]).toBeCloseTo(-size.width / 2, 6);
    expect(bottomRight[0]).toBeCloseTo(size.width / 2, 6);
    // And the stage is 3:4, because that is what the box says it is — not what a camera assumed.
    expect(size.width / size.height).toBeCloseTo(0.75, 3);
  });

  it('sizes the camera frame from the box, not from the canvas', () => {
    const size = stageWorldSize({ x: 0, y: 0, width: 0.75, height: 1 }, 0.5);
    expect(size.height).toBe(WORLD_HEIGHT);
    expect(size.width).toBeCloseTo(WORLD_HEIGHT * 0.75 * 0.5, 6);
  });
});

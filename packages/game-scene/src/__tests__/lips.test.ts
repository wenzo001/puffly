/**
 * The abstract mouth, §puffAnimations: the geometry has to be lips and air and nothing that could
 * grow into a face. Every deformation the nine actions name is a single-digit pixel or a four
 * degree tilt, the column grows with the tier and with each action's own multiplier, and the
 * special vocabulary (side bend, wisps, nose wrinkles, a broken column, fade timing) is exactly
 * where the action's anim string put it.
 */
import { LIP_ACTIONS, type LipAction } from '@puffly/game-core';
import { describe, expect, it } from 'vitest';
import {
  BASE_HALF_WIDTH_PX,
  COLUMN_BASE_HALF_WIDTH_PX,
  COLUMN_LENGTH_PX,
  lipArt,
  type Pt,
} from '../lips';

/** Every point the art emits — lips, strokes, column geometry is bounded against. */
function points(art: ReturnType<typeof lipArt>): Pt[] {
  return [...art.lip.upper, ...art.lip.lower, ...art.lip.strokes.flatMap((s) => s.points)];
}

describe('the mouth is two lip curves and a column, never a face', () => {
  it('emits exactly two curves and marks only from the whitelist', () => {
    for (const action of LIP_ACTIONS) {
      const art = lipArt(action);
      expect(art.lip.upper.length).toBeGreaterThan(3);
      expect(art.lip.lower.length).toBeGreaterThan(3);
      for (const stroke of art.lip.strokes) {
        expect(['bead', 'wisp', 'wrinkle']).toContain(stroke.kind);
      }
    }
  });

  it('keeps every coordinate inside the small box the 26 px glyph leaves', () => {
    for (const action of LIP_ACTIONS) {
      for (const p of points(lipArt(action))) {
        expect(Math.abs(p.x), `${action.id} x`).toBeLessThanOrEqual(BASE_HALF_WIDTH_PX + 6);
        expect(p.y, `${action.id} y`).toBeGreaterThanOrEqual(-10);
        expect(p.y, `${action.id} y`).toBeLessThanOrEqual(COLUMN_LENGTH_PX);
      }
    }
  });

  it('paints the lip in the glyph ink and the column in the Demo’s smoke grey', () => {
    for (const action of LIP_ACTIONS) {
      const art = lipArt(action);
      expect([...art.lipRgb]).toEqual([237, 229, 218]);
      expect(art.lipAlpha).toBeLessThanOrEqual(1);
      expect([...art.columnRgb]).toEqual([207, 198, 188]);
      expect(art.columnAlpha[0]).toBe(0.2);
      expect(art.columnAlpha[1]).toBe(0.06);
    }
  });
});

const byId = Object.fromEntries(LIP_ACTIONS.map((a) => [a.id, a])) as Record<string, LipAction>;

describe('each action draws exactly what its anim string says', () => {
  it('S1 内收: narrower lips, straight column, 0.3 s to the top', () => {
    const art = lipArt(byId['S1']!);
    const x = art.lip.upper.map((p) => Math.abs(p.x));
    expect(Math.max(...x)).toBeLessThan(BASE_HALF_WIDTH_PX);
    expect(art.column.segments).toHaveLength(1);
    expect(art.column.bendPx).toBe(0);
    expect(art.column.fadeInMs).toBe(300);
  });

  it('S2 抿唇: flatter upper lip and a bead', () => {
    const art = lipArt(byId['S2']!);
    expect(art.lip.strokes.some((s) => s.kind === 'bead')).toBe(true);
    const upperTop = Math.min(...art.lip.upper.map((p) => p.y));
    const base = lipArt(byId['S1']!);
    const baseTop = Math.min(...base.lip.upper.map((p) => p.y));
    expect(upperTop).toBeGreaterThan(baseTop);
  });

  it('S3 偏唇: a four-degree tilt, an 8 px offset and a side-bent column', () => {
    const art = lipArt(byId['S3']!);
    expect(art.tiltDeg).toBe(-4);
    expect(art.column.offsetPx).toBe(8);
    expect(art.column.bendPx).toBe(8);
  });

  it('M1 收唇: narrowed lips with side wisps, column ×1.4', () => {
    const art = lipArt(byId['M1']!);
    expect(art.lip.strokes.filter((s) => s.kind === 'wisp')).toHaveLength(2);
    expect(art.column.segments[0]?.w0).toBeCloseTo(COLUMN_BASE_HALF_WIDTH_PX.M * 1.4, 6);
  });

  it('M2 撅唇: the lower lip comes out and the column twists sideways', () => {
    const art = lipArt(byId['M2']!);
    const s = lipArt(byId['S1']!);
    const lowerArt = Math.max(...art.lip.lower.map((p) => p.y));
    const lowerBase = Math.max(...s.lip.lower.map((p) => p.y));
    expect(lowerArt).toBeGreaterThan(lowerBase);
    expect(art.column.bendPx).toBe(6);
  });

  it('M3 深吸: the tightest narrowing and the strongest wisps at ×1.8', () => {
    const art = lipArt(byId['M3']!);
    const m1 = lipArt(byId['M1']!);
    const minX = Math.min(...art.lip.upper.map((p) => Math.abs(p.x)));
    const m1MinX = Math.min(...m1.lip.upper.map((p) => Math.abs(p.x)));
    expect(minX).toBeLessThanOrEqual(m1MinX);
    expect(art.column.segments[0]?.w0).toBeCloseTo(COLUMN_BASE_HALF_WIDTH_PX.M * 1.8, 6);
    expect(art.lip.strokes.find((s) => s.kind === 'wisp')).toBeDefined();
  });

  it('L1 尽吸: flattened seam and the two nose wrinkles at ×2.2', () => {
    const art = lipArt(byId['L1']!);
    expect(art.lip.strokes.filter((s) => s.kind === 'wrinkle')).toHaveLength(2);
    expect(art.column.segments[0]?.w0).toBeCloseTo(COLUMN_BASE_HALF_WIDTH_PX.L * 2.2, 6);
  });

  it('L2 长啸: the widest column diverges at its far end', () => {
    const art = lipArt(byId['L2']!);
    expect(art.lip.strokes.some((s) => s.kind === 'bead')).toBe(true);
    const seg = art.column.segments[0];
    expect(seg).toBeDefined();
    expect(seg?.w1).toBeGreaterThan(seg?.w0 ?? 0);
  });

  it('L3 顿口: the column and the lips break into two stepped pieces', () => {
    const art = lipArt(byId['L3']!);
    expect(art.column.segments).toHaveLength(2);
    expect(art.lip.segmented).toBe(true);
    const [first, second] = art.column.segments;
    expect(second?.y0 ?? 0).toBeGreaterThan(first?.y1 ?? 0);
  });
});

describe('the column is the tier', () => {
  it('grows its base width strictly S < M < L before any action multiplier', () => {
    // S3 carries no multiplier or word-scale, so it is the tier’s own base. M1 and L1 do carry
    // multipliers, which are divided back out here.
    const s = lipArt(byId['S3']!).column.segments[0]?.w0 ?? 0;
    const m = lipArt(byId['M1']!);
    const mBase = (m.column.segments[0]?.w0 ?? 0) / 1.4;
    const l = lipArt(byId['L1']!);
    const lBase = (l.column.segments[0]?.w0 ?? 0) / 2.2;
    expect(s).toBe(COLUMN_BASE_HALF_WIDTH_PX.S);
    expect(mBase).toBeCloseTo(COLUMN_BASE_HALF_WIDTH_PX.M, 6);
    expect(lBase).toBeCloseTo(COLUMN_BASE_HALF_WIDTH_PX.L, 6);
    expect(s).toBeLessThan(mBase);
    expect(mBase).toBeLessThan(lBase);
  });

  it('widens toward its far end on every action but L3 keeps the gap', () => {
    for (const action of LIP_ACTIONS) {
      const art = lipArt(action);
      for (const seg of art.column.segments) {
        expect(seg.w1).toBeGreaterThanOrEqual(seg.w0);
        expect(seg.y1).toBeGreaterThan(seg.y0);
      }
      const last = art.column.segments.at(-1);
      expect(last?.y1).toBe(COLUMN_LENGTH_PX);
    }
  });
});

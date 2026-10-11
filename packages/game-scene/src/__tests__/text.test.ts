import { describe, expect, it } from 'vitest';
import { layoutText, parseAtlas } from '../text';

const ATLAS = parseAtlas({
  cell: 64,
  columns: 4,
  rows: 2,
  readout: '0123456789%',
  ascent: 0.86,
  descent: 0.14,
  metrics: {
    0: { col: 0, row: 0, w: 64, h: 64, advance: 0.5 },
    1: { col: 1, row: 0, w: 64, h: 64, advance: 0.5 },
    ':': { col: 2, row: 0, w: 64, h: 64, advance: 0.3 },
    烟: { col: 3, row: 1, w: 64, h: 64, advance: 1 },
  },
});

describe('an atlas is refused where it is wrong, not where it is used', () => {
  it('takes a well-formed one', () => {
    expect(ATLAS.columns).toBe(4);
    expect(ATLAS.metrics['烟']?.advance).toBe(1);
  });

  it('refuses a metric outside the grid', () => {
    expect(() =>
      parseAtlas({
        cell: 64,
        columns: 2,
        rows: 2,
        readout: '0',
        metrics: { x: { col: 5, row: 0, w: 64, h: 64, advance: 1 } },
      }),
    ).toThrow(/bad metric/);
  });

  it('refuses a bad cell and a missing metrics table', () => {
    expect(() => parseAtlas({ cell: 0, columns: 1, rows: 1, readout: '0', metrics: {} })).toThrow(
      /bad cell/,
    );
    expect(() => parseAtlas({ cell: 64, columns: 1, rows: 1, readout: '0' })).toThrow(
      /bad metrics/,
    );
  });

  it('refuses an atlas that does not say where its baseline sits', () => {
    // The whole em box is one cell, so the reader has to be told how the cell divides: a bake that
    // puts the baseline on the cell's bottom edge leaves the descender band outside the cell, and
    // the tails of `g p y` are never sampled. That bake is what shipped until 2026-10-11 (#146),
    // and the atlas that came out of it still reads as a valid grid — so the number has to be
    // demanded here rather than assumed.
    expect(() =>
      parseAtlas({
        cell: 64,
        columns: 1,
        rows: 1,
        readout: '0',
        metrics: { '0': { col: 0, row: 0, w: 64, h: 64, advance: 0.5 } },
      }),
    ).toThrow(/baseline/);
    expect(() =>
      parseAtlas({
        cell: 64,
        columns: 1,
        rows: 1,
        readout: '0',
        ascent: 0.86,
        descent: -0.14,
        metrics: { '0': { col: 0, row: 0, w: 64, h: 64, advance: 0.5 } },
      }),
    ).toThrow(/baseline/);
    // The em box has to fit the cell: an ascent+descent over one em is a font this grid cannot
    // hold, and the refusal has to name it instead of quietly clipping the tails again.
    expect(() =>
      parseAtlas({
        cell: 64,
        columns: 1,
        rows: 1,
        readout: '0',
        ascent: 1.1,
        descent: 0.3,
        metrics: { '0': { col: 0, row: 0, w: 64, h: 64, advance: 0.5 } },
      }),
    ).toThrow(/em box/);
  });
});

describe('a run of text is a list of glyph quads on one baseline', () => {
  it('advances the pen by each glyph and reports the run width', () => {
    const layout = layoutText('00:00', ATLAS, 10);
    expect(layout.quads.map((quad) => quad.char)).toEqual(['0', '0', ':', '0', '0']);
    expect(layout.missing).toEqual([]);
    // Two 0.5em glyphs, a 0.3em colon, two more 0.5em glyphs — the pen's end is the width.
    expect(layout.width).toBeCloseTo(10 * (0.5 + 0.5 + 0.3 + 0.5 + 0.5), 6);
    expect(layout.quads[2]?.x).toBeCloseTo(10, 6);
  });

  it('keeps every quad inside the atlas and on its own cell', () => {
    const layout = layoutText('烟:', ATLAS, 10);
    for (const quad of layout.quads) {
      expect(quad.u0).toBeGreaterThanOrEqual(0);
      expect(quad.u1).toBeLessThanOrEqual(1);
      expect(quad.v0).toBeGreaterThanOrEqual(0);
      expect(quad.v1).toBeLessThanOrEqual(1);
    }
    const smoke = layout.quads[0];
    expect(smoke?.v0).toBeCloseTo(64 / 128, 6);
    expect(smoke?.u0).toBeCloseTo(192 / 256, 6);
  });

  it('covers the whole em box, so a descender is inside what gets sampled', () => {
    // The cell IS the em box, so the quad that samples it has to run from the baseline down by the
    // descent and up by the ascent. A quad whose bottom sits ON the baseline — which is what shipped
    // until 2026-10-11 — samples a cell whose descender band is empty, and `g p y` lose their tails
    // on every screen (#146, found by looking at the README picture).
    const layout = layoutText('0', ATLAS, 10);
    const quad = layout.quads[0];
    expect(quad?.y).toBeCloseTo(-10 * 0.14, 6);
    expect(quad?.height).toBeCloseTo(10 * (0.86 + 0.14), 6);
    // The visible ink does not move: the top edge is still one ascent above the baseline, so every
    // label already placed against a DOM box keeps its place and only the tails are added.
    expect((quad?.y ?? 0) + (quad?.height ?? 0)).toBeCloseTo(10 * 0.86, 6);
  });

  it('moves the pen for a space without drawing anything', () => {
    const layout = layoutText('0 0', ATLAS, 10);
    expect(layout.quads).toHaveLength(2);
    expect(layout.quads[1]?.x).toBeCloseTo(10 * (0.5 + 0.32), 6);
  });

  it('reports a character the atlas has no glyph for, and still lays the rest out', () => {
    const layout = layoutText('0X0', ATLAS, 10);
    expect(layout.missing).toEqual(['X']);
    expect(layout.quads).toHaveLength(2);
    expect(layout.quads[1]?.x).toBeCloseTo(10 * (0.5 + 0.5), 6);
  });
});

/**
 * Words, as quads on a baked atlas.
 *
 * The 3D layer cannot draw an HTML string on a plane, and it may not reach for a canvas — so the
 * glyphs are baked at build time from the same copy table the interface already uses
 * (`apps/web/scripts/bake-atlas.mjs`), and this module turns a string into the rectangles that
 * atlas answers for. No font is parsed at runtime and no glyph in the atlas is out of reach of the
 * copy table, which is what keeps the atlas closed (§7 of the scene spec).
 */

export interface GlyphMetric {
  col: number;
  row: number;
  w: number;
  h: number;
  /** The pen movement for this glyph, in ems. */
  advance: number;
  /**
   * The outline box the bake drew, in ems relative to the baseline. The product does not need it;
   * `atlas-ink.test.ts` holds the shipped pixels against this claim, which is the only way to catch
   * a bake that clips a descender or spills one into the cell below.
   */
  yMin?: number;
  yMax?: number;
}

export interface GlyphAtlas {
  /** Cell size in atlas pixels; every cell is square, and it is the em box. */
  cell: number;
  columns: number;
  rows: number;
  /**
   * Where the baseline sits inside a cell, in ems down from the cell's top. This is the one number
   * that decides whether a descender is inside what gets sampled: a bake that put the baseline on
   * the cell's bottom edge drew `g p y` without their tails, and every consumer agreed with it
   * (#146). The bake writes it, the reader refuses an atlas that does not say.
   */
  ascent: number;
  /** How far the font's own ink goes below that baseline, in ems. */
  descent: number;
  /**
   * The characters the figures on screen are formatted with, as the bake wrote them down. The copy
   * table never spells `2 / 12` or `100%` — those are built at runtime — so the atlas names this
   * alphabet itself and a guard checks this file's own claim.
   */
  readout: string;
  metrics: Record<string, GlyphMetric>;
}

/** One glyph placed on the baseline, in ems relative to the run's origin. */
export interface GlyphQuad {
  char: string;
  /** Left edge, in ems from the run's origin. */
  x: number;
  /**
   * The quad's bottom edge, in ems relative to the baseline: below it by whatever the cell has
   * under the baseline, which is where a `g` keeps its tail.
   */
  y: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TextLayout {
  quads: GlyphQuad[];
  /** Width of the run in ems. */
  width: number;
  /** Characters the atlas has no glyph for — empty on every shipped string, and a smell if not. */
  missing: string[];
}

/** The atlas as JSON hands it over, checked once so a bad bake fails at the boundary and not later. */
export function parseAtlas(json: unknown): GlyphAtlas {
  const data = json as Partial<GlyphAtlas> | null;
  if (data === null || typeof data !== 'object') throw new Error('atlas: not an object');
  const { cell, columns, rows, metrics, readout, ascent, descent } = data;
  if (typeof cell !== 'number' || cell <= 0) throw new Error('atlas: bad cell');
  if (typeof columns !== 'number' || typeof rows !== 'number') throw new Error('atlas: bad grid');
  if (typeof readout !== 'string') throw new Error('atlas: bad readout alphabet');
  if (metrics === undefined || typeof metrics !== 'object') throw new Error('atlas: bad metrics');
  for (const [char, metric] of Object.entries(metrics)) {
    if (
      typeof metric?.col !== 'number' ||
      typeof metric.row !== 'number' ||
      typeof metric.advance !== 'number' ||
      metric.col < 0 ||
      metric.col >= columns ||
      metric.row < 0 ||
      metric.row >= rows
    ) {
      throw new Error(`atlas: bad metric for ${JSON.stringify(char)}`);
    }
  }
  // Last, so an atlas that is wrong about its glyphs reports that first.
  if (typeof ascent !== 'number' || typeof descent !== 'number' || ascent <= 0 || descent <= 0) {
    throw new Error('atlas: bad baseline — re-bake with the ascent and the descent written down');
  }
  if (ascent + descent > 1.0001) {
    throw new Error('atlas: the em box does not fit one cell');
  }
  return { cell, columns, rows, readout, ascent, descent, metrics };
}

/**
 * One line of text, laid out left to right on the baseline.
 *
 * `em` is the scale everything is expressed in: the caller passes the world size it wants one em to
 * be, and the quads come back in the same units. A missing glyph advances by half an em and is
 * reported — silence would put a hole in a number and nobody would hear about it.
 *
 * `v` runs with the image (0 at the top row), so the texture has to be loaded with `flipY = false`;
 * the alternative — flipping every quad's v here — would be the same decision made once per glyph.
 */
export function layoutText(text: string, atlas: GlyphAtlas, em: number): TextLayout {
  const quads: GlyphQuad[] = [];
  const missing: string[] = [];
  let pen = 0;
  for (const char of text) {
    if (char === ' ') {
      pen += 0.32 * em;
      continue;
    }
    const metric = atlas.metrics[char];
    if (metric === undefined) {
      missing.push(char);
      pen += 0.5 * em;
      continue;
    }
    // One cell is one em: the bake drew each glyph at `cellPx / unitsPerEm`, so the cell IS the em
    // box. The quad is a full cell — which means its bottom edge is *below* the baseline by whatever
    // the cell has under it, or the tail of a `g` is outside what gets sampled. The pen still moves
    // by the glyph's own advance, like a font.
    quads.push({
      char,
      x: pen,
      y: -(1 - atlas.ascent) * em,
      width: em,
      height: em,
      u0: (metric.col * atlas.cell) / (atlas.columns * atlas.cell),
      v0: (metric.row * atlas.cell) / (atlas.rows * atlas.cell),
      u1: ((metric.col + 1) * atlas.cell) / (atlas.columns * atlas.cell),
      v1: ((metric.row + 1) * atlas.cell) / (atlas.rows * atlas.cell),
    });
    pen += metric.advance * em;
  }
  return { quads, width: pen, missing };
}

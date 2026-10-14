/**
 * The baked atlas has to contain the whole glyph, not just the part above the baseline.
 *
 * This one was found by looking at a screenshot: on the shipped build "Language" read as "Langaaae",
 * "Draw length" as "Draw lenath", and the ash readout `0g` as `0α` — every letter with a descender
 * had lost its tail (#146). The cause was in the bake, not the layout: it put the baseline on the
 * bottom edge of a 64 px cell, so the 13.4 % of the em below the baseline was drawn outside the
 * cell — where it was both lost and spilled into the cell below. A math test cannot see that,
 * because the math was self-consistent; only the pixels know what a bake actually drew.
 *
 * So this file decodes the committed PNG (8-bit RGBA, non-interlaced — it refuses anything else
 * rather than mis-reading it) and holds each cell's ink against what the bake itself claims about
 * that glyph.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const JSON_PATH = new URL('../../public/atlas/glyphs.json', import.meta.url);
const PNG_PATH = new URL('../../public/atlas/glyphs.png', import.meta.url);

/** A decoded image: one alpha byte per pixel, row-major. */
interface Raw {
  width: number;
  height: number;
  alpha: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * The smallest reader that can be trusted here: 8-bit RGBA, non-interlaced, one filter byte per
 * row. Anything else throws, because a decoder that silently mis-reads a palette or 16-bit file
 * would turn this whole check into a pass over noise.
 */
function decodePng(bytes: Buffer): Raw {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let pos = 8;
  let idat = Buffer.alloc(0);
  let width = 0;
  let height = 0;
  let depth = -1;
  let color = -1;
  let interlace = -1;
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.subarray(pos + 4, pos + 8).toString('ascii');
    const body = pos + 8;
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(body);
      height = bytes.readUInt32BE(body + 4);
      depth = bytes[body + 8] ?? -1;
      color = bytes[body + 9] ?? -1;
      interlace = bytes[body + 12] ?? -1;
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, bytes.subarray(body, body + length)]);
    } else if (type === 'IEND') {
      break;
    }
    pos = body + length + 4;
  }
  if (depth !== 8 || color !== 6 || interlace !== 0) {
    throw new Error(
      `this reader only knows 8-bit RGBA non-interlaced PNGs, got depth=${String(
        depth,
      )} colour=${String(color)} interlace=${String(interlace)}`,
    );
  }
  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(idat);
  if (raw.length !== height * (stride + 1)) throw new Error('PNG: unexpected raw length');
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? -1;
    if (filter < 0 || filter > 4) throw new Error(`PNG: unknown filter ${String(filter)}`);
    const line = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const byte = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= bpp ? (line[x - bpp] ?? 0) : 0;
      const b = prev !== null ? (prev[x] ?? 0) : 0;
      const c = prev !== null && x >= bpp ? (prev[x - bpp] ?? 0) : 0;
      const add =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? (a + b) >> 1
                : paeth(a, b, c);
      line[x] = (byte + add) & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = pixels[i * bpp + 3] ?? 0;
  return { width, height, alpha };
}

interface AtlasJson {
  cell: number;
  columns: number;
  rows: number;
  ascent?: number;
  descent?: number;
  metrics: Record<
    string,
    { col: number; row: number; yMin?: number; yMax?: number; notdef?: boolean }
  >;
}

const atlasJson = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as AtlasJson;
const png = decodePng(readFileSync(PNG_PATH));

/** The cell's own ink rows, and how many of them sit at or below the baseline. */
function cellInk(metric: AtlasJson['metrics'][string]): {
  rows: number[];
  below: number;
} {
  const cell = atlasJson.cell;
  const baseline = Math.round(cell * (atlasJson.ascent ?? 1));
  const x0 = metric.col * cell;
  const y0 = metric.row * cell;
  const rows: number[] = [];
  for (let r = 0; r < cell; r++) {
    let hit = false;
    for (let x = 0; x < cell && !hit; x++) {
      hit = (png.alpha[(y0 + r) * png.width + x0 + x] ?? 0) > 16;
    }
    if (hit) rows.push(r);
  }
  return { rows, below: rows.filter((r) => r >= baseline).length };
}

/** Every inked pixel of a cell, as `row:column` pairs — two cells match only shape for shape. */
function cellSignature(metric: AtlasJson['metrics'][string]): string {
  const cell = atlasJson.cell;
  const x0 = metric.col * cell;
  const y0 = metric.row * cell;
  const hits: string[] = [];
  for (let r = 0; r < cell; r++) {
    for (let x = 0; x < cell; x++) {
      if ((png.alpha[(y0 + r) * png.width + x0 + x] ?? 0) > 16) hits.push(`${r}:${x}`);
    }
  }
  return hits.join(',');
}

describe('the baked atlas keeps the whole em box', () => {
  it('says where its baseline is, in the file the app loads', () => {
    // Without this number the reader cannot know whether the cell it samples has a descender band
    // in it at all — which is exactly how the shipped atlas lost one.
    expect(atlasJson.ascent, 're-bake: node apps/web/scripts/bake-atlas.mjs').toBeTypeOf('number');
    expect(atlasJson.descent, 're-bake: node apps/web/scripts/bake-atlas.mjs').toBeTypeOf('number');
    expect(atlasJson.ascent ?? 0).toBeGreaterThan(0);
    expect(atlasJson.descent ?? 0).toBeGreaterThan(0);
    expect((atlasJson.ascent ?? 0) + (atlasJson.descent ?? 0)).toBeLessThanOrEqual(1.0001);
  });

  it('has ink below the baseline for a letter with a tail, and none for one without', () => {
    const g = atlasJson.metrics['g'];
    const a = atlasJson.metrics['a'];
    if (g === undefined || a === undefined) throw new Error('the atlas has no g or a');
    const gInk = cellInk(g);
    const aInk = cellInk(a);
    const read = (char: string, ink: { rows: number[]; below: number }): string =>
      `${char}: ink rows ${String(ink.rows[0])}..${String(ink.rows[ink.rows.length - 1])} of ${String(
        atlasJson.cell,
      )}, ${String(ink.below)} at or below the baseline (ascent ${String(atlasJson.ascent)})`;
    expect(gInk.rows.length, `${read('g', gInk)} — the bake drew nothing at all`).toBeGreaterThan(
      0,
    );
    expect(gInk.below, `${read('g', gInk)} — g lost its descender again`).toBeGreaterThan(0);
    // The control: `a` has no descender, so the band below the baseline is not simply noise.
    expect(
      aInk.below,
      `${read('a', aInk)} — a tailless letter should stop above the baseline`,
    ).toBe(0);
  });

  it("knows which cells are the font's notdef box, and that they are one shared box", () => {
    // The bake flags `notdef: true` on a cell it drew from the font's own .notdef glyph — a legal
    // rectangle standing in for a character the font does not have (#138). Two things are pinned
    // here, and neither one is a pass:
    //  - the shipped set, so a new tofu shows up as a red rather than as a screenshot somebody
    //    happens to look at;
    //  - that these cells are pixel-identical. That is why the wordless tier cannot tell `◌`
    //    (已掐灭, and the auto chip) from `⌁` (磕灰) from `∅` (no words at all): three marks the
    //    design names, one rectangle on screen. `mark-alphabet.test.ts` can only say the code points
    //    differ, and code points are the half a pixel never disagrees about.
    // Choosing the fix is the A/B call in #138; whoever lands it updates this ledger with it.
    //
    // 2026-10-13, the DOM half of #163: the language row's `◌` and `ع` were `.notdef` **on screen**,
    // so they were replaced there (`copy.ts`: `◌`→`○`, `ع`→`↔`). `◌` was one of the four places the
    // shell writes that character, and the bake takes its character set from the copy table — so
    // removing it from `copy.ts` removed it from the atlas, and this ledger followed: 19 → 18, `◌`
    // gone, `↔` in and not flagged.
    //
    // `ع` is the sharper half and it is still here: it remains `.notdef` **in the atlas**, because
    // the atlas is still baked from a system CJK font that has no Arabic. That half of #138 is
    // untouched and deliberately so — see `PUFFLY_ATLAS_FONT` in `apps/web/scripts/bake-atlas.mjs`,
    // whose absence from `deploy.yml` is what lets a system-font bake happen at all.
    const flagged = Object.entries(atlasJson.metrics)
      .filter(([, metric]) => metric.notdef === true)
      .map(([char]) => char);
    console.log(`NOTDEF ${String(flagged.length)} ${flagged.join('')}`);
    expect(
      [...flagged].sort().join(''),
      'the set of characters the baked font cannot draw changed — #138',
    ).toBe([...'إابةتخدرصعغقلنوي∅⌁'].sort().join(''));
    const shapes = new Set(
      flagged.map((char) => {
        const metric = atlasJson.metrics[char];
        if (metric === undefined)
          throw new Error(`the ledger names ${char}, the atlas has no such cell`);
        return cellSignature(metric);
      }),
    );
    expect(shapes.size, 'the notdef cells are not one shared box').toBe(1);
    // The control: a letter the font really has must not share that box, or the comparison above
    // would be matching noise against noise.
    const known = atlasJson.metrics['a'];
    if (known === undefined) throw new Error('the atlas has no a');
    expect(shapes.has(cellSignature(known)), 'a real letter drew the same box as notdef').toBe(
      false,
    );
  });

  it('draws every glyph inside the box the bake claims for it', () => {
    // The bake records each glyph's own outline box. Ink outside it is one of two things: clipped
    // by the cell (the old bug, which ate the tail) or spilled into this cell by the neighbour
    // above (the same bug's other half, which put a stray mark on an unrelated letter).
    const cell = atlasJson.cell;
    const ascent = atlasJson.ascent ?? 1;
    let checked = 0;
    const offenders: string[] = [];
    for (const [char, metric] of Object.entries(atlasJson.metrics)) {
      if (typeof metric.yMin !== 'number' || typeof metric.yMax !== 'number') continue;
      checked += 1;
      const { rows } = cellInk(metric);
      if (rows.length === 0) continue;
      // A value `v` in ems above the baseline sits at row `cell * (ascent - v)`; one row of slack
      // either side for the antialiased edge.
      const top = Math.floor(cell * (ascent - metric.yMax)) - 1;
      const bottom = Math.ceil(cell * (ascent - metric.yMin)) + 1;
      const first = rows[0] ?? 0;
      const last = rows[rows.length - 1] ?? 0;
      if (first < top || last > bottom) {
        offenders.push(
          `${JSON.stringify(char)}: ink ${String(first)}..${String(last)} vs ${String(top)}..${String(bottom)}`,
        );
      }
    }
    expect(
      checked,
      'the bake records no outline boxes, so this scan proves nothing',
    ).toBeGreaterThan(300);
    // The claims have to discriminate, or the box above is just the cell and the scan is vacuous:
    // a bake that fell back to the em box for every glyph would pass it forever. `a` has no tail and
    // `g` has one — the recorded boxes have to say so.
    const aBox = atlasJson.metrics['a'];
    const gBox = atlasJson.metrics['g'];
    expect((aBox?.yMin ?? -1) > 0, 'the bake claims a descender for a letter that has none').toBe(
      true,
    );
    expect((gBox?.yMin ?? 1) < 0, 'the bake claims no descender for g').toBe(true);
    expect(offenders.slice(0, 12), 'glyph ink outside its own box').toEqual([]);
    expect(offenders).toEqual([]);
  });
});

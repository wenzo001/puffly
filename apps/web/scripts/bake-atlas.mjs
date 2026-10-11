/**
 * Bakes the glyph atlas the 3D layer draws every word with.
 *
 * The glyph set is closed by construction: it is exactly the characters the shipped copy table uses,
 * so the atlas carries no font file and no character nobody can ever see (§7 of the scene spec).
 * Re-run this whenever `src/i18n/copy.ts` grows; `src/__tests__/atlas-coverage.test.ts` fails the
 * gate if it has not been.
 *
 *   node scripts/bake-atlas.mjs
 *
 * The font: `PUFFLY_ATLAS_FONT` wins, then a repository-local Noto Sans SC if one is vendored, then
 * a system CJK font — which is fine for local development and **not** for release: the system font
 * here is Apple's and may not be redistributed, while Noto Sans SC (SIL OFL) may. Swapping fonts is
 * this one command; the character set does not change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const OUT_DIR = join(web, 'public', 'atlas');

const CELL = 64;
/**
 * The readout alphabet: everything `formatReadout`-style figures put on screen. The copy table is
 * not enough — `2 / 12` and `100%` are formatted from the simulation, not written down anywhere, so
 * a bake that read only the copy table drew three of those four digits and dropped the `%`. Written
 * into the JSON as well, so the coverage test checks this file's own claim about itself.
 */
const READOUT = '0123456789%./:×≈°';
/**
 * The marks the HUD draws instead of a number — the ring's rod/lighter/tray/out signs, the
 * over-limit diamond and the pill's strength tick. Shapes, not words, and just as absent from the
 * copy table as `100%` is.
 */
const MARKS = '△○≡◇⌁☼';

function fontCandidates() {
  const candidates = [];
  if (process.env.PUFFLY_ATLAS_FONT)
    candidates.push({ path: process.env.PUFFLY_ATLAS_FONT, release: true });
  candidates.push({ path: join(web, 'assets', 'fonts', 'NotoSansSC-Regular.otf'), release: true });
  candidates.push({ path: '/System/Library/Fonts/STHeiti Light.ttc', release: false });
  return candidates;
}

const chosen = fontCandidates().find((candidate) => existsSync(candidate.path));
if (!chosen) {
  console.error('no font found — set PUFFLY_ATLAS_FONT to an OTF/TTF/TTC path');
  process.exit(1);
}
if (!chosen.release) {
  console.warn(
    `baking from the system font ${chosen.path}\n` +
      'This atlas is for development only. A release build must re-bake with a redistributable font\n' +
      '(Noto Sans SC, SIL OFL) via PUFFLY_ATLAS_FONT — see the header of this script.',
  );
}

// 1. The closed set: every non-whitespace character the copy table uses, whatever script or block
// it lives in. A hand-written range list is how the first bake lost `· — ≈ – ’ °` — it looked
// complete and was not, which is why the rule is now "whatever the table has" and the coverage test
// imports the real module to hold this script to it.
const copy = readFileSync(join(web, 'src', 'i18n', 'copy.ts'), 'utf8');
const values = [...copy.matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]);
const glyphs = [
  ...new Set([...(values.join(' ') + READOUT + MARKS)].filter((char) => !/\s/.test(char))),
].sort();
if (glyphs.length < 300) {
  console.error(`only ${glyphs.length} glyphs found in the copy table — the extraction is broken`);
  process.exit(1);
}

// 2. Outlines → one SVG, one <g> per cell.
const opened = fontkit.openSync(chosen.path);
const font = opened.fonts ? opened.fonts[0] : opened;
const upm = font.unitsPerEm;
// The cell is the em box, so the baseline sits `ascent` of the way down from its top. Putting it on
// the cell's bottom edge instead — which is what this file did until 2026-10-11 — draws everything
// below the baseline outside the cell: the tails of `g p y` were both lost and spilled into the cell
// underneath, and the reader had no way to tell (#146).
const ascent = font.ascent / upm;
const descent = -font.descent / upm;
if (ascent <= 0 || descent <= 0) {
  console.error(
    `font reports ascent=${String(font.ascent)} descent=${String(font.descent)} — unusable`,
  );
  process.exit(1);
}
if (ascent + descent > 1) {
  console.error(
    `${chosen.path}: its em box is ${ascent.toFixed(3)} + ${descent.toFixed(3)} em, which does not fit ` +
      'the square cell this grid draws into. A font whose ascent+descent exceeds one em would be ' +
      'clipped exactly the way #146 was; pick one that fits, or make the cell non-square first.',
  );
  process.exit(1);
}
const columns = Math.ceil(Math.sqrt(glyphs.length)) + 1;
const rows = Math.ceil(glyphs.length / columns);
const scale = CELL / upm;
const parts = [];
const metrics = {};
let noBox = 0;
const missing = [];
const t0 = performance.now();
glyphs.forEach((char, index) => {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const glyph = font.glyphForCodePoint(char.codePointAt(0));
  // fontkit's y-axis points up, SVG's down — flip inside the cell, on the baseline.
  parts.push(
    `<g transform="translate(${col * CELL},${row * CELL + ascent * CELL}) scale(${scale.toFixed(6)},${(-scale).toFixed(6)})"><path d="${glyph.path.toSVG()}"/></g>`,
  );
  // The outline box goes out to the JSON in ems above the baseline, so a test can hold the shipped
  // pixels against this file's own claim about where each glyph's ink belongs.
  const box = glyph.bbox;
  if (!Number.isFinite(box?.minY) || !Number.isFinite(box?.maxY)) noBox += 1;
  // A font that has no such character answers with its `notdef` glyph, whose path is a perfectly
  // legal rectangle — so "the grid has a cell for this character" was never the same claim as
  // "the grid draws this character". Recording which cells are that rectangle is what lets a test
  // tell the two apart (#138: the Arabic endonyms and the three 自动 chips ship as boxes, and
  // `atlas-coverage.test.ts`'s "every locale's every character has a glyph" passes on them).
  const notdef = glyph.id === 0 || glyph.name === 'notdef' || glyph.path?.commands?.length === 0;
  if (notdef) missing.push(char);
  metrics[char] = {
    col,
    row,
    w: CELL,
    h: CELL,
    advance: glyph.advanceWidth / upm,
    yMin: Number.isFinite(box?.minY) ? box.minY / upm : -descent,
    yMax: Number.isFinite(box?.maxY) ? box.maxY / upm : ascent,
    ...(notdef ? { notdef: true } : {}),
  };
});
const width = columns * CELL;
const height = rows * CELL;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="#fff">${parts.join('')}</g></svg>`;
const t1 = performance.now();

// 3. Rasterise and write.
const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
const t2 = performance.now();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'glyphs.png'), png);
// The font path stays out of the JSON: it is this machine's, and a committed file that names it
// would be wrong on every other machine. The console line below is where it is reported.
writeFileSync(
  join(OUT_DIR, 'glyphs.json'),
  JSON.stringify({
    cell: CELL,
    columns,
    rows,
    ascent,
    descent,
    readout: READOUT + MARKS,
    metrics,
  }),
);

console.log(
  JSON.stringify({
    glyphs: glyphs.length,
    grid: `${columns}x${rows}`,
    atlasPx: `${width}x${height}`,
    pngBytes: png.length,
    baseline: { ascent, descent },
    noBox,
    notdef: missing.join(''),
    outlineMs: Math.round(t1 - t0),
    rasterMs: Math.round(t2 - t1),
    font: chosen.path,
  }),
);

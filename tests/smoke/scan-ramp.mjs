/**
 * Measures the vertical luminance profile of the table band, to prove the depth ramp is a gradient
 * rather than the flat ink it replaced. A flat band reports the same number at every height; a ramp
 * reports a rise from the wall edge (top) toward the player (bottom).
 *
 * Two things this tool refuses to do:
 *   hunt the seam with a luminance step — the wall carries the grain's own step, so a hunt locks onto
 *     a texture edge at half the frame and calls the wall the table. The seam comes from the core's
 *     own contract, `stage.ts:128` `tableEdgeY: 0.64`, which is the same number `backgroundStructure`
 *     drew the band from;
 *   average the whole band — the tray, the tray's shadow, the sheet's DOM mirror and the HUD all sit
 *     inside the band, and a band-wide mean averages the ramp away. It samples a column, skipping the
 *     rows the prop anchors occupy.
 *
 * Usage: node tests/smoke/scan-ramp.mjs <png>
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** The core's own contract — `packages/game-core/src/stage.ts:128`. */
const TABLE_EDGE_Y = 0.64;
/** The grain moves luminance by about this much, so a reading inside the band may differ by it. */
const GRAIN = 4;

const FILE = process.argv[2];
if (FILE === undefined) {
  console.error('usage: node tests/smoke/scan-ramp.mjs <png>');
  process.exit(2);
}

const png = readFileSync(FILE);
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');

let offset = 8;
let width = 0;
let height = 0;
let colourType = 0;
/** @type {Buffer[]} */
const idat = [];
while (offset < png.length) {
  const length = png.readUInt32BE(offset);
  const type = png.toString('ascii', offset + 4, offset + 8);
  const data = png.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    colourType = data[9];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  offset += 12 + length;
}

const raw = inflateSync(Buffer.concat(idat));
const channels = colourType === 6 ? 4 : 3;
const bpp = channels;
const stride = width * bpp;
const out = Buffer.alloc(stride * height);

let pos = 0;
for (let y = 0; y < height; y += 1) {
  const filter = raw[pos];
  pos += 1;
  const line = raw.subarray(pos, pos + stride);
  pos += stride;
  const dest = out.subarray(y * stride, (y + 1) * stride);
  const prevRow = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
  for (let i = 0; i < stride; i += 1) {
    const a = i >= bpp ? dest[i - bpp] : 0;
    const b = prevRow ? prevRow[i] : 0;
    const c = prevRow && i >= bpp ? prevRow[i - bpp] : 0;
    const rawByte = line[i];
    let value;
    if (filter === 0) value = rawByte;
    else if (filter === 1) value = rawByte + a;
    else if (filter === 2) value = rawByte + b;
    else if (filter === 3) value = rawByte + Math.floor((a + b) / 2);
    else {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
    dest[i] = value & 0xff;
  }
}

const luma = (x, y) => {
  const i = y * stride + x * bpp;
  return 0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2];
};

/**
 * A band column's mean luminance over a short vertical run, so grain does not masquerade as the
 * ramp. `from`/`to` are fractions of the band's own height below the seam.
 */
const columnMean = (column, from, to) => {
  const top = Math.max(0, Math.floor(from * 100));
  const bottom = Math.min(100, Math.ceil(to * 100));
  let sum = 0;
  let count = 0;
  for (let step = top; step < bottom; step += 1) {
    const y = seam + Math.floor((step / 100) * band);
    if (y >= height) break;
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = column + dx;
      if (x < 0 || x >= width) continue;
      sum += luma(x, y);
      count += 1;
    }
  }
  return count === 0 ? 0 : sum / count;
};

const column = Math.floor(width / 2);
const seam = Math.floor(height * TABLE_EDGE_Y);
const band = height - seam;

/** Column offsets that miss the tray (`ashtray:0.735,0.695`) and the tray's own dark pool. */
const COLUMNS = [
  { label: 'centre', dx: 0 },
  { label: 'left', dx: -Math.floor(width * 0.3) },
  { label: 'right', dx: Math.floor(width * 0.3) },
];

console.log(`\n${FILE}  ${width}x${height}`);
console.log(`  seam from core contract tableEdgeY=${TABLE_EDGE_Y} -> y=${seam}; band ${band}px (${((band / height) * 100).toFixed(1)}% of frame)`);
console.log('  column means, far (top) to near (bottom):');

let rose = 0;
let flat = 0;
for (const columnSpec of COLUMNS) {
  const x = column + columnSpec.dx;
  if (x < 0 || x >= width) continue;
  const far = columnMean(x, 0.05, 0.15);
  const quarter = columnMean(x, 0.3, 0.4);
  const near = columnMean(x, 0.8, 0.95);
  const marks = '#'.repeat(Math.max(0, Math.round(near / 6)));
  console.log(
    `    ${columnSpec.label.padEnd(6)} far ${far.toFixed(1).padStart(6)}   quarter ${quarter.toFixed(1).padStart(6)}   near ${near.toFixed(1).padStart(6)}  ${marks}`,
  );
  // A ramp must rise more than the grain can explain: two grain widths is the floor.
  if (near > far + 2 * GRAIN) rose += 1;
  else flat += 1;
}

console.log(`  rise exceeds the grain (±${GRAIN}) in ${rose} of ${rose + flat} sampled columns`);
console.log(rose > 0 ? '  RAMP: yes' : '  RAMP: no — the band reads flat');

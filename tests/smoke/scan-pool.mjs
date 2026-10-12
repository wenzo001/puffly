/**
 * Measures the horizontal luminance profile of the table band, to prove the warm pool still sits on
 * the table rather than being buried by the depth ramp's quad. `scan-ramp.mjs` reads the band's
 * vertical shape (wall edge to near edge); this reads its horizontal shape, because the pool is a
 * wide ellipse centred on the stage and the only defect that matters after a depth-ramp change is
 * "the ramp quad painted over it".
 *
 * The seam comes from the core's own contract, `stage.ts:128` `tableEdgeY: 0.64` — the same refusal
 * as `scan-ramp.mjs`: hunting a seam with a luminance step locks onto the wall's grain.
 *
 * Usage: node tests/smoke/scan-pool.mjs <png>
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** The core's own contract — `packages/game-core/src/stage.ts:128`. */
const TABLE_EDGE_Y = 0.64;

const FILE = process.argv[2];
if (FILE === undefined) {
  console.error('usage: node tests/smoke/scan-pool.mjs <png>');
  console.error('  node tests/smoke/scan-pool.mjs /tmp/puffly-rt/desktop-break.png');
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

const seam = Math.floor(height * TABLE_EDGE_Y);
const band = height - seam;

/**
 * A row's mean luminance over a horizontal run, so grain does not masquerade as the pool.
 * `from`/`to` are fractions of the stage width.
 */
const rowMean = (row, from, to) => {
  const left = Math.max(0, Math.floor(from * width));
  const right = Math.min(width, Math.ceil(to * width));
  let sum = 0;
  let count = 0;
  for (let x = left; x < right; x += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const y = row + dy;
      if (y < seam || y >= height) continue;
      sum += luma(x, y);
      count += 1;
    }
  }
  return count === 0 ? 0 : sum / count;
};

// The pool's own ellipse, from `WARM_POOL` at the `puff` state (cx 0.5, rx 0.8). The phone shape
// cannot be sampled with one row: at 393-wide CSS (786 at DPR 2) the DOM chrome below the stage —
// the doughnut sheet card and the rail — sits inside the band and adds its own light. So sample
// several rows and take the brightest band in the table's own middle, and compare like with like
// between the stage's centre and its left edge.
const rows = [0.3, 0.45, 0.6, 0.75];
const brightAt = (from, to) => Math.max(...rows.map((p) => rowMean(seam + Math.floor(band * p), from, to)));
const near = brightAt(0.28, 0.72);
const edge = brightAt(0.02, 0.1);

console.log(`${FILE}  ${width}x${height}`);
console.log(`  seam from core contract tableEdgeY=0.64 -> y=${seam}; band ${band}px (${((band / height) * 100).toFixed(1)}% of frame)`);
console.log(
  `  band's brightest row means: centre ${near.toFixed(1)}  left edge ${edge.toFixed(1)} (over rows ${rows.map((p) => `${p * 100}%`).join('/')})`,
);
const reads = near > edge + 6;
console.log(`  centre is ${reads ? '' : 'NOT '}brighter than the table's own edge`);
console.log(`  POOL: ${reads ? 'yes' : 'NO — the warm pool is not reading on the table'}`);
process.exit(reads ? 0 : 1);

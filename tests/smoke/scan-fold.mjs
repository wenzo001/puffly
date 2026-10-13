/**
 * Compares two captures in the chrome band, so "did the folded-chrome fix change the *visible*
 * chrome?" can be answered against the animation's own noise floor rather than against zero.
 *
 * A frame is a moving picture: the rod, the plume and the ash all advance between two screenshots, so
 * a naive whole-frame diff reports several percent of pixels as changed no matter what the code did.
 * The number that matters for the §10 fix is confined to the band where the head-up row and the pill
 * live, and it has to be compared against what two frames of the *same* build already differ by.
 *
 *   node tests/smoke/scan-fold.mjs <a.png> <b.png> [--band 0.08]
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--') && !/^\d?\.?\d+$/.test(a));
const bandIndex = argv.indexOf('--band');
const BAND =
  bandIndex === -1 || argv[bandIndex + 1] === undefined ? 0.08 : Number(argv[bandIndex + 1]);
if (!Number.isFinite(BAND) || BAND <= 0) {
  console.error(`--band must be a positive fraction, got ${String(argv[bandIndex + 1])}`);
  process.exit(2);
}

/** Joins the IDAT chunks without `Buffer`, so this file lints the same as the rest of the suite. */
function concat(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function decode(bytes) {
  let p = 8;
  /** @type {Uint8Array[]} */
  const idat = [];
  let W = 0;
  let H = 0;
  let colour = 0;
  while (p < bytes.length) {
    const len = bytes.readUInt32BE(p);
    const type = bytes.toString('ascii', p + 4, p + 8);
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      W = data.readUInt32BE(0);
      H = data.readUInt32BE(4);
      colour = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = colour === 6 ? 4 : 3;
  const raw = inflateSync(concat(idat));
  const stride = W * bpp + 1;
  const out = new Uint8Array(W * H * bpp);
  for (let y = 0; y < H; y += 1) {
    const f = raw[y * stride];
    const row = raw.subarray(y * stride + 1, (y + 1) * stride);
    for (let i = 0; i < W * bpp; i += 1) {
      const a = i >= bpp ? out[y * W * bpp + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * W * bpp + i] : 0;
      const c = y > 0 && i >= bpp ? out[(y - 1) * W * bpp + i - bpp] : 0;
      let v;
      if (f === 0) v = row[i];
      else if (f === 1) v = row[i] + a;
      else if (f === 2) v = row[i] + b;
      else if (f === 3) v = row[i] + Math.floor((a + b) / 2);
      else {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v = row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * W * bpp + i] = v & 0xff;
    }
  }
  return { W, H, data: out, bpp };
}

if (files.length !== 2) {
  console.error('usage: node tests/smoke/scan-fold.mjs <a.png> <b.png> [--band 0.08]');
  process.exit(2);
}
const A = decode(readFileSync(files[0]));
const B = decode(readFileSync(files[1]));
if (A.W !== B.W || A.H !== B.H) {
  console.error(`sizes differ: ${A.W}x${A.H} vs ${B.W}x${B.H}`);
  process.exit(2);
}
const yMax = Math.max(1, Math.round(A.H * BAND));
let diff = 0;
let n = 0;
for (let y = 0; y < yMax; y += 1) {
  for (let x = 0; x < A.W; x += 1) {
    const i = (y * A.W + x) * A.bpp;
    const la = 0.299 * A.data[i] + 0.587 * A.data[i + 1] + 0.114 * A.data[i + 2];
    const lb = 0.299 * B.data[i] + 0.587 * B.data[i + 1] + 0.114 * B.data[i + 2];
    if (Math.abs(la - lb) > 2) diff += 1;
    n += 1;
  }
}
console.log(
  `${files.map((f) => f.split('/').pop()).join('  vs  ')}  chrome band ${yMax} rows: ` +
    `${diff}/${n} pixels differ = ${((100 * diff) / n).toFixed(2)}%`,
);

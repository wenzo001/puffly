/**
 * The 40×40 header ring wears the five screen symbols §2 of the Demo draws inside it — one rod, one
 * flame, three airflow lines, a swirl with its dot, and three fading ash lines — and never a digit.
 * The symbols live in one component (`DemoGlyph.vue`) so this test reads both files: HudBar has to
 * pick the right name per screen, and the component has to carry the Demo's own geometry and ink.
 * Source text buys structure only — that the right rule carries the turn and the box is 26px. Whether
 * the mark lands inside the ring is a rendered fact, and it took a composited screenshot to see.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockAfter, stripComments } from './sourceProbe';

const HUD = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');
const GLYPH = readFileSync(new URL('../components/DemoGlyph.vue', import.meta.url), 'utf8');

/** The full ring block, span to span — the old single-`</span>` slice ended inside the v-if. */
function ringBlock(): string {
  const start = HUD.indexOf('<span class="ring"');
  const depthFrom = (text: string, at: number): number => {
    let depth = 0;
    for (let i = at; i < text.length; i += 1) {
      if (text.startsWith('<span', i)) depth += 1;
      if (text.startsWith('</span>', i)) depth -= 1;
      if (depth === 0) return i;
    }
    return -1;
  };
  const end = depthFrom(HUD, start);
  expect(start, 'the ring block is gone').toBeGreaterThan(-1);
  expect(end, 'the ring block never closes').toBeGreaterThan(start);
  return HUD.slice(start, end);
}

/**
 * The body of the branch that starts at `start` — braces counted, so a nested `if`'s own body ends
 * where it ends. Reading the whole file instead is what let a phase wear the wrong symbol in silence.
 */
function armOf(text: string, start: RegExp): string {
  const found = start.exec(text);
  if (!found) throw new Error(`no branch matching ${start}`);
  const open = text.indexOf('{', found.index + found[0].length - 1);
  if (open < 0) throw new Error(`branch matching ${start} has no body`);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && --depth === 0) return text.slice(open, index + 1);
  }
  throw new Error(`unbalanced braces after ${start}`);
}

describe('each of the five screens names its Demo symbol', () => {
  it('binds each glyph to the branch that wears it, not to the file', () => {
    // Five independent `toMatch` over the whole component could not tell which phase wears which
    // symbol: moving 火苗 onto the tray row and 灰线 onto the ignition keeps all five literals and
    // stayed green. Measured, not assumed — the swap below reddens exactly this case.
    //
    // The contract the five screens actually set: LIGHTING burns a flame, the waiting rod wears the
    // rod, a finished draw wears the swirl of the exhale, an open draw wears the airflow, and the
    // tray row wears the ash lines.
    const lighting = armOf(HUD, /case 'light':/);
    const lightingArm = armOf(lighting, /if \(rod\.state === 'LIGHTING'\)/);
    expect(lightingArm).toContain("glyph: 'flame'");
    expect(lighting).toContain("glyph: 'rod'");
    expect(lightingArm).not.toContain("glyph: 'rod'");

    const puff = armOf(HUD, /case 'puff':/);
    const exhale = armOf(puff, /if \(exhale !== null\)/);
    expect(exhale).toContain("glyph: 'swirl-dot'");
    expect(puff).toContain("glyph: 'airflow'");
    expect(exhale).not.toContain("glyph: 'airflow'");

    expect(armOf(HUD, /case 'tray':/)).toContain("glyph: 'tray-lines'");
    // `out` has no case of its own; it is the default, and it reads the clock.
    const last = HUD.slice(HUD.lastIndexOf('default:'));
    expect(last).toContain("glyph: 'rod'");
    expect(last).toContain("label: 'a11y.hud.clock'");
  });

  it('renders the glyph component inside the ring at 26px and keeps the diamond as the only text', () => {
    const ring = ringBlock();
    expect(ring).toContain('DemoGlyph');
    expect(ring).toMatch(/:name="reading\.glyph"/);
    expect(ring).toMatch(/tone="hud"/);
    expect(ring).toMatch(/:size="26"/);
    // The one text mark the five screens do not define.
    expect(ring).toContain('v-if="summary.overLimit"');
    expect(ring).toContain('◇');
  });

  it('never puts a digit in the ring', () => {
    const ring = ringBlock();
    expect(ring).not.toContain('reading.value');
    expect(ring).not.toContain('{{ reading');
    expect(ring).not.toContain("class='digits'");
  });
});

describe('DemoGlyph carries the Demo’s own five symbols', () => {
  it('draws all five header icons at the 26 viewBox', () => {
    for (const name of ['rod', 'flame', 'airflow', 'swirl-dot', 'tray-lines']) {
      expect(GLYPH, name).toContain(`name === '${name}'`);
    }
    expect(GLYPH).toMatch(/viewBox="0 0 26 26"/);
  });

  it('uses the Demo ink for the HUD tone', () => {
    // paper #EDE5DA, filter #C89A5E, ember #FF8A3D, soft/flame #FFD9A0.
    expect(GLYPH).toMatch(/paper: '#EDE5DA', filter: '#C89A5E', ember: '#FF8A3D'/);
    expect(GLYPH).toContain('#FFD9A0');
  });

  it('gives the ash lines the Demo’s three fades', () => {
    expect(GLYPH).toContain('0.85, 0.6, 0.35');
  });

  // The four numbers below are transcribed from §2 of the Demo (the ring’s own glyph markup, read
  // out of a browser 2026-10-11 and kept in docs/SPEC.md). They are the part this file’s own header
  // has always claimed to check — “the component has to carry the Demo’s own geometry” — and did not:
  // names, a viewBox and three inks say nothing about where a bar sits or which way a swirl turns.
  it('sits the rod on the Demo’s line, with the ember at its height', () => {
    // rect x=3 y=10.5 15×3.4 + the filter band on the same line; circle cx=21 cy=12.2 r=2.
    expect(GLYPH).toMatch(/<rect x="3" y="10\.5" width="15" height="3\.4"/);
    expect(GLYPH).toMatch(/<rect x="3" y="10\.5" width="5" height="3\.4"/);
    expect(GLYPH).toMatch(/<circle cx="21" cy="12\.2" r="2"/);
  });

  it('draws the airflow as the Demo’s three warmths, not one ink thrice', () => {
    // S3: #FFD9A0 over #C9A97F over #8E7A5C — the stack reads as air cooling as it falls.
    expect(GLYPH).toMatch(/airTop: '#FFD9A0'/);
    expect(GLYPH).toMatch(/airMid: '#C9A97F'/);
    expect(GLYPH).toMatch(/airLow: '#8E7A5C'/);
    const air = GLYPH.slice(GLYPH.indexOf(`name === 'airflow'`));
    for (const key of ['airTop', 'airMid', 'airLow']) {
      expect(air.slice(0, 600), key).toContain(`palette.${key}`);
    }
  });

  it('turns the exhale swirl the way the Demo turns it', () => {
    // The Demo’s own path and dot: out to 19 13, back down to −5 5; the dot at cx=13.
    expect(GLYPH).toContain('d="M9 17C11 12 16 10.5 19 13c2 2.5-1 5.5-5 5"');
    expect(GLYPH).toMatch(/<circle cx="13" cy="13\.6" r="1\.8"/);
  });

  it('spaces the ash lines at the Demo’s 4.5, not a round 5', () => {
    expect(GLYPH).toMatch(/:y="7 \+ i \* 4\.5"/);
  });

  it('turns the dial on the arc, so the symbol keeps a square screen matrix', () => {
    // §2 rotates the *circle* (`rotate(-90 20 20)` on the arc). When the rotation sat on
    // `.ring svg` instead, it also turned the symbol — and the scene places its own copy from that
    // element's `getScreenCTM()`, so a quarter-turned matrix left the ring drawing empty.
    // Each check reads one rule body or one tag, comments gone: a fixed-length window from
    // `.ring svg` reaches on into `.ring svg.mark`, so one rule would answer for the other; and this
    // file explains the old rule, so prose naming a literal must not be able to satisfy its guard.
    const code = stripComments(HUD);
    expect(blockAfter(code, /\.ring svg \{/)).not.toContain('rotate(');
    expect(stripComments(ringBlock())).toMatch(
      /class="arc"[\s\S]{0,120}?transform="rotate\(-90 20 20\)"/,
    );
    // And the symbol is §2's 26×26 box, not a fill of the ring — and it carries no turn of its own.
    const mark = blockAfter(code, /\.ring svg\.mark \{/);
    expect(mark).toMatch(/width: 26px;/);
    expect(mark).toMatch(/height: 26px;/);
    expect(mark).not.toContain('rotate(');
  });
});

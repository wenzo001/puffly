/**
 * The 40×40 header ring wears the five screen symbols §2 of the Demo draws inside it — one rod, one
 * flame, three airflow lines, a swirl with its dot, and three fading ash lines — and never a digit.
 * The symbols live in one component (`DemoGlyph.vue`) so this test reads both files: HudBar has to
 * pick the right name per screen, and the component has to carry the Demo's own geometry and ink.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

describe('each of the five screens names its Demo symbol', () => {
  it('maps the phases to the five glyph names', () => {
    // In source order inside the reading computed: LIGHTING, 待机， 吐烟 force, 吸入， 磕灰.
    expect(HUD).toMatch(/glyph: 'flame'/);
    expect(HUD).toMatch(/glyph: 'rod'/);
    expect(HUD).toMatch(/glyph: 'swirl-dot'/);
    expect(HUD).toMatch(/glyph: 'airflow'/);
    expect(HUD).toMatch(/glyph: 'tray-lines'/);
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
});

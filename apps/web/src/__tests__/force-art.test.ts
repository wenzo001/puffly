/**
 * 力度条 — the S4 screen of the Demo, judged as a shape and as a number.
 *
 * The Demo draws one 342 × 12 fill bar: an 8 px track in rgba(255,255,255,.05), the draw's share in
 * rgba(255,138,61,.30), and a 3 px cream crest in rgba(255,217,160,.55). The head-up ring reads the
 * same single figure (「62」), so two surfaces cannot drift apart: these cases pin the one owner,
 * the Demo's own geometry and colours, and the promise that no word and no control sit on the bar.
 *
 * What the machine cannot judge is kept out of the assertions: whether the fill *reads* as the
 * strength of the breath is an eye call, and the eye is the user's.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORCE_BAR, forceFillWidth, forceReading } from '../forceArt';

const PILL = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');
const HUD = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');

/** The opening tag of one of the pill's 示意图 blocks, chosen by the class it paints with. */
function artTag(cls: string): string {
  const at = PILL.indexOf(`class="art ${cls}"`);
  expect(at, `the pill no longer has the .art.${cls} block`).toBeGreaterThan(-1);
  const open = PILL.lastIndexOf('<svg', at);
  const close = PILL.indexOf('>', at);
  expect(open, `no svg opens the .art.${cls} block`).toBeGreaterThan(-1);
  return PILL.slice(open, close);
}

/** Everything the block draws: from its class attribute to the end of its own svg. */
function artBody(cls: string): string {
  const start = PILL.indexOf(`class="art ${cls}"`);
  expect(start, `the pill no longer draws .art.${cls}`).toBeGreaterThan(-1);
  const end = PILL.indexOf('</svg>', start);
  expect(end, `the .art.${cls} svg never closes`).toBeGreaterThan(start);
  return PILL.slice(start, end);
}

/** The body of the HUD's draw case — the one place the ring decides what it wears. */
function puffCase(source: string): string {
  const start = source.indexOf("case 'puff':");
  expect(start, 'HudBar lost the draw reading').toBeGreaterThan(-1);
  const end = source.indexOf("case 'tray':", start);
  expect(end, 'the draw case runs to the end of the switch').toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('one figure, two surfaces (§26)', () => {
  it('reads only in the window the smoke is leaving', () => {
    const at = (state: string, lastDraw: number) => forceReading({ state, puff: { lastDraw } });
    expect(at('PUFFING', 0.86), 'the draw itself is not the exhale').toBeNull();
    expect(at('BURNING', 0.86), 'smouldering is not the exhale').toBeNull();
    expect(at('ASH_READY', 0.86), 'a column worth flicking is not the exhale').toBeNull();
    expect(at('EXTINGUISHED', 0.86)).toBeNull();
    expect(at('RESTING', 0.86), 'the release is the exhale').toBe(86);
  });

  it('reads nothing for a draw that was never taken', () => {
    // `lastDraw` is 0 on a rod that has never been breathed on, and on one restored from a save.
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 0 } })).toBeNull();
  });

  it('is the core figure rounded once, and stays inside its own scale', () => {
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 0.62 } })).toBe(62);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 1 } })).toBe(100);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 0.004 } })).toBe(0);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 1.7 } })).toBe(100);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: -3 } })).toBeNull();
    for (const value of [0.004, 0.2, 0.62, 0.86, 1]) {
      const reading = forceReading({ state: 'RESTING', puff: { lastDraw: value } });
      expect(reading, `${String(value)} read nothing`).not.toBeNull();
      expect(Number(reading) >= 0 && Number(reading) <= 100, `${value} left the scale`).toBe(true);
    }
  });

  it('turns the reading into the Demo bar’s own fill width', () => {
    expect(forceFillWidth(0)).toBe(0);
    expect(forceFillWidth(100)).toBe(FORCE_BAR.width);
    expect(forceFillWidth(62)).toBeCloseTo(342 * 0.62, 6);
    expect(forceFillWidth(140), 'a reading above the scale escapes the bar').toBe(FORCE_BAR.width);
  });

  it('leaves the ring and the bar one owner', () => {
    expect(PILL, 'the pill stopped asking the shared figure').toContain('forceReading');
    expect(
      puffCase(HUD),
      'the ring recomputes the force instead of asking the one owner',
    ).toContain('forceReading(rod)');
  });

  it('wears the number inside the ring, which is where the Demo put it', () => {
    expect(puffCase(HUD)).toMatch(/value: String\(exhale\)/);
  });
});

describe('the bar is the Demo’s 342 × 12 fill bar', () => {
  it('carries the Demo’s own size and three inks', () => {
    expect(FORCE_BAR.width).toBe(342);
    expect(FORCE_BAR.height).toBe(12);
    expect(FORCE_BAR.track).toMatchObject({ height: 8, radius: 4, fill: 'rgba(255,255,255,0.05)' });
    expect(FORCE_BAR.fill.colour).toBe('rgba(255,138,61,0.30)');
    expect(FORCE_BAR.crest.colour).toBe('rgba(255,217,160,0.55)');
    expect(FORCE_BAR.crest.height).toBe(3);
  });

  it('draws the track, the fill and the crest straight from the shared constants', () => {
    const block = artBody('force');
    expect(block).toContain('FORCE_BAR.track.fill');
    expect(block).toContain('FORCE_BAR.fill.colour');
    expect(block).toContain('FORCE_BAR.crest.colour');
    // The width is the shared figure, not a percentage copied into the template.
    expect(block).toContain('fillWidth');
    // The viewBox is the Demo strip exactly.
    expect(artTag('force')).toContain('viewBox="0 0 342 12"');
  });

  it('carries not one character of prose and is not a control', () => {
    const block = artBody('force');
    const texts = [...block.matchAll(/>([^<]+)</g)]
      .map((match) => match[1] ?? '')
      .filter((text) => text.trim() !== '');
    expect(texts, `the force bar speaks: ${texts.join('|')}`).toEqual([]);
    expect(block).not.toMatch(/data-hook|@click|data-aim/);
    expect(block).toContain('aria-hidden="true"');
  });

  it('gets the bar to the exhale instead of letting the resistance wave keep it', () => {
    expect(artTag('wave')).toContain('force === null');
    expect(artTag('force')).toContain('v-else-if');
    expect(PILL.indexOf('class="art wave"')).toBeLessThan(PILL.indexOf('class="art force"'));
  });

  it('gives the 品鉴型 the bar even though they never get the resistance wave', () => {
    // 稿子 S16: 「雪茄、斗烟、水烟……不出现肺阻力反馈」 — the wave is theirs to lose, the exhale is not.
    expect(artTag('wave')).toContain('savor');
    expect(artTag('force'), 'the force bar started hiding itself by rod kind').not.toContain(
      'savor',
    );
  });
});

/**
 * S15's last half: 提示条换成纸面塌陷示意图 — the picture the strip is supposed to carry once the tier
 * has run out of words.
 *
 * The deck states the order at the top of that same page (目标语言 → 英文 → 纯图标), and the strip obeyed
 * it only as far as "nothing": with no word to print it disappeared, so 纯图标 — the tier that needs a
 * picture most — was the one left with none. What is pinned here is that the picture exists, that it is
 * the *same* shape the rod is drawn with rather than a second authoring of it, and that a player who
 * turned hint words off still gets nothing.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIP_SHARE, WAIST } from '@puffly/game-scene';
import { dimplePath, hintPictureFor } from '../hintArt';

const APP = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../composables/usePuffly.ts', import.meta.url), 'utf8');

const at = (value: number): string => String(Number(value.toFixed(2)));

/** The strip's own box, mirrored from App.vue — the path is generated at it, not scaled into it. */
const WIDTH = 44;
const THICKNESS = 13;

describe('the wordless strip carries the diagram the deck drew (S15)', () => {
  it('gives the picture to the hold, and to nothing that already has a word', () => {
    expect(hintPictureFor('puff', null), 'the hold lost its diagram').toBe('dimple');
    expect(hintPictureFor('pick', null), 'an invented diagram appeared for 取烟').toBeNull();
    expect(hintPictureFor('flick', null), 'an invented diagram appeared for 磕灰').toBeNull();
    // A word wins wherever the tier has one: the diagram is the last tier's carrier, not a decoration
    // competing with text.
    expect(hintPictureFor('puff', '按住'), 'the picture replaced a word').toBeNull();
  });

  it('draws the diagram out of the renderer’s own two numbers', () => {
    // Both faces bow toward the axis, deepest at `WAIST`, and the control is twice the depth because a
    // quadratic only reaches half of its control's offset — the same construction `rodBodyPath` uses.
    // Reading the constants instead of repeating them is the point: a schematic that disagrees with the
    // thing it schematises is worse than no schematic.
    const control = THICKNESS * DIP_SHARE * 2;
    expect(dimplePath(WIDTH, THICKNESS)).toBe(
      `M 0 0 Q ${at(WIDTH * WAIST)} ${at(control)} ${WIDTH} 0 ` +
        `L ${WIDTH} ${THICKNESS} Q ${at(WIDTH * WAIST)} ${at(THICKNESS - control)} 0 ${THICKNESS} Z`,
    );
    expect(control).toBeGreaterThan(0);
    expect(control).toBeLessThan(THICKNESS);
  });

  it('renders it in the strip, and keeps the strip off the screen reader', () => {
    expect(APP, 'the strip stopped rendering the diagram').toContain(
      "summary.hint?.picture === 'dimple'",
    );
    expect(APP).toContain(':d="DIMPLE.d"');
    expect(APP, 'the strip became something a reader announces').toContain(
      'class="hint"\n      aria-hidden="true"',
    );
  });

  it('still obeys the switch that takes hint words away', () => {
    // The picture must not smuggle guidance back in behind the player's own decision (§64).
    const gate = SHELL.indexOf(
      'if (!settings.value.hints || !state.ui.controlsVisible) return null;',
    );
    const picture = SHELL.indexOf('hintPictureFor(');
    expect(gate, 'the hint switch stopped being checked').toBeGreaterThan(-1);
    expect(picture, 'the picture is no longer asked for').toBeGreaterThan(gate);
  });
});

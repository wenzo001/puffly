/**
 * The picture S15 put where the idle hint sentence used to be: 「提示条换成纸面塌陷示意图」.
 *
 * S15's own first line sets the order the interface has to follow — 目标语言 → 英文 → 纯图标 — and the
 * strip obeyed it only halfway: once a language has no word for the gesture, `hintWord` returned
 * nothing and the strip disappeared, so the tier that most needs a picture was the one holding none.
 * Only one gesture has a picture the deck actually names, and it is the hold: the paper collapsing is
 * what the deck tells the player to watch for (S7's silent chain, S14's gesture table, S1's mock).
 */
import { DIP_SHARE, WAIST } from '@puffly/game-scene';

export type HintPicture = 'dimple';

/**
 * Which picture a wordless strip carries.
 *
 * A word always wins where the tier has one — the picture is the last tier's carrier, not a decoration
 * competing with text. And the only gesture with a drawn diagram in the deck is 按住, so nothing else
 * gets one: an invented glyph would join the mark alphabet on a bet.
 */
export function hintPictureFor(affordance: string, word: string | null): HintPicture | null {
  if (word !== null) return null;
  return affordance === 'puff' ? 'dimple' : null;
}

/**
 * The rod's paper, collapsed, as an SVG path in its own 0 0 length/thickness space.
 *
 * Both long edges bow toward the axis and the deepest point sits at `WAIST`, exactly as `rodBodyPath`
 * draws the real rod; the depth is `DIP_SHARE` of the thickness, doubled into the control point because
 * a quadratic only reaches half of its control's offset. It reads the renderer's two constants rather
 * than copying them, so the diagram cannot drift away from the thing it diagrams — which is the whole
 * claim of a 示意图.
 */
export function dimplePath(length: number, thickness: number): string {
  const waist = length * WAIST;
  const control = thickness * DIP_SHARE * 2;
  const at = (value: number): string => String(Number(value.toFixed(2)));
  return [
    'M 0 0',
    `Q ${at(waist)} ${at(control)} ${at(length)} 0`,
    `L ${at(length)} ${at(thickness)}`,
    `Q ${at(waist)} ${at(thickness - control)} 0 ${at(thickness)}`,
    'Z',
  ].join(' ');
}

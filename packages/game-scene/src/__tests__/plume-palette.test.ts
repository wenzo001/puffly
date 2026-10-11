/**
 * A skin's 烟羽 layer owns the plume's colour, and only the plume — SPEC.md §16, the deck's 四层皮肤.
 *
 * The claim was measured once by recording every colour the renderer asked a sprite for: with a palette
 * whose only non-default layer was 烟羽, 0 of 60 plume sprites changed colour. That was a raster suite,
 * and it retired on 2026-10-10; what is left of the claim in 3D is one rule — `tintFor` hands the plume
 * tint to every burst that is not material, and nothing else. So that rule is what this file judges,
 * plus the half the README promises about timing: the colour is taken when the puff is born, so air that
 * is already in the room does not get a second colour when the player switches skins.
 */
import { describe, expect, it } from 'vitest';
import type { Burst, Rgb } from '@puffly/game-core';
import { MATERIAL_BURSTS, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;
const SKIN_SMOKE: Rgb = [188, 96, 42];

function realBursts(): { exhale: Burst; material: Burst } {
  const h = harness();
  lit(h);
  const all: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') all.push(event.burst);
  });
  h.press('cigarette');
  for (let i = 0; i < 120; i += 1) h.engine.advance(STEP);
  h.release('cigarette');
  for (let i = 0; i < 4000 && !all.some((b) => b.kind === 'exhale'); i += 1) h.engine.advance(STEP);
  for (let i = 0; i < 8000 && !all.some((b) => MATERIAL_BURSTS.has(b.kind)); i += 1) {
    h.engine.advance(STEP);
  }
  const exhale = all.find((b) => b.kind === 'exhale');
  const material = all.find((b) => MATERIAL_BURSTS.has(b.kind));
  if (!exhale || !material) throw new Error('the session handed over no breath and no ash');
  return { exhale, material };
}

function tintsOf(burst: Burst, plumeTint: Rgb | undefined): Rgb[] {
  const pool = new ParticlePool(900);
  intakeBurst(burst, pool, { densityScale: 1, plumeTint });
  const seen: Rgb[] = [];
  pool.forEachActive((p) => seen.push([...p.tint] as Rgb));
  // A file that reads zero particles proves nothing, whatever it asserts next.
  expect(seen.length, 'the pool took nothing').toBeGreaterThan(0);
  return seen.sort((a, b) => a[0]! - b[0]!);
}

describe('the 烟羽 layer is the plume’s colour, and nothing else’s', () => {
  const { exhale, material } = realBursts();

  it('gives the breath the skin’s colour, every particle of it', () => {
    for (const tint of tintsOf(exhale, SKIN_SMOKE)) {
      expect(tint).toEqual(SKIN_SMOKE);
    }
  });

  it('leaves the tobacco’s own colour alone when no skin layer speaks', () => {
    const authored = [...exhale.tint] as Rgb;
    for (const tint of tintsOf(exhale, undefined)) {
      expect(tint, 'the palette is an override, not a second default').toEqual(authored);
    }
  });

  it('keeps ash, sparks and the flint’s burst in the material’s own colour', () => {
    const kept = tintsOf(material, undefined);
    const tinted = tintsOf(material, SKIN_SMOKE);
    expect(tinted, 'a skin repaints the smoke, not what falls off the rod').toEqual(kept);
    for (const tint of tinted) {
      expect(tint).toEqual([...material.tint] as Rgb);
    }
  });

  it('is taken at birth: air already in the room keeps the colour it came in with', () => {
    const pool = new ParticlePool(900);
    intakeBurst(exhale, pool, { densityScale: 1, plumeTint: SKIN_SMOKE });
    const first: Rgb[] = [];
    pool.forEachActive((p) => first.push([...p.tint] as Rgb));
    // A second breath under another skin, and the frames the first one lives through.
    intakeBurst(exhale, pool, { densityScale: 1, plumeTint: [12, 240, 12] });
    for (let i = 0; i < 40; i += 1) pool.update(STEP, { x: 0, y: 0 }, 1, i * STEP, null);
    const after = new Map<number, Rgb>();
    pool.forEachActive((p, index) => after.set(index, [...p.tint] as Rgb));
    const bornTints = new Set(first.map((t) => t.join(',')));
    expect(bornTints.size, 'the first breath did not all carry the skin colour').toBe(1);
    const stillBorn = [...after.values()].filter(
      (t) => t.join(',') === String(SKIN_SMOKE.join(',')),
    );
    expect(
      stillBorn.length,
      'switching skins repainted the air that was already out',
    ).toBeGreaterThan(0);
  });
});

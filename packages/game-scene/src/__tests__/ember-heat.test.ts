/**
 * The cherry's colour band, judged where it is actually computed.
 *
 * `ember-heat.test.ts` lived with the painted layer and retired with it on 2026-10-10; the claim it
 * made — deep ember orange at rest, a white core only on the breath that gives it, cooling that
 * walks *through* the dark reds instead of switching off — was left with no reader at all (#145).
 * The 3D scene reads the same function (`SceneStage`'s cherry and its halo), so the ramp can be
 * judged here as what it is: a function of the core's own temperature.
 */

import { EMBER, emberHeat } from '@puffly/game-core';
import { describe, expect, it } from 'vitest';
import { cherryHot } from '../paint';

/** The two ends the band is written between — copied from `paint.ts` on purpose: a ramp that moves
 *  its own endpoints has to be seen doing it. */
const COLD: readonly [number, number, number] = [255, 120, 32];
const HOT: readonly [number, number, number] = [255, 236, 190];

const at = (heat: number): readonly [number, number, number] => cherryHot(heat);

describe('a cherry colours itself by the core’s own band', () => {
  it('is deep ember orange at the coolest the simulation can write', () => {
    const cold = at(EMBER.temperatureFloor);
    expect([...cold]).toEqual([...COLD]);
    // Not black, not "off": the floor is a colour a player can see in a dark room.
    expect(cold[0]).toBeGreaterThan(200);
    expect(cold[1]).toBeGreaterThan(90);
    expect(cold[1]).toBeLessThan(160);
    expect(cold[2]).toBeLessThan(80);
  });

  it('goes near-white only at a full draw', () => {
    expect([...at(1)]).toEqual([...HOT]);
    // Three quarters of the way up is still not the white core — the top of the band belongs to the
    // breath, which is what makes the draw readable as a moment instead of a level.
    const threeQuarters = at(EMBER.temperatureFloor + 0.75 * EMBER.temperatureSpan);
    expect(threeQuarters[2]).toBeLessThan(HOT[2] - 20);
  });

  it('walks through the reds on the way down instead of switching off', () => {
    const cooling: number[] = [];
    for (let t = 1; t >= EMBER.temperatureFloor - 1e-9; t -= 0.05)
      cooling.push(Number(t.toFixed(4)));
    expect(cooling[0]).toBe(1);
    expect(cooling[cooling.length - 1]).toBeCloseTo(EMBER.temperatureFloor, 4);
    expect(cooling.length).toBeGreaterThan(8);
    let previous = at(cooling[0] ?? 1);
    for (const temperature of cooling.slice(1)) {
      const now = at(temperature);
      // Cooling is monotone toward the cold end, and never lands on black on the way.
      expect(now[1]).toBeLessThanOrEqual(previous[1] + 1e-6);
      expect(now[2]).toBeLessThanOrEqual(previous[2] + 1e-6);
      expect(now[1], `the band went dark at ${String(temperature)}`).toBeGreaterThan(100);
      const jump = Math.abs(now[2] - previous[2]);
      expect(jump, `one step of cooling changed the colour by ${String(jump)}`).toBeLessThan(25);
      previous = now;
    }
  });

  it('gives a middle temperature a middle colour, not a plateau', () => {
    const middle = at(EMBER.temperatureFloor + EMBER.temperatureSpan / 2);
    expect(middle[1]).toBeGreaterThan(COLD[1] + 10);
    expect(middle[1]).toBeLessThan(HOT[1] - 10);
    expect(middle[2]).toBeGreaterThan(COLD[2] + 10);
    expect(middle[2]).toBeLessThan(HOT[2] - 10);
  });

  it('starts the ramp where the core starts writing, not at zero', () => {
    // The band is derived in the core (`emberHeat`) and value-imported here. Anchoring a colour ramp
    // to the raw temperature instead skips the coolest 40 % of it — and that skipped slice is the
    // 暗红 the deck's first 写实 item asks for.
    expect(emberHeat(EMBER.temperatureFloor)).toBe(0);
    expect(emberHeat(1)).toBe(1);
    expect(emberHeat(EMBER.temperatureFloor + EMBER.temperatureSpan / 2)).toBeCloseTo(0.5, 6);
    // Below the floor the simulation cannot go, and the ramp does not either.
    expect(emberHeat(0)).toBe(0);
    expect([...at(0)]).toEqual([...COLD]);
    // And the composition is what the two lines above cannot see on their own: at the middle of the
    // *band* the colour has to sit at the middle of the ramp. Anchored to the raw temperature it
    // would be 70 % of the way up — a number this assertion is here to refuse.
    expect(at(EMBER.temperatureFloor + EMBER.temperatureSpan / 2)[1]).toBeCloseTo(
      (COLD[1] + HOT[1]) / 2,
      0,
    );
  });
});

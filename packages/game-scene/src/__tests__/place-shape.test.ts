/**
 * Two places must not come out as the same picture.
 *
 * The retired `place-features.test.ts` asked this of the painted layer, and it failed the way such
 * things fail silently: two venues shared one furnishing list, so the room you unlock at level 9 was
 * the room you saw at level 3 with a different colour on the wall. The 3D backdrop seeds its
 * clutter from the environment's own id (`backdrop.ts`: `hashOf(environmentId) + salt * 7919`), so
 * the failure is one edit away — drop the id from the seed and twelve of the twenty-one places
 * collapse into each other, because for `room` and `corner` the seeded clutter IS the shape: the
 * skyline, the ridge, the bokeh, the neon and the stair treads all belong to other kinds.
 *
 * What this file therefore judges is separability and determinism, not "is it pretty" — which place
 * is legible as which room is the eye's call (SPEC §22.z, and #132 on the clutter reading as bars).
 */

import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS } from '@puffly/game-content';
import type { GameStateView } from '@puffly/game-core';
import { geometryFor } from '../backdrop';

const stateFor = (id: string, level = 3, dayNumber = 5): GameStateView => {
  const environment = ENVIRONMENTS.find((env) => env.id === id);
  if (environment === undefined) throw new Error(`no such environment: ${id}`);
  return { environment, progress: { level, dayNumber } } as unknown as GameStateView;
};

/** Everything the backdrop will draw for a place, as one comparable value. */
const shapeOf = (id: string, level = 3, dayNumber = 5): string => {
  const geometry = geometryFor(stateFor(id, level, dayNumber));
  return JSON.stringify(geometry);
};

const ids = ENVIRONMENTS.map((env) => env.id);
const kindOf = (id: string): string => {
  const environment = ENVIRONMENTS.find((env) => env.id === id);
  return String(environment?.background.kind);
};

describe('a place has a shape of its own', () => {
  it('knows all twenty-one places, and they are not all one kind', () => {
    // The denominator this whole file is measured against. If the ladder shrinks the checks below
    // quietly get weaker, so the count is asserted, not assumed.
    expect(ids).toHaveLength(21);
    expect(new Set(ids.map(kindOf)).size).toBeGreaterThanOrEqual(8);
  });

  it('seeds a different picture for every pair of places at the same moment', () => {
    const sameKind = new Map<string, string[]>();
    for (const id of ids) {
      const kind = kindOf(id);
      sameKind.set(kind, [...(sameKind.get(kind) ?? []), id]);
    }
    // Two places of *different* kinds differ by which channels are filled at all; the ones that
    // share a kind can only differ by their seed. That is where the old bug lived, so that is where
    // the pairwise check bites: every group of two or more, every pair inside it.
    const collisions: string[] = [];
    let pairs = 0;
    for (const group of sameKind.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          pairs += 1;
          const a = group[i] as string;
          const b = group[j] as string;
          if (shapeOf(a) === shapeOf(b)) collisions.push(`${a} == ${b}`);
        }
      }
    }
    expect(pairs, 'no two places share a kind, so this scan proves nothing').toBeGreaterThan(20);
    expect(collisions, 'two places draw the same room').toEqual([]);
  });

  it('fills the channels the kind is known by, and only those', () => {
    const filled = (id: string): string[] => {
      const geometry = geometryFor(stateFor(id));
      return [
        geometry.blocks.length > 0 ? 'blocks' : '',
        geometry.ridge.length > 0 ? 'ridge' : '',
        geometry.bokeh.length > 0 ? 'bokeh' : '',
        geometry.neon.length > 0 ? 'neon' : '',
        geometry.steps.length > 0 ? 'steps' : '',
      ].filter((channel) => channel !== '');
    };
    // The stairwell's flight and the street's signs are the two shapes a player can name at a
    // glance; each has to be the only kind that carries it.
    expect(filled('stairwell')).toContain('steps');
    expect(filled('neon-street')).toContain('neon');
    expect(filled('mountain')).toContain('ridge');
    const onlyFor = (channel: string): string[] => ids.filter((id) => filled(id).includes(channel));
    expect(onlyFor('steps'), 'steps belong to the stairwell alone').toEqual(['stairwell']);
    expect(onlyFor('ridge'), 'a ridge belongs to the mountain alone').toEqual(['mountain']);
    // Neon is not a place's quirk, it is what the `street` kind draws — so the rule, not the
    // accident: every street has signs and nothing else has them.
    expect(onlyFor('neon').sort()).toEqual(ids.filter((id) => kindOf(id) === 'street').sort());
    expect(onlyFor('neon').length).toBeGreaterThanOrEqual(2);
  });

  it('puts every one of the five clutter pieces inside the room it seeded them for', () => {
    for (const id of ids) {
      for (const detail of geometryFor(stateFor(id)).details) {
        expect(detail.x + detail.w, `${id} detail off the right edge`).toBeLessThanOrEqual(1);
        expect(detail.x, `${id} detail off the left edge`).toBeGreaterThanOrEqual(0);
        expect(detail.y + detail.h, `${id} detail below the wall`).toBeLessThanOrEqual(0.7);
        expect(detail.kind).toBeLessThan(4);
      }
    }
  });

  it('uses the whole clutter vocabulary, not one favourite shape', () => {
    // `backdrop.ts` draws each `kind` differently, so a vocabulary entry nobody can reach is a piece
    // of the room that quietly stopped existing. Over twelve days every place gets to roll all four.
    const seen = new Set<number>();
    for (const id of ids) {
      for (let day = 1; day <= 12; day++) {
        for (const detail of geometryFor(stateFor(id, 3, day)).details) seen.add(detail.kind);
      }
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('the same break puts the room back exactly where it was', () => {
  it('answers twice with the same shape, and moves it only when the day moves', () => {
    const first = geometryFor(stateFor('quiet-room'));
    const again = geometryFor(stateFor('quiet-room'));
    expect(again).toEqual(first);
    // The day is part of the seed on purpose (§71): tomorrow's corner has its bin on the other
    // side, but nothing moves between two frames of one break.
    const tomorrow = geometryFor(stateFor('quiet-room', 3, 6));
    expect(JSON.stringify(tomorrow)).not.toBe(JSON.stringify(first));
  });

  it('keeps the level in the seed, so a room you grow into is not the room you started in', () => {
    expect(shapeOf('smoking-corner', 1)).not.toBe(shapeOf('smoking-corner', 9));
  });
});

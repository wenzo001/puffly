/**
 * The cherry's light and the burn's hiss have to be the same number — SPEC.md §26, §27, and the
 * sentence the brief hands to both adapters: 声音是一定要跟画面连接的.
 *
 * This is the surviving half of tests/ember-and-burn.test.ts, retired with the 2D renderer on
 * 2026-10-10. The painted-layer halves (the cherry's baked alphas and the game-renderer source
 * scan) retired with that package; the claim that cannot retire is the audio one: the burn bed's
 * target and its realised level must read the same `emberPresence` the scene paints the ember with,
 * so the two cannot drift.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emberPresence } from '@puffly/game-core';
import { bedTargets } from '../beds';
import { makeState } from './fixture';
import { createHarness } from './harness';

describe('the ember the player sees is the ember the player hears (§26)', () => {
  it('drives the burn bed off the shared number, exactly', () => {
    for (const flicker of [-1, -0.4, 0, 0.6, 1]) {
      const state = makeState({ brightness: 0.7, flare: 0.1, flicker });
      const presence = emberPresence(state.cigarette.ember);
      expect(bedTargets(state, false).ember.gain, `flicker=${String(flicker)}`).toBeCloseTo(
        presence,
        12,
      );
    }
  });

  it('and the graph follows, not only the target', () => {
    const h = createHarness();
    h.run(4000, makeState({ brightness: 0.7, flare: 0, flicker: -1 }));
    const low = h.engine.bedLevel('ember');
    h.run(4000, makeState({ brightness: 0.7, flare: 0, flicker: 1 }));
    const high = h.engine.bedLevel('ember');
    console.log(`EMBER bedLevel ${low.toFixed(4)} -> ${high.toFixed(4)}`);
    expect(high).toBeGreaterThan(low);
    expect(high - low).toBeGreaterThan(0.05);
  });

  it('leaves the audio adapter without its own copy of the formula', () => {
    // The structural half: a flare coefficient re-derived in the audio adapter is how the hiss and
    // the picture drift apart without anything failing. No `/g`: `test()` on a global regex
    // advances `lastIndex`, so the second file scanned would be searched from wherever the first
    // stopped.
    const rederive = /ember\.brightness\s*\+/;
    const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const at = join(dir, entry);
        if (entry === '__tests__' || entry.startsWith('.')) continue;
        if (statSync(at).isDirectory()) walk(at);
        else if (at.endsWith('.ts')) files.push(at);
      }
    };
    walk(root);
    expect(files.length, 'the audio sources this scan walks').toBeGreaterThan(5);

    const offenders = files
      .filter((file) => rederive.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(root.length + 1));
    console.log(`EMBER rederive offenders=${offenders.join(',') || 'none'}`);
    expect(offenders).toEqual([]);
    // The positive control: the pattern this forbids is the exact line the core is allowed.
    expect(rederive.test('const t = clamp01(ember.brightness + ember.flare * 0.5);')).toBe(true);
  });
});

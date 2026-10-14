/**
 * §48: the renderer, audio and storage sides only ever *read* the simulation.
 *
 * `packages/shared/src/readonly.ts` says this rule "is a compile error rather than a convention",
 * and that is true of the type — measured 2026-10-13 by compiling a probe against `GameStateView`:
 * `view.nowMs = 123`, `view.cigarette.puff.lastDraw = 1` and `view.anchors.body.x = 0.5` are all
 * `TS2540: Cannot assign to … because it is a read-only property`, at every depth the type reaches.
 *
 * **What the type cannot do is survive a cast.** `DeepReadonly` erases at runtime, and the engine
 * hands out the *same* object it mutates, so a single `as unknown as` writes straight into the
 * simulation: measured in the same round — `view.cigarette.puff.lastDraw = 0.99` followed by
 * `engine.getState()` reading `0.99` back. So the honest statement is narrower than the file's:
 *
 *   the type makes an honest write a compile error; nothing makes a dishonest one fail.
 *
 * This file pins what *is* guaranteed, which is the part that decays: no production file reaches a
 * state view through a cast, and no production file assigns to one.
 *
 * **What it provably catches**, both by mutation on 2026-10-13:
 *   - `view.cigarette.puff.lastDraw = …` on a view named by the shell (`summary.value.state`,
 *     `props.state`, or the local `usePuffly` holds after `getState()`);
 *   - `(state as unknown as { nowMs: number }).nowMs = …` — the assignment sitting on the *cast*.
 *
 * **What it does not catch**, also by mutation, and stated here so nobody reads the green as more:
 *   - a cast **alias** then an ordinary write — `const w = state as unknown as {…}; w.cigarette.… = 0.5`
 *     passed this file green. The write is on a different name, so a source read cannot see it.
 *   - any write that does not resemble the shapes above.
 *
 * That limit is why the alias route is closed one layer up rather than here: **`state/no-state-cast`**
 * in `eslint.config.mjs` forbids the cast itself — any `as unknown` / `as any` whose target names one
 * of the core's state fields — so the alias needs a cast, and the cast is what CI rejects. The write
 * stays invisible to this file; the thing that enables it does not.
 *
 * So the honest division, as of 2026-10-13: the **type** makes an uncast write a compile error at
 * every depth, the **lint rule** makes the enabling cast an error, and this file is the third net — a
 * cheap read naming what the other two would miss if they ever stopped applying. The counts are
 * printed so a reader who sees them move knows the guard has been widened, rather than having to notice.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from './sourceProbe';

/** The packages that receive the view and must not write it (§48's "renderer/audio/storage side"). */
const CONSUMERS = [
  'apps/web/src',
  'packages/game-scene/src',
  'packages/game-audio/src',
  'packages/game-storage/src',
];

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

/** Every production source under the consumer packages, tests excluded. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...sources(path));
      continue;
    }
    if (/\.(ts|vue)$/.test(entry)) out.push(path);
  }
  return out;
}

const files = CONSUMERS.flatMap(sources).map((path) => ({
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}));

/**
 * The core's view, named the way the shell actually names it.
 *
 * A first version matched bare `state.` / `live.` / `view.` and reported three "writes" that were a
 * local PRNG ref in `rodBurn.ts` (`state.value = …`) and two pointer coordinates in
 * `useInputAdapters.ts` (`live.x = …`). So the pattern has to name the *view*, and the way to tell
 * them apart without a type checker is to name fields that exist only on the core's state: the
 * simulation's own vocabulary, which no local shell variable is shaped like.
 */
const VIEW_ROOTS = [
  // The shell holds it as `summary.value.state` and as the props' `state`.
  'summary\\.value\\.state',
  'props\\.state',
  'summary\\.state',
  // `usePuffly` reads the engine directly into a local: `const state = engine.getState()`. It is the
  // one place a bare name really is the view, so it is named by its own field vocabulary below.
  '\\b(?:state|live)\\.(?=(?:cigarette|anchors|style|environment|ui|progress|collection|lighter|ashtray|pack|stage)\\b)',
];

const viewWrites = (text: string): string[] => {
  const found: string[] = [];
  for (const root of VIEW_ROOTS) {
    for (const m of text.matchAll(
      new RegExp(`${root}\\.([A-Za-z0-9_.[\\]'"]+)\\s*(=|\\+=|-=|\\*=|\\+\\+|--)(?!=)`, 'g'),
    )) {
      found.push(m[0].trim());
    }
  }
  // The shape a §48 regression actually takes, and the one the patterns above miss: the assignment
  // sits on the *cast*, not on the view — `(state as unknown as { nowMs: number }).nowMs = 0`.
  // Measured: a guard that only watched `view.x =` passed that line, which is the exact write the
  // runtime experiment showed corrupting the simulation.
  //
  // The object type has to look like state, or `window.__pufflyScene` — also a cast-assign, also
  // legitimate, since it publishes a probe rather than touching the simulation — reads as a violation.
  const STATE_FIELDS =
    'cigarette|anchors|style|environment|ui|progress|collection|lighter|ashtray|pack|stage|nowMs|nowWallClockMs';
  for (const m of text.matchAll(
    new RegExp(
      `\\(([A-Za-z0-9_$.\\[\\]]+)\\s+as\\s+(?:unknown\\s+as|any)\\s*\\{([^}]*)\\}\\s*\\)\\s*\\.[A-Za-z0-9_.\\[\\]'"]+\\s*(?:=|\\+=|-=|\\*=|=(?!=))`,
      'g',
    ),
  )) {
    if (new RegExp(`\\b(?:${STATE_FIELDS})\\b`).test(m[2] ?? '')) found.push(m[0].trim());
  }
  return found;
};

describe('the state view is read, not written (§48)', () => {
  it('the shell reaches no state through a cast', () => {
    // The one escape hatch the type cannot close. Measured: 2 such casts exist in production source
    // and neither touches state — one publishes the scene probe on `window`, one casts a colour array
    // in `backdrop.ts`. This is the line that keeps that true.
    const casts = files.filter((f) => /as unknown as|as any\b/.test(f.text));
    const touchingState = casts.filter((f) =>
      /as (?:unknown as|any)\s*(?:GameStateView|\{[^}]*state)|getState\(\)\s*as/.test(f.text),
    );
    console.log(`CASTS ${String(casts.length)} files, ${String(touchingState.length)} reach state`);
    expect(
      touchingState.map((f) => `${f.path}: ${/as unknown as [^\n]{0,60}/.exec(f.text)?.[0] ?? ''}`),
      'a cast reaches a state view — §48 is a compile error only for code that does not cast',
    ).toEqual([]);
  });

  it('no production file assigns to a state field', () => {
    // `view.cigarette.puff.lastDraw = 0.99` compiled through a cast changed the simulation, so an
    // assignment anywhere in these packages is the shape that matters. `+=`, `-=` and friends are
    // counted too: a read-modify-write is still a write.
    const writes = files.flatMap((f) => viewWrites(f.text).map((w) => `${f.path}: ${w}`));
    console.log(`WRITES ${String(writes.length)} ${writes.slice(0, 4).join(' | ')}`);
    expect(writes, 'a production file assigns to the state view — §48').toEqual([]);
  });

  it('the engine hands out the view as DeepReadonly, so the rule is typed not promised', () => {
    const engine = readFileSync(join(ROOT, 'packages/game-core/src/engine.ts'), 'utf8');
    expect(engine).toContain('export type GameStateView = DeepReadonly<GameState>;');
    // And `getState` is typed with it, so a caller cannot be handed something looser.
    expect(engine).toMatch(/getState\(\): GameStateView;/);
    const shared = readFileSync(join(ROOT, 'packages/shared/src/readonly.ts'), 'utf8');
    expect(shared).toContain('export type DeepReadonly');
  });
});

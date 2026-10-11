/**
 * §70 and §73 as a guard test: this package must derive, and it must stay platform-free.
 *
 * The interesting rule is the first one — "统计系统必须从 Session Event 推导". A stored
 * counter that drifts from the log is exactly the bug §70 forbids, so the sources are
 * scanned for the two ways it could sneak in: reading `Progress`'s counters, or keeping a
 * mutable module-level total.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: URL): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(fileURLToPath(directory), { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) paths.push(...sourceFiles(child));
    else if (entry.name.endsWith('.ts')) paths.push(fileURLToPath(child));
  }
  return paths.sort();
}

const SRC = new URL('../', import.meta.url);
const files = sourceFiles(SRC);
const allSource = files.map((file) => readFileSync(file, 'utf8')).join('\n');

describe('§70: statistics are derived, never stored', () => {
  it('has source files to scan', () => {
    expect(files.length).toBeGreaterThan(4);
  });

  it('never reads the counters on Progress', () => {
    for (const forbidden of [
      'progress.sessions',
      'progress.puffs',
      'progress.ashDropped',
      'progress.longestStreakDays',
      'progress.dayNumber',
    ]) {
      expect(allSource.includes(forbidden), `the package read ${forbidden}`).toBe(false);
    }
  });

  it("does keep one honest use of Progress: the player's own day-1 anchor", () => {
    expect(allSource).toContain('progress.startedAt');
  });

  it('keeps no module-level mutable total', () => {
    // Every derivation is a function of its arguments; a `let` at module scope would be a
    // counter in disguise (§70).
    const moduleLevelLet = allSource.split('\n').filter((line) => /^(let|var)\s/.test(line));
    expect(moduleLevelLet).toEqual([]);
  });

  it('never mutates the log it is handed', () => {
    for (const forbidden of [
      'sessions.push',
      'sessions.splice',
      '.events.push',
      'session.triggers.push',
    ]) {
      expect(allSource.includes(forbidden), `the package wrote ${forbidden}`).toBe(false);
    }
  });
});

describe('§47/§73: the derivation layer stays platform-independent', () => {
  it('imports nothing from the adapters or a framework', () => {
    for (const forbidden of [
      '@puffly/game-storage',
      '@puffly/game-scene',
      '@puffly/game-audio',
      '@puffly/web',
      'vue',
      'vitest',
      'node:',
      'indexedDB',
    ]) {
      const hits = files.filter((file) => readFileSync(file, 'utf8').includes(forbidden));
      expect(hits.map((file) => `${forbidden} in ${file}`)).toEqual([]);
    }
  });
});

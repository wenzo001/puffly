/**
 * The 统计 block, checked as a landing and as a set of numbers rather than as pixels.
 *
 * Two ways this rots silently, and both happened elsewhere in this app already:
 *  - a rail entry whose section no element answers to (the collected box was a tap that did nothing);
 *  - a number on screen that is not the ledger's, which is how a readout starts telling its own story.
 * So the file checks that the hook exists, and that every digit printed here is a named field of the
 * statistics layer or the live progress — never a literal, never a re-derivation.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, type CopyKey } from '../i18n';
import { RAIL_ENTRIES } from '../rail';

const SHEET = readFileSync(new URL('../components/SessionSheet.vue', import.meta.url), 'utf8');

/** The `data-hook` values the break sheet can actually land on. */
const hooks = (source: string): string[] =>
  [...source.matchAll(/data-hook="([a-z-]+)"/g)].map((match) => match[1] ?? '');

/**
 * The labelled rows of the stats group, between its opening tag and the panel that follows.
 *
 * A function, not a module-level constant: an `expect` that runs at import turns a real failure
 * into a file that cannot be collected, and the suite then prints `no tests` instead of the one
 * thing that went wrong.
 */
function statsBlock(): string {
  const start = SHEET.indexOf('data-hook="stats"');
  expect(start, 'the break sheet lost its 统计 block').toBeGreaterThan(-1);
  const end = SHEET.indexOf('<ReductionPanel', start);
  return SHEET.slice(start, end);
}

/** The ladder on its own, and the styles that give its two markers a reader. */
function ladderBlock(): string {
  const start = SHEET.indexOf('data-hook="achievements"');
  expect(start, 'the break sheet lost its achievement ladder').toBeGreaterThan(-1);
  return SHEET.slice(start, SHEET.indexOf('<ReductionPanel', start));
}

const STYLE = SHEET.slice(SHEET.indexOf('<style scoped>'));

describe('the 统计 block is a landing and a ledger (S11, S13)', () => {
  it('answers every break-sheet entry in the rail with an element', () => {
    const landed = hooks(SHEET).concat(
      hooks(readFileSync(new URL('../components/ReductionPanel.vue', import.meta.url), 'utf8')),
    );
    const asked = RAIL_ENTRIES.filter(
      (entry) => entry.sheet === 'break' && entry.section !== null,
    ).map((entry) => entry.section as string);
    expect(asked.length, 'the rail is supposed to ask for a section').toBeGreaterThan(0);
    for (const section of asked) {
      expect(landed, `rail entry ${section} has nothing to scroll to`).toContain(section);
    }
  });

  it('prints only numbers the ledger already has', () => {
    const fields = [...statsBlock().matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map(
      (match) => match[1] ?? '',
    );
    // Every one is a named fact off `stats` (the statistics layer), `summary` (the live ledger) or
    // `nextRod` (the ladder's own threshold). A digit written as a literal would land here unnamed.
    expect(fields.length, 'the block prints numbers').toBeGreaterThanOrEqual(5);
    // The ladder's rows are in this block too, and they name the same kind of facts — each one is a
    // read-out of `achievementsFor` / `reachedCount`, which are core functions over the ledger. The
    // rule stays what it was: no arithmetic and no literal digits in the template.
    const allowed =
      /^(stats\.[a-zA-Z0-9]+|summary\.[a-zA-Z0-9.]+|sticksKept|hoursSmoked|nextRod\.at|achieved|rungs\.length|row\.(name|value|reached|total|goal|ratio|fresh|minGust))$/;
    for (const field of fields) expect(field, `${field} is not a ledger field`).toMatch(allowed);
    expect(fields).toContain('stats.totalPuffs');
    expect(fields).toContain('stats.currentStreakDays');
    expect(fields).toContain('hoursSmoked');
    // What the ladder is allowed to print is a named value off a core function, so the function has
    // to be imported here rather than re-derived in the template.
    expect(SHEET).toContain("achievementsFor, reachedCount } from '@puffly/game-core'");
    expect(fields).toContain('achieved');
    // And a number written as prose is the same failure in the other direction: the pass above only
    // sees what is inside `{{ }}`, so a literal baked into the markup (`/ 23`) needs its own look.
    // Three kinds of text are not output: the interpolations, the comments that explain a row, and
    // the attribute bindings (expressions, which the pass above already judges by name).
    const literalDigits = [
      ...statsBlock()
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s:?[a-zA-Z-]+="[^"]*"/g, '')
        .matchAll(/[0-9]/g),
    ].length;
    expect(literalDigits, 'a digit written into the markup instead of read off the ledger').toBe(0);
  });

  it('names each row in both tiers that says words', () => {
    const keys = [...statsBlock().matchAll(/copy\.t\('([a-zA-Z0-9.]+)'\)/g)].map((m) => m[1] ?? '');
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const key of keys) {
      expect(COPY['en']?.[key as CopyKey], key).toBeTypeOf('string');
      expect(COPY['zh-CN']?.[key as CopyKey], key).toBeTypeOf('string');
    }
  });

  it('the group is not silent to a screen reader, and the minutes are minutes', () => {
    expect(statsBlock()).toContain("copy.say('rail.stats')");
    // The label says 总时长 and the digit is a count of minutes: the conversion has to be a
    // division by 60000 in one place, not a formatting choice in two.
    expect(SHEET).toMatch(/totalDurationMs \/ 60000/);
  });
});

/**
 * The ladder's two states, each with exactly one writer and one reader (§39: 它自己亮一下).
 *
 * This is where the previous commit left a hole: it bound `data-reached` on the axis rows and gave it
 * no reader at all, so the attribute was a claim the file could not show — and the three gust names
 * rendered identically whether the player had drawn one or not. So the guard counts bindings as well
 * as looking for rules: a marker written twice with one reader is exactly the bug that shipped.
 */
describe('the ladder says its two states, and only its two states (S13)', () => {
  it('binds the fade to both halves and the locked look to the one that needs it', () => {
    const block = ladderBlock();
    expect(
      [...block.matchAll(/:data-fresh=/g)].length,
      'the ladder and the moments both fade',
    ).toBe(2);
    expect(
      [...block.matchAll(/:data-reached=/g)].length,
      'only the moments have a state the digits do not carry',
    ).toBe(1);
    // The axis rows' state is carried by the bar, under a name of its own: `ratio` is a fraction and
    // `data-reached` is a yes/no, so one attribute cannot honestly answer both. This is the same
    // "one marker, one reader" rule the case above enforces — the axis rows had `data-reached` and
    // no reader for it, and a bar reading an attribute named for something else would repeat it.
    expect(
      [...block.matchAll(/:data-met=/g)].length,
      'the axis rows carry their own marker, and the moments do not',
    ).toBe(1);
    expect(STYLE).toMatch(/\.line\[data-met='true'\]\s+\.count/);
    // One home for the rule that decides when a row counts as just-lit, imported rather than
    // re-implemented in the row.
    expect(SHEET).toContain("import { useJustLit } from '../reveal'");
  });

  it('reads every marker it writes', () => {
    expect(STYLE).toMatch(/\.line\[data-fresh='true'\]\s*\{[^}]*animation:\s*rung-lit/);
    const frames = /@keyframes rung-lit\s*\{[\s\S]*?\n\}/.exec(STYLE);
    expect(frames, 'the animation names a set of frames that is not there').not.toBeNull();
    // It starts below and transparent: an offset that is not positive is a flash, not a rise.
    expect(String(frames?.[0])).toMatch(/0%\s*\{[^}]*translateY\([1-9]\d*px\)/);
    expect(String(frames?.[0])).toMatch(/0%\s*\{[^}]*opacity:\s*0/);
    // 未抽到 goes to the declared 次级色, and `not-yet-look.test.ts` is what forbids the other way
    // (dimming the row), so the three gust names are not three identical rows without going unreadable.
    const locked = STYLE.slice(
      STYLE.indexOf(".line.moment:not([data-reached='true'])"),
      STYLE.indexOf('}', STYLE.indexOf(".line.moment:not([data-reached='true'])")),
    );
    expect(locked, 'the moment rows lost their 还没有 colour').toContain('color: var(--ash-gray)');
    expect(locked).not.toMatch(/opacity:/);
  });

  it('gives the fade the same reduced-motion gate the rest of the house does', () => {
    const gate =
      /prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\.line\[data-fresh='true'\]\s*\{\s*animation:\s*none/.exec(
        STYLE,
      );
    expect(
      gate,
      'a motion that cannot be turned off is not one the player agreed to',
    ).not.toBeNull();
  });
});

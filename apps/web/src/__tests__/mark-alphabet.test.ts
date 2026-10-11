/**
 * One glyph, one meaning — the alphabet the whole interface is read with.
 *
 * The marks are the only thing a player reads a tier by at a glance: two cards can both say `14`
 * and mean different doors. That only works if a shape never changes sides, and it had already
 * broken once — the rung for *draws* borrowed `—`, which is the rod on the rail and in the HUD, so
 * a smoke shape at `—120` read as 120 sticks, an order of magnitude out, on the row the brief asks
 * to be read as tiers.
 *
 * The alphabet is written down in four places (the rail, the cabinet's kit, the HUD's readouts, the
 * collection rungs), so this reads all four and holds them against one meaning each. The alias table
 * below is the test's own claim about which names are the same thing — it is short on purpose, and
 * a new name has to be placed in it deliberately rather than absorbed silently.
 *
 * Outside this alphabet on purpose: `≈` used as prose inside 档案, where it marks an estimate and
 * not a category. It is also `≈` as the smoke-shape mark in the kit, which is a real ambiguity and
 * is written down in SPEC.md rather than quietly fixed here.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAIL_ENTRIES } from '../rail';
import { RUNG_MARKS } from '../scenes';

const HUD_SOURCE = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');
const SHEET_SOURCE = readFileSync(
  new URL('../components/CollectionSheet.vue', import.meta.url),
  'utf8',
);
const PILL_SOURCE = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');
const TAB_SOURCE = readFileSync(new URL('../components/TabRail.vue', import.meta.url), 'utf8');
const REDUCE_SOURCE = readFileSync(
  new URL('../components/ReductionPanel.vue', import.meta.url),
  'utf8',
);

/** The canonical thing each source's own name stands for. */
const MEANING: Record<string, string> = {
  // rail
  break: 'a break',
  ladder: 'a rod',
  boxes: 'a box',
  skins: 'a skin',
  kit: 'the kit',
  reduction: 'the reduction',
  settings: 'the settings',
  // HUD readouts
  rod: 'a rod',
  lighter: 'a lighter',
  tray: 'the tray',
  out: 'a stubbed rod',
  menu: 'the menu',
  // cabinet kit categories
  LIGHTERS: 'a lighter',
  ASHTRAYS: 'the tray',
  SMOKE: 'a smoke shape',
  SOUNDS: 'a sound',
  // rung axes
  breaks: 'a break',
  draws: 'a draw',
  level: 'a level',
  // S11's 统计 entry: the ledger's own numbers, which is also what `▤` must never come to mean on
  // any other surface.
  stats: 'the ledger',
  // §2's Demo icons (the SVG vocabulary that replaced the ASCII gesture marks). A gesture and the
  // object it uses are one referent on purpose: the flame on the pill (hold the lighter), in the
  // header ring and on the tab all mean the lighter; the rod on 取烟 is the cigarette that arrives,
  // the same rod the header and the smoking tab wear.
  airflow: 'a draw',
  'swirl-dot': 'a draw',
  'exhale-arrow': 'a draw',
  flick: 'the ash',
  'tray-lines': 'the ash',
  extinguish: 'a stubbed rod',
  discard: 'the tray',
  ashtray: 'the tray',
  gear: 'the settings',
  light: 'a lighter',
  // S23's three substitutes. `⌇` is the one to watch: it is a hair away from `⌁`, which is 磕灰.
  breathe: 'a breath',
  water: 'a drink',
  walk: 'a walk',
};

const GLYPH_SOURCE = readFileSync(new URL('../components/DemoGlyph.vue', import.meta.url), 'utf8');

/**
 * §2's icons are the vocabulary that replaced the ASCII gesture marks: the header ring, the pill
 * and the rail all render `DemoGlyph` by name. Each surface is scanned for the names it binds, so
 * "one shape never changes sides" now means "one icon name never changes referents".
 */
function hudIcons(source: string): Array<[string, string]> {
  return [...source.matchAll(/glyph: '([a-z-]+)'/g)].map((match) => ['ring', String(match[1])]);
}
function pillIcons(source: string): Array<[string, string]> {
  return [...source.matchAll(/case '(\w+)':\s*\n?\s*return '([a-z-]+)'/g)].map((match) => [
    String(match[1]),
    String(match[2]),
  ]);
}
function railIcons(source: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const match of source.matchAll(/id: '(\w+)', icon: '([a-z-]+)'/g)) {
    out.push([String(match[1]), String(match[2])]);
  }
  // The settings button is a button, not a TABS entry.
  for (const match of source.matchAll(/<DemoGlyph[^>]*name="([a-z-]+)"/g)) {
    out.push(['settings', String(match[1])]);
  }
  return out;
}

/** Every icon name `DemoGlyph` actually implements. */
const SUPPORTED_ICONS = new Set(
  [...GLYPH_SOURCE.matchAll(/name === '([a-z-]+)'/g)].map((match) => String(match[1])),
);

/** 减量页's three substitutes are marks from the same geometric family, so they are judged here too. */
function alternativeMarks(source: string): Array<[string, string]> {
  // Tolerant of what else the row carries: the alternatives became counted controls and gained an
  // id, and a shape-locked reader would have dropped all three marks out of the alphabet without
  // saying which one moved — which is exactly the failure this file exists to catch.
  return [
    ...source.matchAll(/\{[^{}]*key: 'reduction\.alt\.(\w+)'[^{}]*glyph: '([^']+)'[^{}]*\}/g),
  ].map((match) => [String(match[1]), String(match[2])]);
}

/** What each Demo icon refers to, by icon name (one icon may be bound on several surfaces). */
const ICON_MEANING: Record<string, string> = {
  rod: 'a rod',
  flame: 'a lighter',
  airflow: 'a draw',
  'swirl-dot': 'a draw',
  'exhale-arrow': 'a draw',
  flick: 'the ash',
  'tray-lines': 'the ash',
  extinguish: 'a stubbed rod',
  ashtray: 'the tray',
  gear: 'the settings',
};

const icons: Array<{ icon: string; meaning: string; where: string }> = [
  ...hudIcons(HUD_SOURCE).map(([, icon]) => ({
    icon,
    meaning: ICON_MEANING[icon] ?? icon,
    where: `hud:${icon}`,
  })),
  ...pillIcons(PILL_SOURCE).map(([affordance, icon]) => ({
    icon,
    meaning: ICON_MEANING[icon] ?? MEANING[affordance] ?? icon,
    where: `pill:${affordance}`,
  })),
  ...railIcons(TAB_SOURCE).map(([tab, icon]) => ({
    icon,
    meaning: ICON_MEANING[icon] ?? MEANING[tab] ?? icon,
    where: `rail:${tab}`,
  })),
];

/** The text-mark alphabet: the desk rail, the collection rungs, the kit and S23's substitutes. */
const alphabet: Array<{ glyph: string; meaning: string; where: string }> = [
  ...RAIL_ENTRIES.map((entry) => ({
    glyph: entry.glyph,
    meaning: MEANING[entry.id] ?? entry.id,
    where: `rail:${entry.id}`,
  })),
  ...Object.entries(RUNG_MARKS)
    .filter(([, glyph]) => glyph !== null)
    .map(([unit, glyph]) => ({
      glyph: glyph as string,
      meaning: MEANING[unit] ?? unit,
      where: `rung:${unit}`,
    })),
  ...[...SHEET_SOURCE.matchAll(/CollectionCategory\.(\w+),\s*glyph:\s*'([^']+)'/g)].map(
    (match) => ({
      glyph: match[2] ?? '',
      meaning: MEANING[match[1] ?? ''] ?? match[1] ?? '',
      where: `kit:${match[1]}`,
    }),
  ),
  ...alternativeMarks(REDUCE_SOURCE).map(([key, glyph]) => ({
    glyph,
    meaning: MEANING[key] ?? key,
    where: `reduction:${key}`,
  })),
];

describe('the mark alphabet means one thing (§23, §55)', () => {
  it('knows every mark the interface wears', () => {
    // The denominator, printed so a new site cannot be added without widening this list.
    console.log(
      `ALPHABET ${alphabet.length} marks: ${alphabet.map((m) => `${m.glyph}=${m.meaning}`).join(' ')}`,
    );
    // The denominator, with the loop's own surfaces removed since §2 replaced their ASCII marks
    // with the Demo SVG vocabulary (judged by the icon describe below): eight rail, three rungs,
    // five kit categories and S23's three substitutes.
    expect(alphabet.length).toBe(8 + 3 + 5 + 3);
  });

  it('never lets one shape mean two things', () => {
    const clashes: string[] = [];
    for (const entry of alphabet) {
      const same = alphabet.filter(
        (other) => other.glyph === entry.glyph && other.meaning !== entry.meaning,
      );
      for (const other of same) clashes.push(`${entry.glyph}: ${entry.where} vs ${other.where}`);
    }
    expect([...new Set(clashes)]).toEqual([]);
  });

  it('keeps the rungs distinguishable from each other', () => {
    // The reason the marks exist: `14` and `14` are two different doors.
    const rungGlyphs = Object.values(RUNG_MARKS).filter((glyph) => glyph !== null);
    expect(new Set(rungGlyphs).size).toBe(rungGlyphs.length);
  });

  it('reddens when a rung borrows a mark that already means something else', () => {
    // The regression this file was written for, stated as a case rather than as prose.
    const rod = alphabet.filter((entry) => entry.glyph === '—');
    expect(rod.length).toBeGreaterThan(0);
    for (const entry of rod) expect(entry.meaning).toBe('a rod');
  });

  it('wears marks that are actually characters, not escape sequences', () => {
    // `\u2307` inside a `<template>` is not the character: Vue has no string escapes there, so the
    // row prints the six ASCII characters, which a player reads as "a unicode thing that did not
    // render". Only the template is scanned — in a script a real escape is correct code.
    const escape = /\\u[0-9a-fA-F]{4}/;
    const dir = new URL('../components/', import.meta.url);
    const files = readdirSync(dir).filter((name) => name.endsWith('.vue'));
    expect(files.length, 'the components this scans').toBeGreaterThan(6);
    const offenders = files
      .filter((name) => {
        const source = readFileSync(new URL(name, dir), 'utf8');
        const end = source.indexOf('</template>');
        return escape.test(source.slice(0, end < 0 ? source.length : end));
      })
      .map((name) => name);
    console.log(`GLYPH escape offenders=${offenders.join(',') || 'none'}`);
    expect(offenders).toEqual([]);
    // The positive control: the exact shape the scan forbids must be reported by it.
    expect(escape.test('\\u2307\n      </button>')).toBe(true);
  });

  it('reads every substitute the reduction panel names', () => {
    expect(alternativeMarks(REDUCE_SOURCE).map(([key]) => key)).toEqual([
      'breathe',
      'water',
      'walk',
    ]);
  });
});

describe('the Demo icon vocabulary means one thing (§2)', () => {
  it('reads the five header, six pill and four rail bindings', () => {
    // Extractor tripwires: a markup change that silently drops a surface shrinks this list.
    expect([...new Set(hudIcons(HUD_SOURCE).map(([, icon]) => icon))].sort()).toEqual(
      ['airflow', 'flame', 'rod', 'swirl-dot', 'tray-lines'].sort(),
    );
    expect(pillIcons(PILL_SOURCE).map(([key]) => key)).toEqual([
      'pick',
      'lighter',
      'puff',
      'flick',
      'extinguish',
      'discard',
    ]);
    expect(railIcons(TAB_SOURCE).map(([key]) => key)).toEqual([
      'light',
      'puff',
      'tray',
      'settings',
    ]);
    // No surface may bind an icon the component does not draw.
    for (const entry of icons) {
      expect(SUPPORTED_ICONS.has(entry.icon), `${entry.where} binds unknown ${entry.icon}`).toBe(
        true,
      );
    }
    console.log(
      `ICONS ${icons.length} bindings: ${icons
        .map((m) => `${m.where}→${m.icon}(${m.meaning})`)
        .join(' ')}`,
    );
  });

  it('never lets one icon name mean two things', () => {
    const clashes: string[] = [];
    for (const entry of icons) {
      const same = icons.filter(
        (other) => other.icon === entry.icon && other.meaning !== entry.meaning,
      );
      for (const other of same) clashes.push(`${entry.icon}: ${entry.where} vs ${other.where}`);
    }
    expect([...new Set(clashes)]).toEqual([]);
  });

  it('keeps the cross-surface referents the Demo drew', () => {
    // The flame is the lighter on all three loop surfaces; the rod is the rod on 取烟， the header
    // and the smoking tab; the ashtray means the tray whether the pill discards or the rail points;
    // the two ash glyphs (flick / tray-lines) both mean the ash.
    const where = (icon: string) => icons.filter((e) => e.icon === icon);
    for (const e of where('flame')) expect(e.meaning).toBe('a lighter');
    for (const e of where('rod')) expect(e.meaning).toBe('a rod');
    for (const e of where('ashtray')) expect(e.meaning).toBe('the tray');
    for (const e of [...where('flick'), ...where('tray-lines')]) {
      expect(e.meaning).toBe('the ash');
    }
    for (const e of where('gear')) expect(e.meaning).toBe('the settings');
  });
});

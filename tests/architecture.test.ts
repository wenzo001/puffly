/**
 * Architecture guard tests — SPEC.md §73.
 *
 * §47 says what Game Core may not know about, §81 (10/11/12) says the same for the whole pure
 * layer, and §86 says every future platform must reuse it. Rules written only in prose decay,
 * so this file enforces them on the source text.
 *
 * Two things this file is careful about, because both have burned this codebase before:
 *  - comments are stripped before matching, so the layer's own documentation ("no Vue, no DOM")
 *    does not count as a violation;
 *  - string literals are NOT stripped, because import specifiers live in strings. An earlier
 *    version blanked them and every import-based check below silently passed nothing. Each
 *    matcher therefore has a positive control in `the scanner itself` — a feed of text that MUST
 *    be reported. A guard that cannot fail is decoration.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const PURE_PACKAGES = [
  'packages/shared',
  'packages/game-core',
  'packages/game-content',
  'packages/game-statistics',
];
const ADAPTER_PACKAGES = [
  // The 3D scene: TresJS + three/webgpu. It replaced the Canvas 2D renderer (2026-10-10), and its
  // formulas moved in with it — the package is an adapter like the others: it may touch the
  // platform, and it may not be imported by a pure package.
  'packages/game-scene',
  'packages/game-audio',
  'packages/game-storage',
];

/** Platform objects the pure layer may not reach for. Matched as uses, not as words in prose. */
const BANNED_USES = [
  { name: 'window', pattern: /\bwindow\s*[.[]|\btypeof\s+window\b/ },
  { name: 'document', pattern: /\bdocument\s*[.[]|\btypeof\s+document\b/ },
  { name: 'navigator', pattern: /\bnavigator\s*[.[]/ },
  { name: 'localStorage', pattern: /\blocalStorage\s*[.[]/ },
  { name: 'sessionStorage', pattern: /\bsessionStorage\s*[.[]/ },
  { name: 'indexedDB', pattern: /\bindexedDB\s*[.[]/ },
  { name: 'AudioContext', pattern: /\bnew\s+AudioContext\b|\bAudioContext\b\s*\(/ },
  { name: 'requestAnimationFrame', pattern: /\brequestAnimationFrame\s*\(/ },
  { name: 'cancelAnimationFrame', pattern: /\bcancelAnimationFrame\s*\(/ },
  { name: 'matchMedia', pattern: /\bmatchMedia\s*\(/ },
  { name: 'ResizeObserver', pattern: /\bnew\s+ResizeObserver\b/ },
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'crypto', pattern: /\bcrypto\s*\./ },
  { name: 'process', pattern: /\bprocess\s*[.[]/ },
  { name: 'globalThis', pattern: /\bglobalThis\s*[.[]/ },
  {
    name: 'canvas type',
    pattern: /\bCanvasRenderingContext2D\b|\bHTMLCanvasElement\b|\bOffscreenCanvas\b/,
  },
  { name: 'Math.random', pattern: /\bMath\s*\.\s*random\s*\(/ },
  { name: 'Date.now', pattern: /\bDate\s*\.\s*now\s*\(/ },
  { name: 'new Date', pattern: /\bnew\s+Date\s*\(/ },
  { name: 'require', pattern: /\brequire\s*\(/ },
];

const BANNED_IMPORT_PREFIXES = [
  'vue',
  '@vue/',
  'pinia',
  'vite',
  '@tauri-apps/',
  'idb',
  'fake-indexeddb',
  'sharp',
  'canvas',
];

/** The layering rule of SPEC.md §45: adapters are downstream of the core, never upstream. */
const BANNED_PACKAGE_IMPORTS = [
  '@puffly/game-scene',
  '@puffly/game-audio',
  '@puffly/game-storage',
  '@puffly/web',
];

/** What an adapter must never do: drive the simulation it is supposed to observe (§48). */
const FORBIDDEN_FOR_ADAPTERS = ['createEngine', 'replaySession', 'EngineOptions'];

/**
 * §9 of the mobile brief: the player's language is a preference the pure layer only carries.
 * A simulation that read it could burn differently on two machines, which would break §71's
 * replay, and a renderer that read it would mirror the scene for right-to-left scripts — the
 * one thing the brief says must never mirror.
 */
const LANGUAGE_UNAWARE = [
  'packages/shared',
  'packages/game-core',
  'packages/game-scene',
  'packages/game-statistics',
];
const LANGUAGE_READ = /\.language\b|\blocale\b|\brtl\b/gi;

/**
 * §10's other half: a daily ceiling is something the page draws, not something the break obeys.
 * A core that read it could end a session at the limit, which is the lock the brief forbids, and
 * a renderer that read it would grey the scene on its own instead of being told. The pattern is a
 * property *read* — declaring the field in `Settings` is the honest pass-through.
 */
const LIMIT_READ = /\.dailyLimitSticks\b/g;

function sources(dir: string): string[] {
  const absolute = join(root, dir);
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
        continue;
      }
      // Tests may speak to the platform they are testing; shipped source may not.
      if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !full.includes('__tests__')) {
        found.push(full);
      }
    }
  };
  walk(absolute);
  return found;
}

/** Strip line and block comments, keeping every string literal intact. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\S\s]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function importSpecifiers(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) out.push(match[1]);
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

export function scanSource(rel: string, raw: string): string[] {
  const code = stripComments(raw);
  const found: string[] = [];

  for (const use of BANNED_USES) {
    if (use.pattern.test(code)) found.push(`${rel}: ${use.name}`);
  }

  for (const specifier of importSpecifiers(code)) {
    if (
      BANNED_IMPORT_PREFIXES.some((prefix) => specifier === prefix || specifier.startsWith(prefix))
    ) {
      found.push(`${rel}: imports ${specifier}`);
    }
    if (BANNED_PACKAGE_IMPORTS.includes(specifier)) {
      found.push(`${rel}: imports ${specifier} (adapters are downstream, §45)`);
    }
    if (specifier.startsWith('@puffly/') && specifier.includes('/src/')) {
      found.push(`${rel}: deep-imports ${specifier} instead of the package index`);
    }
  }

  return found;
}

function scanPure(dir: string): string[] {
  return sources(dir).flatMap((file) =>
    scanSource(relative(root, file), readFileSync(file, 'utf8')),
  );
}

/** A file that *chooses* words by the player's language, rather than only carrying the choice. */
export function scanLanguageUse(rel: string, raw: string): string[] {
  return scanReads(rel, raw, LANGUAGE_READ, "reads the player's language");
}

/**
 * The achievement ladder (2026-10-08 拍板 ⑤⑥) is a reading of numbers the engine already keeps.
 * If it ever rolled a die of its own, §71's replay would stop matching the session it replays, and
 * the rare moments would stop being readings of what actually happened. The pure layer's own tests
 * may not read files (§47), so the source-shape half of that claim lives here.
 */
const LADDER_SOURCE = 'packages/game-core/src/achievements.ts';
const ROLL_READ =
  /Math\.random|\brng\.|createRng|Date\.now|performance\.now|window\.|localStorage/g;

/** A file that invents a number instead of being handed one. */
export function scanRolls(rel: string, raw: string): string[] {
  return scanReads(rel, raw, ROLL_READ, 'rolls a die or reaches for a clock');
}

/** A file that acts on the player's ceiling, rather than only storing that they set one. */
export function scanLimitUse(rel: string, raw: string): string[] {
  return scanReads(rel, raw, LIMIT_READ, 'acts on the daily ceiling');
}

function scanReads(rel: string, raw: string, pattern: RegExp, why: string): string[] {
  const code = stripComments(raw);
  const hits = [...code.matchAll(pattern)].map((match) => match[0]);
  if (hits.length === 0) return [];
  return [`${rel}: ${why} (${[...new Set(hits)].join(', ')})`];
}

function scanLanguageUnaware(dir: string): string[] {
  return sources(dir).flatMap((file) =>
    scanLanguageUse(relative(root, file), readFileSync(file, 'utf8')),
  );
}

function scanLimitUnaware(dir: string): string[] {
  return sources(dir).flatMap((file) =>
    scanLimitUse(relative(root, file), readFileSync(file, 'utf8')),
  );
}

/**
 * A test whose first argument is a literal string is judging its own label.
 *
 * `expect(value, 'why it matters')` is the shape this repo uses when a case needs naming, and the
 * arguments are easy to swap: `expect('why it matters', value)` still passes, always, because a label
 * is a string and the assertion asks whether a string is a string. Four copy guards did exactly that
 * (S6's reverb row, the three haptic shapes, the archive's ≈ rule) — silently decorative, and green.
 * A green test that cannot fail is worse than no test, so the shape is now scanned for.
 */
const ASSERTION_WITH_LITERAL_SUBJECT = /\bexpect\(\s*(?:`[^`]*`|'[^']*'|"[^"]*")\s*,/g;

export function scanAssertionLabels(rel: string, raw: string): string[] {
  const code = stripComments(raw);
  const hits = [...code.matchAll(ASSERTION_WITH_LITERAL_SUBJECT)].map((match) => match[0]);
  if (hits.length === 0) return [];
  return [
    `${rel}: expect() asked about its own label (${String(hits.length)}×: ${[...new Set(hits)].slice(0, 3).join(' | ')})`,
  ];
}

function testSources(dir: string): string[] {
  const absolute = join(root, dir);
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
        continue;
      }
      if (entry.endsWith('.test.ts')) found.push(full);
    }
  };
  walk(absolute);
  return found;
}

function scanAdapter(dir: string): string[] {
  const files = sources(dir);
  const code = files.map((file) => stripComments(readFileSync(file, 'utf8'))).join('\n');
  const problems: string[] = [];
  for (const symbol of FORBIDDEN_FOR_ADAPTERS) {
    const imported = new RegExp(
      `import[^;]*\\b${symbol}\\b[^;]*from\\s+['"]@puffly/game-core['"]`,
    ).test(code);
    if (imported) problems.push(`${dir}: imports ${symbol} from Game Core`);
  }
  return problems;
}

describe('§73 architecture guards', () => {
  it('the achievement ladder rolls nothing and reads no clock (§71)', () => {
    const offenders = scanRolls(LADDER_SOURCE, readFileSync(join(root, LADDER_SOURCE), 'utf8'));
    expect(offenders).toEqual([]);
    // Positive and negative control: the pattern must see the draw it forbids, and the comment
    // stripper must not let this file's own prose about §71 count as one.
    expect(scanRolls('x.ts', 'const roll = Math.random();').length).toBe(1);
    expect(scanRolls('x.ts', '// §71: no Math.random here').length).toBe(0);
  });

  it('finds the pure layer at all, so the scan is not empty', () => {
    for (const dir of PURE_PACKAGES) {
      expect(sources(dir).length, dir).toBeGreaterThan(0);
    }
  });

  it.each(PURE_PACKAGES)('%s never touches a platform API', (dir) => {
    expect(scanPure(dir)).toEqual([]);
  });

  it.each(LANGUAGE_UNAWARE)("%s carries the player's language but never reads it", (dir) => {
    expect(sources(dir).length, dir).toBeGreaterThan(0);
    expect(scanLanguageUnaware(dir)).toEqual([]);
  });

  it('the language guard can fail, and does not fire on a field that is only carried', () => {
    const offending = [
      { label: 'a settings read', code: 'const speak = settings.language;' },
      { label: 'a device read', code: 'const pick = navigator.language;' },
      { label: 'a locale variable', code: 'let locale = "ar";' },
      { label: 'a mirrored scene', code: 'const rtl = true; ctx.scale(rtl ? -1 : 1, 1);' },
    ];
    for (const item of offending) {
      expect(scanLanguageUse('sample.ts', item.code), item.label).not.toEqual([]);
    }

    // The honest pass-through: a field that exists and is never read from.
    expect(
      scanLanguageUse('sample.ts', 'export interface Settings { language?: string; }'),
    ).toEqual([]);
  });

  it.each(LANGUAGE_UNAWARE)('%s never acts on the daily ceiling', (dir) => {
    expect(scanLimitUnaware(dir)).toEqual([]);
  });

  it('the ceiling guard can fail, and does not fire on the field it only carries', () => {
    expect(
      scanLimitUse(
        'sample.ts',
        'if (settings.dailyLimitSticks && today > settings.dailyLimitSticks) end();',
      ),
      'a core that stops the break at the ceiling',
    ).not.toEqual([]);
    expect(
      scanLimitUse('sample.ts', 'export interface Settings { dailyLimitSticks?: number; }'),
    ).toEqual([]);
  });

  it('the shell is where the ceiling is actually read, so the guard above guards something', () => {
    const shell = sources('apps/web/src')
      .map((file) => stripComments(readFileSync(file, 'utf8')))
      .join('\n');
    expect(shell).toContain('.dailyLimitSticks');
  });

  it('the scanner itself reports every shape it claims to catch', () => {
    // Positive controls, one per matcher family. If any of these stops firing, the
    // corresponding "no violations" result above has become meaningless.
    const cases: readonly { label: string; code: string }[] = [
      { label: 'window', code: 'const w = window.innerWidth;' },
      { label: 'document', code: 'const c = document.createElement("canvas");' },
      { label: 'indexedDB', code: 'indexedDB.open("puffly");' },
      { label: 'requestAnimationFrame', code: 'requestAnimationFrame(step);' },
      { label: 'Math.random', code: 'const s = Math.random();' },
      { label: 'Date.now', code: 'const t = Date.now();' },
      { label: 'new Date', code: 'const d = new Date();' },
      { label: 'canvas type', code: 'let ctx: CanvasRenderingContext2D;' },
      { label: 'crypto', code: 'crypto.getRandomValues(box);' },
      { label: 'vue import', code: "import { ref } from 'vue';" },
      { label: 'tauri import', code: "import { invoke } from '@tauri-apps/api/core';" },
      {
        label: 'adapter import',
        code: "import { createPufflyRenderer } from '@puffly/game-scene';",
      },
      { label: 'deep import', code: "import { stuff } from '@puffly/game-core/src/engine';" },
    ];

    for (const item of cases) {
      expect(scanSource('sample.ts', item.code), item.label).not.toEqual([]);
    }

    // And the negative direction: clean code must not be reported.
    expect(
      scanSource(
        'sample.ts',
        "import type { Settings } from './types/settings';\nexport const x = 1;",
      ),
    ).toEqual([]);
  });

  it.each(ADAPTER_PACKAGES)('%s depends only one way: core is not its servant', (dir) => {
    expect(scanAdapter(dir)).toEqual([]);
  });

  it('the web shell really does drive the engine (adapter guard positive control)', () => {
    const shell = sources('apps/web/src')
      .map((file) => stripComments(readFileSync(file, 'utf8')))
      .join('\n');
    expect(/import[^;]*createEngine[^;]*from\s+['"]@puffly\/game-core['"]/.test(shell)).toBe(true);
  });

  it('no test asserts about its own label, and the scan has a denominator', () => {
    const files = [...PURE_PACKAGES, ...ADAPTER_PACKAGES, 'apps/web/src', 'tests'].flatMap(
      testSources,
    );
    expect(files.length, 'the test scan found no test files at all').toBeGreaterThan(50);
    const offending = files.flatMap((file) =>
      scanAssertionLabels(relative(root, file), readFileSync(file, 'utf8')),
    );
    expect(offending).toEqual([]);
    console.log(`ASSERTION_SHAPE scanned=${String(files.length)}`);
  });

  it('the assertion-shape guard can fail, and does not fire on the correct form', () => {
    // The planted example is assembled at run time: written as a literal it would be matched in this
    // file's own source, which is scanned by the case above.
    const quote = String.fromCharCode(96);
    const planted = `expect(${quote}\${'{kind} peak'}${quote}, shipped.peak).toBe(real.peak);`;
    expect(
      scanAssertionLabels('sample.test.ts', planted),
      'a swapped expect was not caught',
    ).not.toEqual([]);

    // The honest shape: the value first, the reason second.
    expect(
      scanAssertionLabels(
        'sample.test.ts',
        'expect(shipped.peak, `${kind} peak`).toBe(real.peak);',
      ),
      'the guard fires on the shape it exists to allow',
    ).toEqual([]);
    // And an assertion with no label at all is none of its business.
    expect(scanAssertionLabels('sample.test.ts', "expect('a string').toBe('a string');")).toEqual(
      [],
    );
  });

  it('every package on disk is classified, so a new one cannot slip past these rules', () => {
    // The two lists above are the denominator of every scan in this file. A package that is in
    // neither is not "clean" — it is unread. That is how `packages/game-scene` arrived on
    // 2026-10-09: it used a platform type and neither list noticed, because neither list knew it
    // existed. Classifying is a five-second decision; leaving it silent is a permanent hole.
    const onDisk = readdirSync(join(root, 'packages')).filter((name) =>
      statSync(join(root, 'packages', name)).isDirectory(),
    );
    const classified = new Set(
      [...PURE_PACKAGES, ...ADAPTER_PACKAGES].map((dir) => dir.replace('packages/', '')),
    );
    const unclassified = onDisk.filter((name) => !classified.has(name));
    console.log(`PACKAGES on disk=${String(onDisk.length)} classified=${String(classified.size)}`);
    expect(
      unclassified,
      'a package is in neither PURE_PACKAGES nor ADAPTER_PACKAGES, so no rule reads it',
    ).toEqual([]);
  });

  it('no shipped source reaches past a package index', () => {
    const all = [...PURE_PACKAGES, ...ADAPTER_PACKAGES, 'apps/web/src'].flatMap((dir) =>
      sources(dir).flatMap((file) =>
        scanSource(relative(root, file), readFileSync(file, 'utf8')).filter((line) =>
          line.includes('deep-imports'),
        ),
      ),
    );
    expect(all).toEqual([]);
  });

  /**
   * The ledger cites its own evidence: 24 audit rows and a dozen dated sections name the test that
   * stands behind each claim, in backticks. A rename or a deleted file leaves the sentence pointing
   * at nothing, and nothing in the suite reads the document, so the drift is silent — this is the
   * class of bug the ledger itself recorded once already (a row that named the wrong file).
   */
  const testBasenames = new Set<string>();
  {
    const walk = (path: string): void => {
      for (const entry of readdirSync(path)) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
        const full = join(path, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.test.ts')) testBasenames.add(entry);
      }
    };
    walk(root);
  }

  /** The cited files a reader could not open: bare names by basename, paths by path. */
  function unresolvableCitations(text: string): string[] {
    const missing: string[] = [];
    for (const match of text.matchAll(/`((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.test\.ts)`/g)) {
      const cited = String(match[1]);
      if (cited.includes('/')) {
        try {
          statSync(join(root, cited));
        } catch {
          missing.push(cited);
        }
      } else if (!testBasenames.has(cited)) {
        missing.push(cited);
      }
    }
    return [...new Set(missing)].sort();
  }

  it('points at a real test wherever the ledger claims one', () => {
    // Both operator-facing documents, not just the ledger: the README is where a newcomer takes
    // commands and citations from, and a stale sentence there is worse than a missing one here.
    // The floor is per document — the ledger cites in the hundreds, the README in single digits —
    // because a shared threshold would quietly stop proving anything about the smaller file.
    for (const [doc, floor] of [
      ['docs/SPEC.md', 20],
      ['README.md', 2],
    ] as const) {
      const text = readFileSync(join(root, doc), 'utf8');
      const citations = [
        ...text.matchAll(/`((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.test\.ts)`/g),
      ].map((match) => String(match[1]));
      expect(
        citations.length,
        `${doc} cites no tests, so this scan proves nothing`,
      ).toBeGreaterThan(floor);
      console.log(
        `DOC_CITATIONS ${doc}: ${String(citations.length)} mentions of ${String(
          new Set(citations).size,
        )} files`,
      );
      expect(unresolvableCitations(text), `${doc} points at tests that are not there}`).toEqual([]);
    }
  });

  /**
   * The README is also a list of commands, and a command that does not exist in the scripts it
   * names is the same class of drift: it reads as documentation and behaves as a broken link.
   */
  it('asks for scripts that the root package actually has', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const scripts = Object.keys(
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts as Record<
        string,
        unknown
      >,
    );
    const asked = [...readme.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)].map((match) =>
      String(match[1]),
    );
    console.log(`DOC_SCRIPTS ${asked.length} mentions, ${scripts.length} scripts available`);
    expect(
      asked.length,
      'the README names no scripts, so this scan proves nothing',
    ).toBeGreaterThan(3);
    const missing = [...new Set(asked)].filter((name) => !scripts.includes(name));
    expect(missing, 'the README tells a reader to run scripts that do not exist').toEqual([]);
  });

  /**
   * The ledger's other pointer: 「见「X」」 names a section by its heading. Following one of those to
   * a place that is not there is the same failure the scan above catches for test files — and this
   * session wrote three of them from memory before checking, which is why the check is here.
   */
  function unresolvableSectionRefs(text: string): string[] {
    const titles = text
      .split('\n')
      .filter((line) => /^#{2,4} /.test(line))
      .map((line) => line.replace(/^#+ /, '').trim());
    const missing: string[] = [];
    for (const match of text.matchAll(/见(?:本节末)?「([^」]{2,40})」/g)) {
      const name = String(match[1]);
      if (!titles.some((title) => title.includes(name))) missing.push(name);
    }
    return [...new Set(missing)].sort();
  }

  it('sends a reader to a section that is there', () => {
    const doc = readFileSync(join(root, 'docs/SPEC.md'), 'utf8');
    const refs = [...doc.matchAll(/见(?:本节末)?「([^」]{2,40})」/g)].map((match) =>
      String(match[1]),
    );
    expect(
      refs.length,
      'the document points at no sections, so this scan proves nothing',
    ).toBeGreaterThanOrEqual(15);
    console.log(
      `SECTION_REFS ${String(refs.length)} mentions of ${String(new Set(refs).size)} headings`,
    );
    expect(
      unresolvableSectionRefs(doc),
      'the ledger points at a heading that is not there',
    ).toEqual([]);
  });

  it('the section scan reports a heading that is not there', () => {
    // The positive control, in the same shape as the citation one: a name that exists and one that
    // does not, in the same sentence.
    // The heading has to be in the same text that is scanned: unlike a test file, a section has no
    // existence outside this document, so the control carries its own heading line.
    expect(
      unresolvableSectionRefs(
        '### 烟羽的三层：各有各的速度（2026-10-08）\n见「烟羽的三层」与见本节末「这一片根本不存在」',
      ),
    ).toEqual(['这一片根本不存在']);
  });

  it('the citation scan reports a file that is not there', () => {
    // The positive control: a name that exists and one that does not, in the same sentence.
    expect(
      unresolvableCitations(
        'see `no-such-guard.test.ts`, `tests/architecture.test.ts` and `docs/dead.test.ts`',
      ),
    ).toEqual(['docs/dead.test.ts', 'no-such-guard.test.ts']);
  });

  /**
   * S18's own premise: 商标与包装图形一律不画, "这是这条线能上线的前提". The *words* half of that line
   * has had guards for a while (`archive.test.ts` refuses a brand in the loop, `packs.test.ts` keeps a
   * price out of the grid). The *picture* half was only ever a fact about how the app is built — every
   * prop is drawn from vectors, so the one thing that could break the line is someone dropping artwork
   * into the public folder, and that fails silently: it would simply look right.
   */
  /**
   * `atlas/` is the one addition, and it is not artwork in this guard's sense: it holds the baked
   * glyph atlas (`apps/web/scripts/bake-atlas.mjs`) — outlines from a font, generated from the copy
   * table, re-baked whenever the table grows (`atlas-coverage.test.ts` is the check). No prop, no
   * pack and no brand is allowed to arrive the same way a picture would.
   */
  const SHIPPED_ART = ['icon.svg', 'icon-maskable.svg', 'atlas'];
  const artOffenders = (names: readonly string[]): string[] =>
    names.filter((name) => !SHIPPED_ART.includes(name));

  it('the app ships nothing to look at except its own two icons', () => {
    const shipped = readdirSync(join(root, 'apps/web/public'));
    expect(
      shipped.length,
      'the listing came back empty, so the scan proves nothing',
    ).toBeGreaterThan(0);
    const beyond = artOffenders(shipped);
    expect(beyond, `art beyond the icons: ${beyond.join(', ')}`).toEqual([]);
  });

  it('the art guard can fail, and does not fire on the icons it exists to allow', () => {
    expect(artOffenders(['icon.svg', 'pack-front.png'])).toEqual(['pack-front.png']);
    expect(artOffenders(SHIPPED_ART), 'the guard fires on the shipped set').toEqual([]);
  });
});

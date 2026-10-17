/**
 * Three interaction states the chrome used to ship without, guarded by rule shape rather than prose:
 * a hover that a finger cannot clear, a tabbable stage with no visible focus, and a reduced-motion
 * promise that only covered four class names.
 *
 * These read the CSS that ships, so they are rulers over the *text*, not over the rendered page —
 * which is what makes them cheap enough to run on every commit. The real-page readings live in
 * `tests/smoke/touch-device.mjs`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { stripComments } from './sourceProbe';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** The CSS a browser actually sees: every `<style>` block in the app plus the global sheet. */
function stylesOnly(text: string): string {
  const blocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
  return blocks.length > 0 ? blocks.join('\n') : text;
}

function cssSurface(): string {
  const files = [
    'styles/global.css',
    'App.vue',
    ...[
      'ArchiveCard',
      'ArchiveTile',
      'CollectionSheet',
      'CtaPill',
      'DataRail',
      'HudBar',
      'ReductionPanel',
      'SceneStage',
      'SessionSheet',
      'SettingsSheet',
      'TabRail',
    ].map((name) => `components/${name}.vue`),
  ];
  return files.map((rel) => stylesOnly(readFileSync(`${SRC}/${rel}`, 'utf8'))).join('\n');
}

/**
 * The body of every `@media (cond)` block, sliced on brace depth so a nested rule cannot be mistaken
 * for the block's own text — a fixed window would happily reach into the next rule.
 */
function mediaBodies(css: string, condition: RegExp): string[] {
  const out: string[] = [];
  const header = /@media[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(css)) !== null) {
    if (!condition.test(match[0])) continue;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    out.push(css.slice(match.index + match[0].length, i - 1));
  }
  return out;
}

/** Rule bodies at depth zero, so a selector is compared against selectors and not against a comment. */
function topLevelSelectors(css: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) selectors.push(css.slice(start, i).trim());
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      start = i + 1;
    }
  }
  return selectors
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('@'));
}

describe('interaction states that ship in CSS', () => {
  it('leaves no bare :hover outside a device that can actually hover', () => {
    const css = stripComments(cssSurface());
    const guarded = mediaBodies(css, /hover:\s*hover/).join('\n');
    // Remove the guarded regions, then ask whether any `:hover` survived outside them.
    const ungated = mediaBodies(css, /hover:\s*hover/).reduce(
      (text, body) => text.replace(body, ''),
      css,
    );
    expect(ungated).not.toContain(':hover');
    // The other half of the claim: the guard has to exist, not merely match nothing.
    expect(guarded).toContain(':hover');
  });

  it('shows a focus marker for the tabbable stage surface', () => {
    const app = stripComments(stylesOnly(readFileSync(`${SRC}/App.vue`, 'utf8')));
    expect(topLevelSelectors(app)).toContain('.hit:focus-visible');
  });

  it('gives the generic controls a focus ring instead of the browser default', () => {
    const global = stripComments(stylesOnly(readFileSync(`${SRC}/styles/global.css`, 'utf8')));
    const selectors = topLevelSelectors(global);
    for (const wanted of [
      'button:focus-visible',
      'a:focus-visible',
      'input:focus-visible',
      'select:focus-visible',
      '[tabindex]:focus-visible',
    ]) {
      expect(selectors, `${wanted} should be a rule of its own`).toContain(wanted);
    }
  });

  it('keeps the category face at the drawn size and widens only its reach', () => {
    // Measured, not assumed: pushing the button itself to `--tap-target` made it 54 px on a phone,
    // reflowed the whole row (ring and clock 20 px right) and moved a hard-coded pixel ruler out of
    // its own window. So the reach belongs to a transparent pseudo-element, never to the box.
    const hud = stripComments(readFileSync(`${SRC}/components/HudBar.vue`, 'utf8'));
    const face = /\.cat\s*\{([^}]*)\}/.exec(hud);
    expect(face, '.cat needs its own rule').not.toBeNull();
    expect(face?.[1]).toMatch(/width: *34px/);
    expect(face?.[1]).toMatch(/height: *34px/);
    expect(face?.[1]).not.toMatch(/var\(--tap-target\)/);
  });

  it('gives every thumb-sized control one shared reach, and no second copy of it', () => {
    const global = stylesOnly(readFileSync(`${SRC}/styles/global.css`, 'utf8'));
    const reach = /\[data-reach\]::after\s*\{([^}]*)\}/.exec(stripComments(global));
    expect(
      reach,
      'the reach is one utility, so a fifth control costs one attribute',
    ).not.toBeNull();
    expect(reach?.[1]).toMatch(/width: *var\(--tap-target\)/);
    expect(reach?.[1]).toMatch(/height: *var\(--tap-target\)/);
    expect(reach?.[1]).toMatch(/position: *absolute/);

    // The controls whose ink is smaller than a thumb, measured by `probe-covered-controls.mjs`:
    // 18 px tall in the head-up row, 28 px on the archive card's close. Counted as attribute lines,
    // not as text: the first version of this line read `4`, because a comment in `HudBar.vue` was
    // explaining the attribute and the counter cannot tell the two apart.
    const hud = stripComments(readFileSync(`${SRC}/components/HudBar.vue`, 'utf8'));
    const reaches = (source: string) => source.match(/^\s+data-reach$/gm)?.length ?? 0;
    expect(reaches(hud)).toBe(3);
    expect(reaches(stripComments(readFileSync(`${SRC}/components/ArchiveCard.vue`, 'utf8')))).toBe(
      2,
    );

    // And the old private copy stays gone: two homes for one square is how the next control ends up
    // with the wrong size.
    expect(hud).not.toMatch(/\.cat::after/);
  });

  it('applies the reduced-motion promise to the property, not to a list of classes', () => {
    const global = stripComments(stylesOnly(readFileSync(`${SRC}/styles/global.css`, 'utf8')));
    const reduce = mediaBodies(global, /prefers-reduced-motion:\s*reduce/).join('\n');
    expect(topLevelSelectors(reduce)).toContain('*');
    expect(reduce).toMatch(/transition-duration/);
  });
});

/**
 * The gesture surface contract — SPEC.md §66.
 *
 * The CSS half of "the scene owns the gesture" cannot be checked in a browser: Chromium does not
 * implement `-webkit-touch-callout` and drops the declaration while parsing, so the only thing it
 * can prove is that the rule ships. It exists for iPhone and iPad Safari, where a long press
 * otherwise raises "save image / look up" over the game.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../global.css', import.meta.url)), 'utf8');

/** Every style sheet the shell ships: `global.css` plus the `<style>` blocks of each component. */
function styleSources(): { name: string; text: string }[] {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const out: { name: string; text: string }[] = [{ name: 'styles/global.css', text: css }];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'assets') walk(full);
        continue;
      }
      if (!/\.(css|vue)$/.test(entry.name)) continue;
      // `global.css` is already in the list; walking it in again would report every finding twice.
      if (full === `${root}/styles/global.css`) continue;
      const text = readFileSync(full, 'utf8');
      if (entry.name.endsWith('.css')) {
        out.push({ name: full.slice(root.length + 1), text });
        continue;
      }
      for (const block of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        out.push({ name: `${full.slice(root.length + 1)} <style>`, text: block[1] ?? '' });
      }
    }
  };
  walk(root);
  return out;
}

describe('the page refuses the browser’s own gestures (§66)', () => {
  it('switches the iOS long-press callout off', () => {
    expect(css).toContain('-webkit-touch-callout: none');
    // On `*`, not on html/body: the callout is raised by the element under the finger — the
    // canvas, a glyph, a slider — and inheritance is not something to bet a behaviour on.
    expect(css).toMatch(/^\* \{[^}]*-webkit-touch-callout: none/im);
  });

  it('takes the whole surface out of the browser’s hands', () => {
    // Without these, a two-finger pinch zooms the scene and a long press selects or scrolls.
    expect(css).toContain('touch-action: none');
    expect(css).toContain('overscroll-behavior: none');
    expect(css).toContain('user-select: none');
  });

  it('leaves the sheet above the bar that opened it', () => {
    // A bottom sheet that reached the bottom of the screen covered all three chrome buttons, so
    // the middle one went dead once it was open. The lift is one fact, named once.
    expect(css).toContain('--sheet-lift: calc(var(--chrome-height) + env(safe-area-inset-bottom))');
    const sheet = css.slice(css.indexOf('.sheet {'), css.indexOf('.sheet[data-open'));
    expect(sheet).toContain('bottom: var(--sheet-lift)');
    expect(sheet).toContain('translateY(calc(100% + var(--sheet-lift)))');
  });

  it('every scrollable box names the touch gesture it wants', () => {
    // §66 puts `touch-action: none` on `body` so the scene owns the gestures. The property is not
    // inherited, but a pan is judged along the chain up to the scroll container — so an
    // `overflow: auto` that declares nothing scrolls under a mouse wheel and not at all under a
    // finger. That is how the wide-layout rail reached a user's thumb (#162); naming the gesture per
    // scroll container is cheap enough that the next panel cannot rediscover it.
    const offenders: string[] = [];
    for (const source of styleSources()) {
      const text = source.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = rule[2] ?? '';
        const selector = (rule[1] ?? '').trim().split('\n').pop()?.trim() ?? '?';
        const scrolls = /(?:^|;)\s*overflow(?:-[xy])?\s*:\s*(?:auto|scroll)/.test(body);
        if (scrolls && !/touch-action\s*:\s*pan/.test(body)) {
          offenders.push(`${source.name} → ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('hands a scroll container over to the scene by paint, never by visibility', () => {
    // `visibility: hidden` takes an element out of the browser’s hit test. On a panel that is also
    // the scroll container that is not a paint decision — it is a gesture decision, and the gesture
    // loses: taps still land (they hit the visible rows) while a thumb and a wheel both slide over
    // the box for nothing (#162, measured 0 → 0 before, 0 → 273 after). The scene may withhold a
    // surface by taking its background and border, which gate no hits.
    const scrollers = new Set<string>();
    const hidden: string[] = [];
    const rules: { name: string; selector: string; body: string }[] = [];
    for (const source of styleSources()) {
      const text = source.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (rule[1] ?? '').trim().split('\n').pop()?.trim() ?? '?';
        rules.push({ name: source.name, selector, body: rule[2] ?? '' });
      }
    }
    const subjectOf = (selector: string) =>
      (selector.split(/[\s>]+/).pop() ?? '?').replace(/\[.*/, '');
    for (const rule of rules) {
      if (/(?:^|;)\s*overflow(?:-y)?\s*:\s*(?:auto|scroll)/.test(rule.body)) {
        scrollers.add(subjectOf(rule.selector));
      }
    }
    for (const rule of rules) {
      if (
        rule.selector.includes('scene3d') &&
        /(?:^|;)\s*visibility\s*:\s*hidden/.test(rule.body) &&
        scrollers.has(subjectOf(rule.selector))
      ) {
        hidden.push(`${rule.name} → ${rule.selector}`);
      }
    }
    expect(hidden).toEqual([]);
  });
});

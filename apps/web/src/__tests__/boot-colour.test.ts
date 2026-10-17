import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The colour the page shows before any script runs, the colour the browser paints its own chrome
 * with, the colour the installed-app splash uses, and the colour the app itself paints are four
 * places that must agree. They disagreed for a long stretch: `index.html` carried `#121317` from an
 * old palette while the app painted `--deep-charcoal`, which measured 2.13x the relative luminance
 * of the page it handed off to — a grey-to-black step at boot, which is the dim end of the exact
 * flash §57 exists to prevent.
 */
const HEX = /#([0-9a-f]{6})/i;
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hexOf = (value: string | null | undefined, where: string) => {
  const found = HEX.exec(value ?? '');
  expect(found, `${where} should carry a six-digit hex`).not.toBeNull();
  return (found?.[1] ?? '').toLowerCase();
};

describe('one background, four places', () => {
  const html = read('../../index.html');
  const css = read('../styles/global.css');
  const vite = read('../../vite.config.ts');

  const token = hexOf(/--deep-charcoal: *(#[0-9a-f]{6})/.exec(css)?.[1], '--deep-charcoal');
  const boot = hexOf(
    /html,\s*body,\s*#app\s*\{[\s\S]*?background: *(#[0-9a-f]{6})/.exec(html)?.[1],
    'the pre-boot background',
  );
  const theme = hexOf(
    /name="theme-color" content="(#[0-9a-f]{6})/.exec(html)?.[1],
    'the theme-color meta',
  );
  const manifestTheme = hexOf(
    /theme_color: *'(#[0-9a-f]{6})'/.exec(vite)?.[1],
    'manifest theme_color',
  );
  const manifestBg = hexOf(
    /background_color: *'(#[0-9a-f]{6})'/.exec(vite)?.[1],
    'manifest background_color',
  );

  it('is the app token everywhere the page can be seen before it boots', () => {
    expect(boot, 'the pre-boot sheet must be the colour the app paints').toBe(token);
    expect(theme, 'the browser bar must match the running page').toBe(token);
    expect(manifestTheme).toBe(token);
    expect(manifestBg).toBe(token);
  });

  it('does not smuggle a second dark in through the boot style', () => {
    // A lie that keeps every literal present: point the boot sheet at any other dark.
    expect(
      html.match(/background: *#[0-9a-f]{6}/g)?.length,
      'one background rule in the boot style',
    ).toBe(1);
    expect(boot).not.toBe('121317');
  });
});

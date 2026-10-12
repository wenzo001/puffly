/**
 * The fallback chain, proven rather than asserted in prose — §9's three tiers.
 */

import { describe, expect, it } from 'vitest';
import { COPY, announce, ctaKeyFor, isRtl, resolveLocale, translate } from '../index';
import { EN, type CopyKey } from '../copy';

const KEYS = Object.keys(EN) as CopyKey[];

describe('three tiers: target language → English → icons (§9)', () => {
  it('the anchor table is complete, because every key is defined against it', () => {
    for (const key of KEYS) expect(EN[key]).to.be.a('string').and.not.equal('');
  });

  it('the shipped second language covers every key, so no player sees an English orphan', () => {
    const missing = KEYS.filter((key) => typeof COPY['zh-CN']?.[key] !== 'string');
    expect(missing, `missing zh-CN: ${missing.join(', ')}`).toEqual([]);
  });

  it('a partial language falls through to English rather than to nothing', () => {
    expect(translate('ar', 'tab.settings')).toBe('الإعدادات');
    expect(translate('ar', 'tab.puff')).toBe('inhale');
    // The partial table is the point: it has to stay partial for this to mean anything.
    expect(Object.keys(COPY.ar ?? {}).length).toBeLessThan(KEYS.length);
  });

  it('the third tier is reachable, and only for what a player reads with their eyes', () => {
    expect(translate('icons', 'hint.pick')).toBeNull();
    expect(translate('icons', 'cta.puff')).toBeNull();
    expect(announce('icons', 'a11y.close')).toBe('close');
    expect(announce('icons', 'state.burning')).toBe('burning');
  });

  it('a missing key never produces an empty name for a screen reader', () => {
    expect(announce('zh-CN', 'app.name')).toBe('Puffly');
    expect(announce('zz-ZZ', 'a11y.close')).toBe('close');
  });

  it('a parameter is filled in whatever language answers', () => {
    expect(translate('en', 'a11y.smokeOption', { word: 'soft' })).toBe('smoke soft');
    expect(translate('zh-CN', 'a11y.smokeOption', { word: '稀' })).toBe('烟雾 稀');
    expect(translate('ar', 'a11y.smokeOption', { word: 'x' })).toBe('smoke x');
  });

  it('right-to-left is a property of the language, not of the tier', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he')).toBe(true);
    expect(isRtl('zh-CN')).toBe(false);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('icons')).toBe(false);
  });

  it('the core loop is spelled with icons and digits, never a quantifier', () => {
    // §9.2: the stage and its chrome are icons and Arabic digits, so a key that appears there
    // with a 中文量词 in it is the mistake this guards against. The sheets may speak.
    const quantifiers = ['支', '口', '根', '次'];
    const inLoop = KEYS.filter(
      (key) =>
        key.startsWith('hint.') ||
        key.startsWith('cta.') ||
        key.startsWith('tab.') ||
        key.startsWith('state.'),
    );
    expect(inLoop.length).toBeGreaterThan(10);
    for (const key of inLoop) {
      const chinese = COPY['zh-CN']?.[key] ?? '';
      for (const unit of quantifiers) {
        expect(chinese, `${key} = "${chinese}" uses the quantifier ${unit}`).not.toContain(unit);
      }
    }
    // Where a quantifier may live: the sheets a player reads a count in (the 图鉴, the 档案, the
    // day's own numbers, 统计, and the 成就 ladder's own unit words — `metric.*` is the same kind of
    // surface as `stats.*`: a figure inside a sheet, never a word on the stage), a sheet that is
    // allowed to speak in full sentences (settings), and the spoken names no eye ever reads (a11y).
    // §9.2 binds the stage and its three chrome pieces.
    // `ach.unit.*` was added deliberately rather than by blessing a free-standing `metric.`
    // namespace. §9.2's redline is that 中文量词 stay off the core loop (SPEC.md:174), and
    // SPEC.md:1603 already names the exception: 量词在这页是允许的 (设计稿自己写的就是 `12 / 20 支`).
    // The ladder is that kind of page. Scoping the words to `ach.` keeps the allowance attached to
    // the surface it was granted for, so a future screen cannot park a quantifier in a namespace
    // that means "anywhere". What this deliberately does NOT do is reword the Chinese to miss the
    // matcher — SPEC.md:2481 records an author who refused that, and it would make the guard blind
    // rather than satisfied.
    const outside = /^(a11y|archive|ach|reduction|settings|shelf|stats)\./;
    const carrying = KEYS.filter((key) => {
      const chinese = COPY['zh-CN']?.[key] ?? '';
      return quantifiers.some((unit) => chinese.includes(unit));
    });
    expect(carrying.length).toBeGreaterThan(0);
    const inTheLoop = carrying.filter((key) => !outside.test(key));
    expect(inTheLoop, `量词 inside the core loop: ${inTheLoop.join(', ')}`).toEqual([]);
  });
});

/** §9's first tier is a question about the device, not about the table. */
describe('which language a player ends up with', () => {
  it('an explicit choice wins over the device, including the wordless tier', () => {
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN');
    expect(resolveLocale('icons', ['zh-CN'])).toBe('icons');
  });

  it('an absent or undecided choice follows the device, exactly first and then by family', () => {
    expect(resolveLocale(undefined, ['en-US'])).toBe('en');
    expect(resolveLocale(undefined, ['zh-Hans-CN', 'en'])).toBe('zh-CN');
    expect(resolveLocale('auto', ['fr-FR', 'ar-EG'])).toBe('ar');
  });

  it('a device the table has no words for falls to the anchor, never to a blank', () => {
    expect(resolveLocale(undefined, [])).toBe('en');
    expect(resolveLocale('th-TH', ['th-TH'])).toBe('en');
    // The anchor is a language with a complete table, not the tier that says nothing.
    expect(announce(resolveLocale(undefined, ['de-DE']), 'tab.puff')).toBe('inhale');
  });
});

/** §14 and Smoke Ritual's 品鉴型: the verb has to match the draw the rod asks for. */
describe('the pill names the draw the rod actually wants', () => {
  it('a mouthed draw is never called an inhalation, and only that one verb moves', () => {
    expect(ctaKeyFor('puff', 0)).toBe('cta.puff');
    expect(ctaKeyFor('puff', 2000)).toBe('cta.savour');
    expect(ctaKeyFor('flick', 2000)).toBe('cta.flick');
    expect(ctaKeyFor('none', 2000)).toBeUndefined();
  });

  it('both verbs are shipped in every spoken language, because a label is a translation anchor', () => {
    for (const key of ['cta.puff', 'cta.savour'] as const) {
      expect(typeof COPY['en']?.[key], key).toBe('string');
      expect(typeof COPY['zh-CN']?.[key], key).toBe('string');
    }
  });
});

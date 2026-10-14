import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

/**
 * Packages that must stay platform-independent (SPEC.md §47, §73, §86).
 * The runtime-free layer is enforced here *and* by tests/architecture.test.ts.
 */
const PURE_PACKAGES = [
  'packages/shared/**/*.ts',
  'packages/game-core/**/*.ts',
  'packages/game-content/**/*.ts',
  'packages/game-statistics/**/*.ts',
];

const BROWSER_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'AudioContext',
  'WebKitAudioContext',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Image',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'Blob',
  'fetch',
  'location',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'dev-dist/**',
      'docs/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      // TypeScript already resolves identifiers; `no-undef` in a TS project only produces
      // noise about DOM globals (typescript-eslint says the same).
      globals: {},
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: PURE_PACKAGES,
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_GLOBALS.map((name) => ({
          name,
          message: 'SPEC.md §47: this layer must stay platform-independent — use an adapter.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='AudioContext']",
          message: 'SPEC.md §47: audio lives in @puffly/game-audio.',
        },
        {
          selector: "CallExpression[callee.name='require']",
          message: 'Use ES module imports.',
        },
        {
          selector: "TSQualifiedName[left.name='globalThis']",
          message: 'SPEC.md §47: do not reach for ambient globals here.',
        },
      ],
    },
  },
  {
    // SPEC.md §48: the renderer/audio/storage side only ever *reads* the simulation, and the type that
    // says so (`DeepReadonly`) is erased at runtime. Measured 2026-10-13: one cast through the view
    // changed the live simulation, and a source-read guard could not see the write when it sat behind
    // an alias. This rule forbids the cast itself rather than the write it leads to, so an alias cannot
    // be used to slip past — a write on any name is still caught by the type; a write reached by
    // casting the view is caught here.
    files: [
      'apps/web/src/**/*.{ts,vue}',
      'packages/game-scene/src/**/*.ts',
      'packages/game-audio/src/**/*.ts',
      'packages/game-storage/src/**/*.ts',
    ],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    plugins: {
      // §48's guard, written as a rule rather than a query: ESLint's selector language cannot say
      // "a cast whose target names one of the core's state fields", and a rule that matches by an
      // approximation is the same trap as a source read that matches a plausible variable name.
      state: {
        rules: {
          'no-state-cast': {
            create(context) {
              // The core's own top-level state vocabulary. A cast *away* from readonly has to name one
              // of these to be an escape; the two honest casts in the repo name `__pufflyScene` and
              // `Rgb`, so they are left alone.
              const FIELDS = new Set([
                'cigarette',
                'anchors',
                'environment',
                'ashtray',
                'lighter',
                'collection',
                'progress',
                'style',
                'ui',
                'stage',
                'nowMs',
                'nowWallClockMs',
              ]);
              const isEscape = (annotation) => {
                if (annotation === null || annotation === undefined) return false;
                if (annotation.type === 'TSTypeLiteral') {
                  return annotation.members.some(
                    (m) => m.key !== undefined && FIELDS.has(m.key.name),
                  );
                }
                if (annotation.type === 'TSTypeReference') {
                  const name = annotation.typeName?.name;
                  return typeof name === 'string' && FIELDS.has(name);
                }
                return false;
              };
              return {
                TSAsExpression(node) {
                  if (!isEscape(node.typeAnnotation)) return;
                  context.report({
                    node,
                    message:
                      'SPEC.md §48: the state view is read-only. Casting it away is how a write ' +
                      'reaches the simulation, and DeepReadonly erases at runtime.',
                  });
                },
                TSTypeAssertion(node) {
                  if (!isEscape(node.typeAnnotation)) return;
                  context.report({
                    node,
                    message:
                      'SPEC.md §48: the state view is read-only. Casting it away is how a write ' +
                      'reaches the simulation, and DeepReadonly erases at runtime.',
                  });
                },
              };
            },
          },
        },
      },
    },
    rules: {
      'state/no-state-cast': 'error',
    },
  },
  {
    files: [
      'packages/game-core/**/*.ts',
      'packages/game-content/**/*.ts',
      'packages/shared/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', '@vue/*', 'vite', 'vitest/*'],
              message: 'SPEC.md §81 (10/11): framework code must not leak into the pure layer.',
            },
            {
              group: [
                '@puffly/game-renderer',
                '@puffly/game-audio',
                '@puffly/game-storage',
                '@puffly/web',
              ],
              message: 'SPEC.md §45: adapters are downstream of Game Core, never upstream.',
            },
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'SPEC.md §47: no Node built-ins — the pure layer must run anywhere.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'no-console': 'off',
    },
  },
  {
    // The atlas bake is a Node build script with no page under it — console, process and the
    // performance timer are this process's own globals.
    files: ['apps/web/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        performance: 'readonly',
      },
    },
  },
  {
    // The smoke checks are Node scripts that speak to a browser: `document` and `PointerEvent`
    // appear inside `page.evaluate`, where they are the page's globals, not this process's.
    files: ['tests/smoke/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Image: 'readonly',
        PointerEvent: 'readonly',
        MouseEvent: 'readonly',
        Event: 'readonly',
        getComputedStyle: 'readonly',
        performance: 'readonly',
        // The PNG decoders read the captured frames in *this* process: a PNG's IDAT chunks are
        // concatenated and inflated here, which is Node's own `Buffer` rather than a browser's.
        Buffer: 'readonly',
        Uint8Array: 'readonly',
      },
    },
  },
  {
    files: ['packages/game-core/src/rules/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  prettier,
);

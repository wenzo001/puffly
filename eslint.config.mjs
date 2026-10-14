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

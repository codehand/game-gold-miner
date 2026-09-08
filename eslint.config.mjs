// @ts-check

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    // Supabase Edge Functions run on Deno, not Node or the browser, so their
    // globals are declared here rather than left undefined. They are outside
    // `tsconfig.json`'s `include` because `Deno` has no type in the Node/DOM
    // libraries the client compiles against; server-side type checking and
    // testing arrive with the Step 7 Edge Function harness.
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        Deno: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'document',
          message: 'Core modules must not depend on DOM APIs.',
        },
        {
          name: 'indexedDB',
          message: 'Core modules must not depend on browser persistence.',
        },
        {
          name: 'localStorage',
          message: 'Core modules must not depend on browser persistence.',
        },
        {
          name: 'navigator',
          message: 'Core modules must not depend on browser APIs.',
        },
        {
          name: 'sessionStorage',
          message: 'Core modules must not depend on browser persistence.',
        },
        {
          name: 'window',
          message: 'Core modules must not depend on DOM APIs.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message: 'Core modules must remain independent of Phaser.',
            },
          ],
          patterns: [
            {
              regex: '^phaser/',
              message: 'Core modules must remain independent of Phaser.',
            },
            {
              regex: '(^|/)(persistence|platform)(/|$)',
              message:
                'Core modules must not import persistence or platform adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/game/view-model/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'document',
          message: 'View models must not depend on DOM APIs.',
        },
        {
          name: 'navigator',
          message: 'View models must not depend on browser APIs.',
        },
        {
          name: 'window',
          message: 'View models must not depend on DOM APIs.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message:
                'View models must stay renderer-free so Node tests can import them.',
            },
          ],
          patterns: [
            {
              regex: '^phaser/',
              message:
                'View models must stay renderer-free so Node tests can import them.',
            },
            {
              regex: '(^|/)(persistence|platform)(/|$)',
              message:
                'View models must not import persistence or platform adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/game/runtime/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'document',
          message: 'The simulation driver must not depend on DOM APIs.',
        },
        {
          name: 'navigator',
          message: 'The simulation driver must not depend on browser APIs.',
        },
        {
          name: 'window',
          message: 'The simulation driver must not depend on DOM APIs.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message:
                'The simulation driver must stay renderer-free so Node tests can advance it.',
            },
          ],
          patterns: [
            {
              regex: '^phaser/',
              message:
                'The simulation driver must stay renderer-free so Node tests can advance it.',
            },
            {
              regex: '(^|/)(persistence|platform)(/|$)',
              message:
                'The simulation driver must not import persistence or platform adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/game/layout/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'document',
          message: 'Layout geometry must not depend on DOM APIs.',
        },
        {
          name: 'navigator',
          message: 'Layout geometry must not depend on browser APIs.',
        },
        {
          name: 'window',
          message: 'Layout geometry must not depend on DOM APIs.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message:
                'Layout geometry must stay renderer-free so Node tests can import it.',
            },
          ],
          patterns: [
            {
              regex: '^phaser/',
              message:
                'Layout geometry must stay renderer-free so Node tests can import it.',
            },
          ],
        },
      ],
    },
  },
);

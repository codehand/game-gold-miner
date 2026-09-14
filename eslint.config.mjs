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
      'supabase/functions/_shared/generated/**',
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
        {
          // Server-milestone Step 6 makes `src/core` importable from Deno
          // Edge Functions. Referencing `Deno` here would only ever be reached
          // from that runtime, so it is exactly as disqualifying for a module
          // meant to run in the browser too as `window` is for one meant to
          // run on the server — the boundary is symmetric.
          name: 'Deno',
          message: 'Core modules must not depend on the Deno/server runtime.',
        },
        {
          // Server-milestone Step 19: "`src/core` must not learn that a server
          // exists." Step 19 adds the first cloud code in `src/`, and the
          // architecture test probes these names so a future core module
          // cannot quietly grow a network call.
          name: 'fetch',
          message: 'Core modules must not depend on the network.',
        },
        {
          name: 'XMLHttpRequest',
          message: 'Core modules must not depend on the network.',
        },
        {
          name: 'WebSocket',
          message: 'Core modules must not depend on the network.',
        },
        {
          name: 'EventSource',
          message: 'Core modules must not depend on the network.',
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
            {
              // Step 6 portability runs the other way: `supabase/` imports
              // `src/core`, never the reverse. A core module importing
              // anything under `supabase/` would make the bundle Step 6
              // produces depend on the Edge Function runtime it is bundled
              // for, defeating the point of bundling it in the first place.
              regex: '(^|/)supabase(/|$)',
              message: 'Core modules must not import server-only Supabase code.',
            },
            {
              // Repository-relative paths are covered above; this covers the
              // npm package Step 7 adds (`@supabase/supabase-js` and any other
              // `@supabase/*` package) so the same rule holds once it exists as
              // a dependency rather than only as a `supabase/` directory.
              regex: '^@supabase/',
              message: 'Core modules must not import server-only Supabase code.',
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

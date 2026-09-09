import { defineConfig, devices } from '@playwright/test';

/**
 * Server-milestone Step 8: E2E specs that need a real, live Supabase Auth
 * service — nothing fakeable locally proves "two browsers receive different
 * identities." Kept out of `playwright.config.ts`/`tests/e2e/` deliberately:
 * `memory-bank/techContext.md` records that `npm test`/`npm run verify` must
 * work with no Docker running, and these specs need the local stack
 * (`npm run supabase:start`) to already be up and reset, exactly like
 * `vitest.server-integration.config.ts` assumes for its own suite.
 *
 * The dev server this config starts needs `VITE_SUPABASE_URL`/
 * `VITE_SUPABASE_ANON_KEY` to point at that live stack. Locally, a
 * `.env.local` copied from `.env.example` already provides them, exactly as
 * it does for `npm run dev`. In CI, `scripts/verify-server-stack.mjs` sets
 * both from a live `supabase status` before invoking `npm run test:server-e2e`
 * — Vite gives `process.env` priority over `.env.local`, so no file needs to
 * exist there.
 */
const BASE_URL = 'http://127.0.0.1:4176';

export default defineConfig({
  testDir: './tests/server-e2e',
  outputDir: 'test-results/server-e2e',
  // The default 30 s per-test timeout is tight once a test also warms up a
  // cold-starting Edge Function (`callWhoAmI`'s own retry loop) on top of a
  // real page boot and session round trip — the same margin problem a 2026-09-09
  // review found and fixed for `tests/server-integration/whoami.integration.test.ts`'s
  // comparable warm-up loop.
  timeout: 60_000,
  // 'line', not 'html': this suite is driven by `scripts/verify-server-stack.mjs`
  // (spawnSync, stdio inherit), the same reason `playwright.production.config.ts`
  // and `playwright.performance.config.ts` avoid 'html' — its default
  // on-failure `show-report` server blocks indefinitely under a script, and
  // its default `playwright-report/` output would collide with the main E2E
  // suite's report.
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

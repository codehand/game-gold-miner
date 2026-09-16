import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PLAYWRIGHT_PORT ?? '4173';
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  reporter: 'html',
  // This suite's two longest specs measure real elapsed play rather than a
  // single interaction: `player-journey` runs the whole fresh-player journey
  // twice (~20 s on a fast development machine) and `production-stages`'
  // animation-speed trial boots the driver twice and advances a paused clock
  // by 8 s each time (~10 s). Playwright's bare 30 s default left the first
  // at two-thirds of its budget before CI was even considered; a GitHub
  // `ubuntu-latest` runner executing two workers on two vCPUs is several
  // times slower again, so both were load-dependent flakes rather than
  // genuine failures. Sized to the measured worst case with CI headroom,
  // matching the explicit timeouts `playwright.server-e2e.config.ts` (60 s),
  // `playwright.production.config.ts` and `playwright.performance.config.ts`
  // already carry for the same reason. Retries are deliberately not enabled:
  // a test that genuinely hangs must still fail this gate.
  timeout: 90_000,
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
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 30_000,
    // Server-milestone Step 22: this suite is the *client-only* gate and must
    // be deterministic and backend-free, exactly as Step 19's test requires
    // ("the full existing client E2E suite passes offline, unchanged"). With
    // `VITE_SUPABASE_URL` unset, `createSupabaseClient` resolves `null`, no
    // session is minted, and offline rewards stay the client's own
    // clock-derived projection — the behaviour these specs were written to
    // pin. The server-verified path is exercised by `test:server-integration`
    // and `test:server-e2e` against the live stack instead. Vite gives
    // `process.env` priority over `.env.local`, so these blank values win even
    // on a developer machine that has one.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});

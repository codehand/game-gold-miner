import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PLAYWRIGHT_PORT ?? '4173';
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  reporter: 'html',
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

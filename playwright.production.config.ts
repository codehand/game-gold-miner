import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4175';

/**
 * Step 36 runs against the optimized bundle served by `vite preview` from the
 * root base path, not against the development server the `tests/e2e` project
 * uses. The build is part of the server command so the served `dist/` always
 * matches the current sources, whether the smoke test is run on its own or as
 * the last stage of `npm run verify`.
 */
export default defineConfig({
  testDir: './tests/production',
  outputDir: 'test-results/production',
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'production-bundle' }],
  webServer: {
    command:
      'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

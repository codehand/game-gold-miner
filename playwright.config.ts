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
  },
});

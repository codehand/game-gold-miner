import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests/performance',
  outputDir: 'test-results/performance',
  reporter: 'line',
  timeout: 660_000,
  use: {
    ...devices['Pixel 5'],
    baseURL: BASE_URL,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mid-range-android-emulation' }],
  webServer: {
    command:
      'VITE_ENABLE_PERFORMANCE_DIAGNOSTICS=true npm run build && ' +
      'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

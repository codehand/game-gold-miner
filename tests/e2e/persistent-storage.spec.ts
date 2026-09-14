import { expect, test } from '@playwright/test';

/**
 * Server-milestone Step 21: measure what the browser actually answers for
 * persistent storage. The values are printed so they can be recorded in
 * `memory-bank/techContext.md` with the measurement date and environment;
 * asserting exact numbers would be flaky, so only the shape is asserted.
 *
 * This measures the `navigator.storage.persist()` half. The iOS Safari
 * seven-day deletion half needs a real device and a seven-day wall-clock
 * observation (threat-model finding F8) and cannot be measured here.
 */
test('records the browser answer for navigator.storage persistent storage', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');

  const raw = await page.locator('#app').getAttribute('data-persistent-storage');
  expect(raw, 'the Step 21 DEV diagnostic is published').toBeTruthy();

  const state = JSON.parse(raw ?? '{}') as {
    supported: boolean;
    persisted: boolean | null;
    quotaBytes: number | null;
    usageBytes: number | null;
  };

  expect(state.supported).toBe(true);
  expect(state.persisted === null || typeof state.persisted === 'boolean').toBe(true);
  expect(state.quotaBytes === null || state.quotaBytes > 0).toBe(true);
  expect(state.usageBytes === null || state.usageBytes >= 0).toBe(true);

  // Recorded by hand into `techContext.md`. Kept as output, not an assertion.
  console.log(`[step-21] navigator.storage measurement: ${JSON.stringify(state)}`);
});

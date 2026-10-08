import type { Page } from '@playwright/test';

/** Player action required before the game scene or offline claim is shown. */
export async function openIntroMine(page: Page): Promise<void> {
  const enter = page.locator('#intro-enter');
  await page.locator('#intro-enter:enabled, #game-viewport canvas').first().waitFor();
  if (await enter.isEnabled()) {
    await enter.click();
    return;
  }

  // Scene-only fixtures replace main.ts and intentionally skip its boot flow.
  // They render the canvas directly, so reveal that fixture for its visual test.
  await page.evaluate(() => document.getElementById('intro-screen')?.remove());
}

import { expect, type Page } from '@playwright/test';

/**
 * V4 resumes a suspended mine before constructing Phaser. A positive grant is
 * therefore the boot surface, rather than a dialog layered over an active
 * simulation. Tests that do not inspect the grant settle it here first.
 */
export async function finishPortfolioBoot(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const reward = page.getByRole('dialog', { name: 'Offline reward' });
  await expect.poll(async () => await canvas.count() > 0 || await reward.isVisible(), {
    timeout: 15_000,
  }).toBe(true);
  if (await reward.isVisible()) {
    await reward.getByRole('button', { name: 'Claim', exact: true }).click();
    await expect(reward).not.toBeVisible({ timeout: 15_000 });
  }
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene', {
    timeout: 15_000,
  });
}

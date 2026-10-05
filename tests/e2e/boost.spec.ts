import { expect, test, type Page } from '@playwright/test';

async function openBoost(page: Page): Promise<void> {
  const reward = page.getByTestId('offline-reward-modal');
  await expect.poll(async () => await reward.isVisible() ||
    await page.locator('#game-viewport canvas').count() === 1).toBe(true);
  if (await reward.isVisible()) await page.getByTestId('offline-reward-claim').click();
  const canvas = page.locator('#game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Game canvas is missing.');
  const items = JSON.parse(await canvas.getAttribute('data-bottom-navigation-items') ?? '[]') as
    Array<{ key: string; bounds: { x: number; y: number; width: number; height: number } }>;
  const boost = items.find((item) => item.key === 'boost');
  if (boost === undefined) throw new Error('Boost button is missing.');
  await page.mouse.click(
    box.x + (boost.bounds.x + boost.bounds.width / 2) * box.width / 360,
    box.y + (boost.bounds.y + boost.bounds.height / 2) * box.height / 640,
  );
  await expect(page.getByRole('dialog', { name: 'Mine Boost' })).toBeVisible();
}

test('free Boost activates once, persists across reload and shows cooldown', async ({ page }) => {
  await page.goto('/');
  await openBoost(page);
  const dialog = page.getByRole('dialog', { name: 'Mine Boost' });
  await expect(dialog).toContainText('Mining, Elevator and Warehouse run 4× faster');
  await dialog.getByRole('button', { name: 'Activate free Boost' }).click();
  await expect(dialog).toContainText('Active ·');
  await expect(dialog.getByRole('button', { name: 'Boost active' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close Boost' }).click();

  await page.reload();
  await openBoost(page);
  await expect(dialog).toContainText('Active ·');
  await expect(dialog.getByRole('button', { name: 'Boost active' })).toBeDisabled();
});

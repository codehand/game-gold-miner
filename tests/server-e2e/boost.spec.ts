import { expect, test, type Page } from '@playwright/test';

async function openBoost(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Canvas is missing.');
  const items = JSON.parse(await canvas.getAttribute('data-bottom-navigation-items') ?? '[]') as
    Array<{ key: string; bounds: { x: number; y: number; width: number; height: number } }>;
  const bounds = items.find((item) => item.key === 'boost')?.bounds;
  if (bounds === undefined) throw new Error('Boost navigation is missing.');
  await page.mouse.click(
    box.x + (bounds.x + bounds.width / 2) * box.width / 360,
    box.y + (bounds.y + bounds.height / 2) * box.height / 640,
  );
}

test('server Boost survives reload and rejects a second free activation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-guest-session', /signed-in/, { timeout: 15_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-cloud-save-reconcile', /no-cloud-save|same-progress|kept-local/, { timeout: 15_000 });

  await openBoost(page);
  const dialog = page.getByRole('dialog', { name: 'Mine Boost' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Activate free Boost' }).click();
  await expect(dialog).toContainText('Active ·', { timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Close Boost' }).click();

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-guest-session', /signed-in/, { timeout: 15_000 });
  await openBoost(page);
  await expect(dialog).toContainText('Active ·', { timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: 'Boost active' })).toBeDisabled();
});

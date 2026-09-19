import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`marketplace browse, rental and drafts at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
    const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!);
    const bounds = items.find((item: { key: string }) => item.key === 'shop').bounds;
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + (bounds.x + bounds.width / 2) * box.width / 360, box.y + (bounds.y + bounds.height / 2) * box.height / 640);
    const dialog = page.getByRole('dialog', { name: 'Marketplace' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.market-card')).toHaveCount(9);
    expect(await dialog.locator('.market-card img').evaluateAll((images) => (
      images.every((image) => image.getAttribute('src')?.includes('/assets/marketplace/catalog/'))
    ))).toBe(true);
    await expect(dialog.locator('[data-icon^="role-"]')).toHaveCount(9);
    await page.getByRole('searchbox', { name: 'Search cats' }).fill('Mofy');
    await expect(dialog.locator('.market-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Rent', exact: true }).click();
    await page.getByRole('button', { name: 'Rent cat', exact: true }).click();
    await expect(dialog).toContainText('Availability: Listed');
    await expect(dialog).toContainText('Power 74');
    await expect(dialog).toContainText('Lift Mastery');
    await expect(dialog.locator('[data-icon="skill-lift-mastery"]')).toHaveCount(1);
    await page.getByLabel('Rental duration').selectOption('3');
    await expect(dialog).toContainText('Total: 720 gold for 3 hr');
    await expect(page.getByRole('button', { name: 'Trading coming soon' })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to cats' }).click();
    await page.getByRole('button', { name: 'My listings', exact: true }).click();
    await page.getByRole('button', { name: 'Create listing' }).click();
    await page.getByLabel('Listing type').selectOption('Hourly rental');
    await page.getByLabel('Price in gold').fill('350');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog).toContainText('Mofy · Hourly rental · 350 gold/hr · Draft');
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(dialog).toContainText('No listings yet');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await page.getByRole('searchbox').fill('');
    await page.getByLabel('Role', { exact: true }).selectOption('Miner');
    await expect(dialog.locator('.market-card')).toHaveCount(2);
    await page.getByLabel('Role', { exact: true }).selectOption('All roles');
    await expect(dialog.locator('.market-card')).toHaveCount(9);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/marketplace-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}

test('runs the close callback exactly once per dismissal path', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  // A callback that only re-enables input is idempotent, so the fire count is
  // the sole evidence that `#close()` and the native `close` event are not
  // both invoking it.
  await expect(canvas).toHaveAttribute('data-marketplace-close-count', '0');

  const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!);
  const bounds = items.find((item: { key: string }) => item.key === 'shop').bounds;
  const box = (await canvas.boundingBox())!;
  const openShop = () => page.mouse.click(
    box.x + (bounds.x + bounds.width / 2) * box.width / 360,
    box.y + (bounds.y + bounds.height / 2) * box.height / 640,
  );
  const dialog = page.getByRole('dialog', { name: 'Marketplace' });

  await openShop();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close marketplace' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(canvas).toHaveAttribute('data-marketplace-close-count', '1');

  await openShop();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(canvas).toHaveAttribute('data-marketplace-close-count', '2');
});

test('falls back to the safe placeholder when a catalog portrait fails', async ({ page }) => {
  await page.route('**/assets/marketplace/catalog/elevator-cargo-cat/ssr/mofy/idle-1.png', (route) => route.abort());
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!);
  const bounds = items.find((item: { key: string }) => item.key === 'shop').bounds;
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(
    box.x + (bounds.x + bounds.width / 2) * box.width / 360,
    box.y + (bounds.y + bounds.height / 2) * box.height / 640,
  );

  const fallback = page.locator('img[data-fallback="true"]').first();
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('src', /\/assets\/placeholder\/miner-cat\.png$/);
});

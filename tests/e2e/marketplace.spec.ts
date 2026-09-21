import { expect, test } from '@playwright/test';

import type { MarketplaceListingType } from '../../src/platform/web/marketplace';

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`marketplace browse remains responsive at ${viewport.width}px`, async ({ page }) => {
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

test('Rent, Sell, and My listings use live projections and commands', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/ui/MarketplaceModal.ts';
    const { MarketplaceModal } = await import(/* @vite-ignore */ modulePath);
    const cat = {
      catInstanceId: 'cat-live-1',
      ownerUserId: 'seller-1',
      assetId: 'miner:SSR:forge:idle',
      displayName: 'Forge',
      roleId: 'miner',
      rarityTier: 'SSR',
      level: 12,
      attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
      calculationVersion: 1,
      availabilityState: 'Idle',
      assignedSlotKey: null,
      updatedAt: Date.now(),
    } as const;
    const listing = {
      listingId: 'listing-live-1',
      sellerUserId: 'seller-1',
      sellerDisplayName: 'Seller',
      cat: { ...cat, availabilityState: 'Listed' },
      listingType: 'rent',
      priceExact: '250',
      status: 'Active',
      buyerUserId: null,
      renterUserId: null,
      durationHours: null,
      expiresAt: null,
      createdAt: '2026-09-20T08:00:00.000Z',
      completedAt: null,
    } as const;
    const sale = { ...listing, listingId: 'listing-sale-1', listingType: 'sale', priceExact: '10000' } as const;
    const parent = document.createElement('div');
    parent.id = 'marketplace-live-fixture';
    document.body.append(parent);
    const roster = { cats: [cat], assignments: [], assignmentRevision: 0, collectionRevision: 1 } as const;
    const command = (resultListing: typeof listing | typeof sale) => ({
      kind: 'applied' as const,
      listingId: resultListing.listingId,
      roster,
      listings: [resultListing],
    });
    const modal = new MarketplaceModal(parent, () => undefined, {
      getCollection: () => roster,
      loadListings: async (type: MarketplaceListingType | null, mineOnly: boolean) => ({
        kind: 'ready' as const,
        listings: mineOnly ? [] : type === 'sale' ? [sale] : [listing],
      }),
      onRentListing: async () => {
        document.body.dataset.marketplaceRentCommand = 'applied';
        return command(listing);
      },
      onBuyListing: async () => {
        document.body.dataset.marketplaceBuyCommand = 'applied';
        return command(sale);
      },
      onCreateListing: async () => {
        document.body.dataset.marketplaceCreateCommand = 'applied';
        return command(sale);
      },
    });
    modal.open();
  });

  const marketplace = page.locator('#marketplace-live-fixture dialog');
  await expect(marketplace).toBeVisible();
  await marketplace.getByRole('button', { name: 'Rent', exact: true }).click();
  await expect(marketplace.locator('.market-card')).toHaveCount(1);
  await marketplace.getByRole('button', { name: 'Rent cat', exact: true }).click();
  await marketplace.getByLabel('Rental duration').selectOption('3');
  await expect(marketplace).toContainText('Total: 750 gold for 3 hr');
  await marketplace.getByRole('button', { name: 'Rent for 750 gold' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-marketplace-rent-command')).toBe('applied');
  await expect(marketplace).toContainText('is now available in your Collection');
  await marketplace.getByRole('button', { name: 'Back to cats' }).click();

  await marketplace.getByRole('button', { name: 'Sell', exact: true }).click();
  await expect(marketplace.locator('.market-card')).toHaveCount(1);
  await marketplace.getByRole('button', { name: 'Buy cat', exact: true }).click();
  await marketplace.getByRole('button', { name: 'Buy for 10,000 gold' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-marketplace-buy-command')).toBe('applied');
  await expect(marketplace).toContainText('was added to your Collection');
  await marketplace.getByRole('button', { name: 'Back to cats' }).click();

  await marketplace.getByRole('button', { name: 'My listings', exact: true }).click();
  await marketplace.getByRole('button', { name: 'Create listing' }).click();
  await marketplace.getByLabel('Listing type').selectOption('For sale');
  await marketplace.getByLabel('Price in gold').fill('10000');
  await marketplace.getByRole('button', { name: 'Publish listing' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-marketplace-create-command')).toBe('applied');
  await expect(marketplace).toContainText('Forge');
});

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

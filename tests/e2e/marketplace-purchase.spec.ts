import { expect, test } from '@playwright/test';

test('Buy detail confirms and invokes the authoritative purchase callback', async ({ page }) => {
  await page.route('**/src/main.ts*', (route) => route.fulfill({
    body: '',
    contentType: 'application/javascript',
  }));
  await page.goto('/');

  await page.evaluate(async () => {
    const modulePath = '/src/ui/MarketplaceModal.ts';
    const { MarketplaceModal } = await import(/* @vite-ignore */ modulePath);
    const parent = document.createElement('div');
    parent.id = 'marketplace-purchase-fixture';
    document.body.append(parent);
    const modal = new MarketplaceModal(parent, () => undefined, {
      onPurchase: async (assetId: string) => {
        document.body.dataset.marketplacePurchaseAssetId = assetId;
        document.body.dataset.marketplacePurchaseCount = String(
          Number(document.body.dataset.marketplacePurchaseCount ?? '0') + 1,
        );
        return { kind: 'applied' };
      },
      getWalletGold: () => '100000',
    });
    modal.open();
  });

  const marketplace = page.locator('#marketplace-purchase-fixture dialog');
  await expect(marketplace).toBeVisible();
  await marketplace.getByRole('searchbox', { name: 'Search cats' }).fill('Forge');
  await marketplace.getByRole('button', { name: 'View cat' }).click();
  await marketplace.getByRole('button', { name: 'Buy for 36,000 gold' }).click();
  await expect(marketplace).toContainText('Buy listed Forge for 36,000 gold?');
  await expect(marketplace.getByRole('button', { name: 'Confirm purchase' })).toHaveCount(0);
  await expect(marketplace.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  const confirmBox = await marketplace.getByRole('button', { name: 'Buy listed cat' }).boundingBox();
  const cancelBox = await marketplace.getByRole('button', { name: 'Back to cats', exact: true }).boundingBox();
  expect(confirmBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(Math.abs(confirmBox!.y - cancelBox!.y)).toBeLessThanOrEqual(1);
  expect(cancelBox!.x).toBeGreaterThan(confirmBox!.x);

  await marketplace.getByRole('button', { name: 'Buy listed cat' }).click();

  await expect(marketplace).toContainText('Forge was added to your Collection.');
  await expect.poll(() => page.locator('body').getAttribute('data-marketplace-purchase-asset-id'))
    .toBe('miner:SSR:forge:idle');
  await marketplace.getByRole('button', { name: 'Buy another Forge' }).click();
  await marketplace.getByRole('button', { name: 'Buy listed cat' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-marketplace-purchase-count'))
    .toBe('2');
  await expect(marketplace).toContainText('Forge was added to your Collection.');
});

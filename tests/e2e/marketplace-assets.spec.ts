import { expect, test } from '@playwright/test';

const CATALOG_PORTRAITS = [
  '/assets/marketplace/catalog/elevator-cargo-cat/ssr/mofy/idle-1.png',
  '/assets/marketplace/catalog/elevator-cargo-cat/ssr/elon/idle-1.png',
  '/assets/marketplace/catalog/elevator-cargo-cat/ssr/win/idle-1.png',
  '/assets/marketplace/catalog/warehouse-manager/sr/baron/idle-1.png',
  '/assets/marketplace/catalog/warehouse-manager/sr/cipher/idle-1.png',
  '/assets/marketplace/catalog/warehouse-manager/sr/gauge/idle-1.png',
  '/assets/marketplace/catalog/warehouse-manager/ssr/nautilus/idle-1.png',
  '/assets/marketplace/catalog/miner/n/mica/idle-1.png',
  '/assets/marketplace/catalog/miner/ssr/forge/idle-1.png',
] as const;

test('serves every Marketplace catalog portrait at its canonical native size', async ({ page }) => {
  await page.goto('/');

  const portraits = await page.evaluate(async (paths) => {
    return Promise.all(paths.map((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ src, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ src, width: 0, height: 0 });
      image.src = src;
    })));
  }, CATALOG_PORTRAITS);

  expect(portraits).toEqual(CATALOG_PORTRAITS.map((src) => ({
    src,
    width: 128,
    height: 128,
  })));
});

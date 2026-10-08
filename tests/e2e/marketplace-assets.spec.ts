import { openIntroMine } from '../helpers/openIntroMine';
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
  '/assets/marketplace/catalog/miner/ssr/boru/idle-1.png',
] as const;

test('serves every Marketplace catalog portrait at its canonical native size', async ({ page }) => {
  await page.goto('/');
  await openIntroMine(page);

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

test('Boru portrait fills its catalog canvas for Marketplace and assignment', async ({ page }) => {
  await page.goto('/');
  await openIntroMine(page);
  const bounds = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/assets/marketplace/catalog/miner/ssr/boru/idle-1.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, 128, 128);
    let left = 128;
    let top = 128;
    let right = 0;
    let bottom = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        if (data[(y * 128 + x) * 4 + 3] > 8) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x + 1);
          bottom = Math.max(bottom, y + 1);
        }
      }
    }
    return { width: right - left, height: bottom - top };
  });
  expect(bounds.width).toBeGreaterThanOrEqual(108);
  expect(bounds.height).toBeGreaterThanOrEqual(88);
});

import { expect, test } from '@playwright/test';

import { MARKETPLACE_RUNTIME_ROLE_ASSETS } from '../../src/game/assets/marketplaceRuntimeAssets';

const RUNTIME_ASSETS = Object.values(MARKETPLACE_RUNTIME_ROLE_ASSETS).map((asset) => ({
  assetId: asset.assetId,
  path: asset.publicPath,
  frameSizePx: asset.frameSizePx,
}));

test('renders the approved Marketplace role assets in runtime presentation slots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const canvas = page.locator('#game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');

  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-marketplace-runtime-assets') ?? '{}')
  ))).toEqual({
    elevator: 'elevator-cargo-cat:SSR:mofy:idle',
    warehouse: 'warehouse-manager:SR:baron:idle',
    miner: 'miner:SSR:forge:idle',
  });

  const animation = await page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-animation') ?? '{}')
  ));
  expect(animation.elevatorCargoCat).toMatchObject({
    assetId: 'elevator-cargo-cat:SSR:mofy:idle',
    texture: 'marketplace-runtime-elevator-mofy',
    width: MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.displaySize,
    height: MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.displaySize,
  });
  expect(animation.warehouseManager).toMatchObject({
    assetId: 'warehouse-manager:SR:baron:idle',
    texture: 'marketplace-runtime-warehouse-baron',
    width: MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.displaySize,
    height: MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.displaySize,
  });

  const floorViews = await page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-floor-views') ?? '[]')
  ));
  expect(floorViews.length).toBeGreaterThan(0);
  expect(floorViews.every((floor: {
    minerAssetId: string;
    minerTextureKey: string;
    minerCrew: readonly { width: number; height: number }[];
  }) => (
    floor.minerAssetId === 'miner:SSR:forge:idle' &&
    floor.minerTextureKey === 'marketplace-runtime-miner-forge' &&
    floor.minerCrew.every((miner) => (
      miner.width === MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.displaySize &&
      miner.height === MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.displaySize
    ))
  ))).toBe(true);

  const runtimeDimensions = await page.evaluate(async (assets) => (
    Promise.all(assets.map(({ assetId, path }) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ assetId, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ assetId, width: 0, height: 0 });
      image.src = path;
    })))
  ), RUNTIME_ASSETS);
  expect(runtimeDimensions).toEqual(RUNTIME_ASSETS.map(({ assetId, frameSizePx }) => ({
    assetId,
    width: frameSizePx * 4,
    height: frameSizePx * 2,
  })));

  await page.screenshot({ path: 'test-results/marketplace-runtime-390.png' });
});

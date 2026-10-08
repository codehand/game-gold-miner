import { openIntroMine } from '../helpers/openIntroMine';
import { expect, test } from '@playwright/test';

import { MARKETPLACE_RUNTIME_ANIMATION_ASSETS, MARKETPLACE_RUNTIME_ROLE_ASSETS } from '../../src/game/assets/marketplaceRuntimeAssets';
import { CAT_RUNTIME_DISPLAY_SIZE } from '../../src/game/layout';

const RUNTIME_ASSETS = [...new Map([
  ...Object.values(MARKETPLACE_RUNTIME_ROLE_ASSETS),
  ...MARKETPLACE_RUNTIME_ANIMATION_ASSETS,
].map((asset) => [asset.textureKey, asset])).values()].map((asset) => ({
  assetId: asset.assetId,
  path: asset.publicPath,
  frameSizePx: asset.frameSizePx,
  frameCount: asset.frameCount,
}));

test('renders default and Marketplace role assets in runtime presentation slots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openIntroMine(page);
  const canvas = page.locator('#game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');

  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-marketplace-runtime-assets') ?? '{}')
  ))).toEqual({
    elevator: 'elevator-cargo-cat:N:pip:idle',
    warehouse: 'warehouse-manager:SR:baron:idle',
    miner: 'miner:N:mica:idle',
  });

  const animation = await page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-animation') ?? '{}')
  ));
  expect(animation.elevatorCargoCat).toMatchObject({
    assetId: 'elevator-cargo-cat:N:pip:idle',
    texture: 'default-elevator-pip',
    width: CAT_RUNTIME_DISPLAY_SIZE,
    height: CAT_RUNTIME_DISPLAY_SIZE,
  });
  expect(animation.surfaceElevatorCat).toMatchObject({
    assetId: 'elevator-cargo-cat:N:pip:idle',
    texture: 'default-elevator-pip',
    width: CAT_RUNTIME_DISPLAY_SIZE,
    height: CAT_RUNTIME_DISPLAY_SIZE,
  });
  expect(animation.warehouseManager).toMatchObject({
    assetId: 'warehouse-manager:SR:baron:idle',
    texture: 'marketplace-runtime-warehouse-baron',
    width: MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.displaySize,
    height: MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.displaySize,
  });
  expect(MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.displaySize).toBe(
    MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.displaySize,
  );
  expect(MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.displaySize).toBe(
    MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.displaySize,
  );
  expect(animation.elevatorCargoCat.width).toBe(
    CAT_RUNTIME_DISPLAY_SIZE,
  );
  expect(animation.surfaceElevatorCat.width).toBe(
    MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.displaySize,
  );
  expect(animation.warehouseManager.width).toBe(
    MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.displaySize,
  );

  const floorViews = await page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-floor-views') ?? '[]')
  ));
  expect(floorViews.length).toBeGreaterThan(0);
  expect(floorViews.every((floor: {
    minerAssetId: string;
    minerTextureKey: string;
    minerCrew: readonly { width: number; height: number }[];
  }) => (
    floor.minerAssetId === 'miner:N:mica:idle' &&
    floor.minerTextureKey === 'marketplace-runtime-miner-mica-walk-right' &&
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
  expect(runtimeDimensions).toEqual(RUNTIME_ASSETS.map(({ assetId, frameSizePx, frameCount }) => ({
    assetId,
    width: frameSizePx * (frameCount / 2),
    height: frameSizePx * 2,
  })));

  await page.screenshot({ path: 'test-results/marketplace-runtime-390.png' });
});

test('keeps Mica right-facing walk and strike frames at one in-world scale and baseline', async ({ page }) => {
  await page.goto('/');
  await openIntroMine(page);
  const frames = await page.evaluate(async () => {
    const paths = [
      '/assets/marketplace/runtime/miner/mica-walk-right-4f-sheet.png',
      '/assets/marketplace/runtime/miner/mica-attack-4f-sheet.png',
    ];
    return Promise.all(paths.map(async (path) => {
      const image = new Image();
      image.src = path;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Canvas 2D context unavailable');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      return Array.from({ length: 4 }, (_, frame) => {
        const cellX = (frame % 2) * 128;
        const cellY = Math.floor(frame / 2) * 128;
        let top = 128;
        let bottom = 0;
        for (let y = 0; y < 128; y += 1) {
          for (let x = 0; x < 128; x += 1) {
            const alpha = data[((cellY + y) * canvas.width + cellX + x) * 4 + 3];
            if (alpha > 8) {
              top = Math.min(top, y);
              bottom = Math.max(bottom, y + 1);
            }
          }
        }
        return { height: bottom - top, bottom };
      });
    }));
  });

  const [walk, strike] = frames;
  for (const frame of walk) {
    expect(frame.height).toBeGreaterThanOrEqual(72);
    expect(frame.height).toBeLessThanOrEqual(78);
    expect(frame.bottom).toBeGreaterThanOrEqual(119);
    expect(frame.bottom).toBeLessThanOrEqual(123);
  }
  for (const frame of [strike[0], strike[3]]) {
    expect(Math.abs(frame.height - walk[0].height)).toBeLessThanOrEqual(5);
    expect(Math.abs(frame.bottom - walk[0].bottom)).toBeLessThanOrEqual(2);
  }
});

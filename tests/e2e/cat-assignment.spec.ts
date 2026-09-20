import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateFloorSlotRegion } from '../../src/game/layout';
import {
  CAT_CALCULATION_VERSION,
  createInitialGameState,
  type CatRosterState,
} from '../../src/core';
import { createSaveDocument } from '../../src/persistence';

const FIXTURE_TIMESTAMP_MS = new Date('2026-09-19T08:00:00.000Z').getTime();

function createAssignmentFixture(): CatRosterState {
  return {
    cats: [
      {
        catInstanceId: 'cat-miner-forge',
        ownerUserId: 'fixture-user',
        assetId: 'miner:SSR:forge:idle',
        displayName: 'Forge',
        roleId: 'miner',
        rarityTier: 'SSR',
        level: 7,
        attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
        calculationVersion: CAT_CALCULATION_VERSION,
        availabilityState: 'Assigned',
        assignedSlotKey: 'miner:floor-1',
        updatedAt: FIXTURE_TIMESTAMP_MS,
      },
      {
        catInstanceId: 'cat-miner-mica',
        ownerUserId: 'fixture-user',
        assetId: 'miner:N:mica:idle',
        displayName: 'Mica',
        roleId: 'miner',
        rarityTier: 'N',
        level: 2,
        attributes: { power: 68, speed: 64, capacity: 58, efficiency: 70 },
        calculationVersion: CAT_CALCULATION_VERSION,
        availabilityState: 'Idle',
        assignedSlotKey: null,
        updatedAt: FIXTURE_TIMESTAMP_MS - 1_000,
      },
      {
        catInstanceId: 'cat-elevator-mofy',
        ownerUserId: 'fixture-user',
        assetId: 'elevator-cargo-cat:SSR:mofy:idle',
        displayName: 'Mofy',
        roleId: 'elevator',
        rarityTier: 'SSR',
        level: 4,
        attributes: { power: 74, speed: 91, capacity: 80, efficiency: 83 },
        calculationVersion: CAT_CALCULATION_VERSION,
        availabilityState: 'Idle',
        assignedSlotKey: null,
        updatedAt: FIXTURE_TIMESTAMP_MS - 2_000,
      },
      {
        catInstanceId: 'cat-warehouse-baron',
        ownerUserId: 'fixture-user',
        assetId: 'warehouse-manager:SR:baron:idle',
        displayName: 'Baron',
        roleId: 'warehouse',
        rarityTier: 'SR',
        level: 2,
        attributes: { power: 85, speed: 65, capacity: 90, efficiency: 78 },
        calculationVersion: CAT_CALCULATION_VERSION,
        availabilityState: 'Idle',
        assignedSlotKey: null,
        updatedAt: FIXTURE_TIMESTAMP_MS - 3_000,
      },
    ],
    assignments: [{ slotKey: 'miner:floor-1', catInstanceId: 'cat-miner-forge' }],
    assignmentRevision: 1,
    collectionRevision: 4,
  };
}

async function bootAssignmentFixture(page: Page): Promise<void> {
  const document = createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS),
    BASE_GAME_BALANCE,
    FIXTURE_TIMESTAMP_MS,
    createAssignmentFixture(),
  );
  let shouldSeed = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!shouldSeed) {
      await route.continue();
      return;
    }

    shouldSeed = false;
    await route.fulfill({
      body: `
        const request = indexedDB.open('cat-mine-idle');
        await new Promise((resolve, reject) => {
          request.onupgradeneeded = () => {
            request.result.createObjectStore('saves', { keyPath: 'id' });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('saves', 'readwrite');
            transaction.objectStore('saves').put({ id: 'active', document: ${JSON.stringify(document)} });
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
          };
        });
        await import('/src/main.ts?assignment-seeded');
      `,
      contentType: 'application/javascript',
    });
  });

  await page.goto('/');
  await expect(page.locator('#game-viewport canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
}

async function clickFirstMiner(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const box = (await canvas.boundingBox())!;
  const floor = JSON.parse((await canvas.getAttribute('data-floor-views'))!)[0] as {
    minerCrew: Array<{ x: number; y: number }>;
  };
  const miner = floor.minerCrew[0];
  const region = calculateFloorSlotRegion(0, 360);
  const [mineX, mineY] = (await canvas.getAttribute('data-layout-mine'))!
    .split(',')
    .map(Number);
  await page.mouse.click(
    box.x + (mineX + region.x + miner.x) * box.width / 360,
    box.y + (mineY + region.y + miner.y) * box.height / 640,
  );
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`filters candidates, compares, and keeps the old cat on offline rejection at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await bootAssignmentFixture(page);
    await clickFirstMiner(page);

    const dialog = page.getByRole('dialog', { name: 'Assigned cat' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Forge');
    await expect(dialog).toContainText('Mining Mastery');

    await dialog.getByRole('button', { name: 'Change cat' }).click();
    await expect(dialog.getByRole('heading', { name: 'Choose a Miner cat' })).toBeVisible();
    await expect(dialog.locator('.cat-assignment-candidate')).toHaveCount(1);
    await expect(dialog.locator('.cat-assignment-candidate')).toContainText('Mica');

    await dialog.locator('.cat-assignment-candidate').click();
    await expect(dialog).toContainText('Forge → Mica');
    await expect(dialog).toContainText('Role score');
    await dialog.getByRole('button', { name: 'Confirm change' }).click();
    await expect(dialog).toContainText('Reconnect and retry.');
    await expect(dialog).toContainText('Mica');
    await expect(dialog.locator('.cat-assignment-candidate')).toHaveCount(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

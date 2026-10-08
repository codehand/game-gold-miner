import { openIntroMine } from '../helpers/openIntroMine';
import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  CAT_CALCULATION_VERSION,
  createInitialGameState,
  type CatRosterState,
} from '../../src/core';
import { createSaveDocument } from '../../src/persistence';

const FIXTURE_TIMESTAMP_MS = new Date('2026-09-19T08:00:00.000Z').getTime();

function createCollectionFixture(): CatRosterState {
  return {
    cats: [
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
        updatedAt: FIXTURE_TIMESTAMP_MS - 1_000,
      },
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
    ],
    assignments: [{ slotKey: 'miner:floor-1', catInstanceId: 'cat-miner-forge' }],
    assignmentRevision: 1,
    collectionRevision: 3,
  };
}

async function bootCollectionFixture(page: Page): Promise<void> {
  const saveDocument = createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS),
    BASE_GAME_BALANCE,
    FIXTURE_TIMESTAMP_MS,
    createCollectionFixture(),
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
            transaction.objectStore('saves').put({
              id: 'active',
              document: ${JSON.stringify(saveDocument)},
            });
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
          };
        });
        await import('/src/main.ts?collection-seeded');
      `,
      contentType: 'application/javascript',
    });
  });

  await page.goto('/');
  await openIntroMine(page);
  const reward = page.getByTestId('offline-reward-modal');
  await expect.poll(async () => await reward.isVisible() ||
    await page.locator('#game-viewport canvas').count() === 1).toBe(true);
  if (await reward.isVisible()) await page.getByTestId('offline-reward-claim').click();
  await expect(page.locator('#game-viewport canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
}

async function openCollection(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!);
  const bounds = items.find((item: { key: string }) => item.key === 'managers').bounds;
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(
    box.x + (bounds.x + bounds.width / 2) * box.width / 360,
    box.y + (bounds.y + bounds.height / 2) * box.height / 640,
  );
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`browses owned cats and opens detail at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await bootCollectionFixture(page);
    await openCollection(page);

    const dialog = page.getByRole('dialog', { name: 'Cat Collection' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('3 owned cats · Collection #3');
    await expect(dialog.locator('.collection-card')).toHaveCount(3);
    await expect(dialog.locator('[data-icon^="role-"]')).toHaveCount(3);

    await dialog.getByRole('searchbox', { name: 'Search your cats' }).fill('Forge');
    await expect(dialog.locator('.collection-card')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'View detail' }).click();
    await expect(dialog).toContainText('Mining Mastery');
    await expect(dialog).toContainText('Assigned · Gold Mine · Floor 1');
    await expect(dialog.locator('[data-icon="skill-mining-mastery"]')).toHaveCount(1);

    await dialog.getByRole('button', { name: '← Back to collection' }).click();
    await dialog.getByRole('searchbox', { name: 'Search your cats' }).fill('');
    await dialog.getByLabel('Role', { exact: true }).selectOption('Miner');
    await expect(dialog.locator('.collection-card')).toHaveCount(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}

test('distinguishes an unavailable collection from a genuinely empty one', async ({ page }) => {
  await page.goto('/');
  await openIntroMine(page);
  await expect(page.locator('#game-viewport canvas')).toHaveAttribute('data-boot-scene', 'BootScene');

  await page.evaluate(async () => {
    const modulePath = '/src/ui/CollectionModal.ts';
    const { CollectionModal } = await import(/* @vite-ignore */ modulePath);
    const parent = document.createElement('div');
    parent.id = 'collection-error-fixture';
    document.body.append(parent);
    const modal = new CollectionModal({
      parent,
      getRoster: () => ({ cats: [], assignments: [], assignmentRevision: 0, collectionRevision: 0 }),
      getStatus: () => 'error',
      onRetry: () => {
        document.body.dataset.collectionRetry = 'true';
      },
    });
    modal.open();
  });

  const dialog = page.getByRole('dialog', { name: 'Cat Collection' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Collection unavailable · Retry to reconnect');
  await expect(dialog).not.toContainText('0 owned cats');
  await expect(dialog).toContainText('Your collection could not be loaded. Retry to check your saved cats.');
  await expect(dialog.locator('.collection-card')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-collection-retry', 'true');
});

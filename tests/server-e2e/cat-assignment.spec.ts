import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  CAT_CALCULATION_VERSION,
  createInitialGameState,
  type CatRosterState,
} from '../../src/core';
import { calculateFloorSlotRegion } from '../../src/game/layout';
import { PLACEHOLDER_ANIMATION_TEXTURES } from '../../src/game/assets/placeholderAssets';
import { createSaveDocument } from '../../src/persistence';

const FIXTURE_TIMESTAMP_MS = new Date('2026-09-19T08:00:00.000Z').getTime();

function createRoster(assignedTo: 'forge' | 'mica'): CatRosterState {
  const forgeAssigned = assignedTo === 'forge';
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
        availabilityState: forgeAssigned ? 'Assigned' : 'Idle',
        assignedSlotKey: forgeAssigned ? 'miner:floor-1' : null,
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
        availabilityState: forgeAssigned ? 'Idle' : 'Assigned',
        assignedSlotKey: forgeAssigned ? null : 'miner:floor-1',
        updatedAt: forgeAssigned ? FIXTURE_TIMESTAMP_MS - 1_000 : FIXTURE_TIMESTAMP_MS,
      },
    ],
    assignments: [{
      slotKey: 'miner:floor-1',
      catInstanceId: forgeAssigned ? 'cat-miner-forge' : 'cat-miner-mica',
    }],
    assignmentRevision: forgeAssigned ? 1 : 2,
    collectionRevision: forgeAssigned ? 2 : 3,
  };
}

function toApiProjection(roster: CatRosterState): object {
  return {
    ...roster,
    cats: roster.cats.map((cat) => ({
      ...cat,
      updatedAt: new Date(cat.updatedAt).toISOString(),
    })),
  };
}

async function seedSave(page: Page, roster: CatRosterState): Promise<void> {
  const now = Date.now();
  const document = createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, now),
    BASE_GAME_BALANCE,
    now,
    roster,
  );
  await page.addInitScript((seeded) => {
    if (sessionStorage.getItem('cat-assignment-fixture-seeded') === '1') {
      return;
    }
    sessionStorage.setItem('cat-assignment-fixture-seeded', '1');
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('cat-mine-idle', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('saves')) {
          request.result.createObjectStore('saves', { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('saves', 'readwrite');
        transaction.objectStore('saves').put({ id: 'active', document: seeded });
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, document);
}

async function clickFirstMiner(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const box = (await canvas.boundingBox())!;
  const floor = JSON.parse((await canvas.getAttribute('data-floor-views'))!)[0] as {
    minerCrew: Array<{ x: number; y: number }>;
  };
  const [mineX, mineY] = (await canvas.getAttribute('data-layout-mine'))!
    .split(',')
    .map(Number);
  const region = calculateFloorSlotRegion(0, 360);
  const miner = floor.minerCrew[0];
  await page.mouse.click(
    box.x + (mineX + region.x + miner.x) * box.width / 360,
    box.y + (mineY + region.y + miner.y) * box.height / 640,
  );
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`confirms an authoritative cat replacement at ${viewport.width}px`, async ({ page }) => {
    const before = createRoster('forge');
    const after = createRoster('mica');
    let currentRoster = before;
    let assignmentPayload: unknown = null;

    await seedSave(page, before);
    await page.route('**/functions/v1/cat-collection/v1/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(toApiProjection(currentRoster)),
      });
    });
    await page.route('**/functions/v1/cat-collection/v1/assignment', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization, content-type, accept',
            'access-control-allow-methods': 'POST, OPTIONS',
          },
        });
        return;
      }
      assignmentPayload = JSON.parse(route.request().postData() ?? 'null');
      currentRoster = after;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(toApiProjection(after)),
      });
    });

    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#app')).toHaveAttribute('data-guest-session', /signed-in/);
    await expect(page.locator('#game-viewport canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
    const offlineReward = page.getByTestId('offline-reward-modal');
    if (await offlineReward.count() > 0) {
      await page.getByTestId('offline-reward-claim').click();
      await expect(offlineReward).toHaveCount(0);
    }
    await clickFirstMiner(page);

    const dialog = page.getByRole('dialog', { name: 'Assigned cat' });
    await expect(dialog).toContainText('Forge');
    await dialog.getByRole('button', { name: 'Change cat' }).click();
    await dialog.locator('.cat-assignment-candidate').click();
    await dialog.getByRole('button', { name: 'Confirm change' }).click();

    await expect(dialog).toContainText('Cat changed. The new assignment is saved.');
    await expect(dialog).toContainText('Mica');
    expect(assignmentPayload).toEqual({
      catInstanceId: 'cat-miner-mica',
      slotKey: 'miner:floor-1',
      expectedAssignmentRevision: 1,
    });

    await expect.poll(async () => page.evaluate(async () => {
      return await new Promise<string | null>((resolve) => {
        const request = indexedDB.open('cat-mine-idle');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const transaction = request.result.transaction('saves', 'readonly');
          const read = transaction.objectStore('saves').get('active');
          read.onerror = () => resolve(null);
          read.onsuccess = () => {
            const document = (read.result as { document?: { cats?: Array<{ displayName?: string }> } } | undefined)?.document;
            resolve(document?.cats?.find((cat) => cat.displayName === 'Mica')?.displayName ?? null);
          };
        };
      });
    })).toBe('Mica');

    const runtime = page.locator('#game-viewport canvas');
    await expect.poll(async () => page.evaluate(() => (
      JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-cat-runtime-bindings') ?? '[]')
        .find((binding: { slotKey: string }) => binding.slotKey === 'miner:floor-1')
    ))).toMatchObject({
      catInstanceId: 'cat-miner-mica',
      assignedAssetId: 'miner:N:mica:idle',
      runtimeAssetId: null,
      usesFallback: true,
      textureKey: PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
    });

    await page.reload();
    await expect(runtime).toHaveAttribute('data-boot-scene', 'BootScene');
    await expect.poll(async () => page.evaluate(() => (
      JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-cat-runtime-bindings') ?? '[]')
        .find((binding: { slotKey: string }) => binding.slotKey === 'miner:floor-1')
    ))).toMatchObject({
      catInstanceId: 'cat-miner-mica',
      assignedAssetId: 'miner:N:mica:idle',
      runtimeAssetId: null,
      usesFallback: true,
    });
  });
}

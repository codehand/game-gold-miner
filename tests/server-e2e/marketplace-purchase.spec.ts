import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createEmptyCatRoster, createInitialGameState, GameNumber } from '../../src/core';
import { calculateFloorSlotRegion } from '../../src/game/layout';
import { createSaveDocument } from '../../src/persistence';

async function seedSave(page: Page): Promise<void> {
  const now = Date.now();
  const state = createInitialGameState(BASE_GAME_BALANCE, now);
  const document = createSaveDocument(
    { ...state, gold: GameNumber.from(100_000) },
    BASE_GAME_BALANCE,
    now,
    createEmptyCatRoster(),
  );
  await page.addInitScript((seeded) => {
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

async function openShop(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!);
  const bounds = items.find((item: { key: string }) => item.key === 'shop').bounds;
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(
    box.x + (bounds.x + bounds.width / 2) * box.width / 360,
    box.y + (bounds.y + bounds.height / 2) * box.height / 640,
  );
}

async function buy(page: Page, name: string, price: string): Promise<void> {
  await openShop(page);
  const marketplace = page.getByRole('dialog', { name: 'Marketplace' });
  await expect(marketplace).toBeVisible();
  await marketplace.getByRole('searchbox', { name: 'Search cats' }).fill(name);
  await marketplace.getByRole('button', { name: 'View cat' }).click();
  await marketplace.getByRole('button', { name: `Buy for ${price} gold` }).click();
  await marketplace.getByRole('button', { name: 'Confirm purchase' }).click();
  await expect(marketplace).toContainText(`${name} was added to your Collection.`, { timeout: 15_000 });
  await marketplace.getByRole('button', { name: 'Close marketplace' }).click();
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

test('performs live Buy purchases against Supabase', async ({ page }) => {
  await seedSave(page);
  await page.goto('/');
  await expect(page.locator('#game-viewport canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect(page.locator('#app')).toHaveAttribute('data-guest-session', /signed-in/, { timeout: 15_000 });

  // The first hydrated local document is uploaded after the guest session and
  // boot reconcile settle. The purchase endpoint then sees the seeded wallet.
  await expect.poll(async () => page.locator('#app').getAttribute('data-cloud-save-upload'), {
    timeout: 15_000,
  }).toMatch(/uploaded|same-progress/);

  await buy(page, 'Forge', '36,000');
  await buy(page, 'Mica', '8,500');

  await clickFirstMiner(page);
  const assignment = page.getByRole('dialog', { name: 'Assigned cat' });
  await expect(assignment).toContainText('No Miner cat is assigned to this slot.');
  await assignment.getByRole('button', { name: 'Choose a cat' }).click();
  const forge = assignment.locator('.cat-assignment-candidate').first();
  const forgeId = await forge.getAttribute('data-cat-instance-id');
  await forge.click();
  await assignment.getByRole('button', { name: 'Confirm change' }).click();
  await expect(assignment).toContainText('Cat changed. The new assignment is saved.');
  await expect(assignment).toContainText('Forge');

  await assignment.getByRole('button', { name: 'Change cat' }).click();
  const mica = assignment.locator('.cat-assignment-candidate').first();
  const micaId = await mica.getAttribute('data-cat-instance-id');
  await mica.click();
  await expect(assignment).toContainText(/mining output/);
  await assignment.getByRole('button', { name: 'Confirm change' }).click();
  await expect(assignment).toContainText('Cat changed. The new assignment is saved.');
  await expect(assignment).toContainText('Mica');
  expect(forgeId).not.toBe(micaId);

  await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-cat-runtime-bindings') ?? '[]')
      .find((binding: { slotKey: string }) => binding.slotKey === 'miner:floor-1')
  ))).toMatchObject({ assignedAssetId: 'miner:N:mica:idle' });

  await page.reload();
  await expect(page.locator('#game-viewport canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-cat-runtime-bindings') ?? '[]')
      .find((binding: { slotKey: string }) => binding.slotKey === 'miner:floor-1')
  ))).toMatchObject({ assignedAssetId: 'miner:N:mica:idle' });
});

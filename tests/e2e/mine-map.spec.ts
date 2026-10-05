import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialPortfolio, GameNumber, type CatRosterState } from '../../src/core';
import { calculateFloorSlotRegion } from '../../src/game/layout';
import { createPortfolioSaveDocument } from '../../src/persistence';

const FIXED_TIME_MS = Date.parse('2026-10-01T10:00:00.000Z');

test('buys a site from the shared wallet, enters it and restores it on reload', async ({ page }) => {
  await page.clock.install({ time: new Date(FIXED_TIME_MS) });
  await page.clock.setFixedTime(new Date(FIXED_TIME_MS));
  const initial = createInitialPortfolio(FIXED_TIME_MS);
  const gold = initial.mines.gold!;
  const portfolio = {
    ...initial,
    walletGold: GameNumber.from('2e9'),
    mines: {
      gold: {
        ...gold,
        state: {
          ...gold.state,
          floors: gold.state.floors.map((floor, index) => ({
            ...floor,
            isUnlocked: index < 5,
            mineShaftLevel: index < 4
              ? BASE_GAME_BALANCE.floors[index + 1].unlockRequirement?.level ?? 1
              : floor.mineShaftLevel,
          })),
        },
      },
    },
  };
  const roster: CatRosterState = {
    cats: [{
      catInstanceId: 'forge-gold-1',
      ownerUserId: 'player-1',
      assetId: 'miner:SSR:forge:idle',
      displayName: 'Forge',
      roleId: 'miner',
      rarityTier: 'SSR',
      level: 1,
      attributes: { power: 100, speed: 100, capacity: 100, efficiency: 100 },
      calculationVersion: 1,
      availabilityState: 'Assigned',
      assignedSlotKey: 'miner:floor-1',
      updatedAt: FIXED_TIME_MS,
    }, {
      catInstanceId: 'forge-amethyst-1',
      ownerUserId: 'player-1',
      assetId: 'miner:SSR:forge:idle',
      displayName: 'Forge',
      roleId: 'miner',
      rarityTier: 'SSR',
      level: 1,
      attributes: { power: 80, speed: 80, capacity: 80, efficiency: 80 },
      calculationVersion: 1,
      availabilityState: 'Idle',
      assignedSlotKey: null,
      updatedAt: FIXED_TIME_MS,
    }],
    assignments: [{ slotKey: 'miner:floor-1', catInstanceId: 'forge-gold-1' }],
    assignmentRevision: 1,
    collectionRevision: 1,
  };
  const save = createPortfolioSaveDocument(portfolio, FIXED_TIME_MS, roster);
  let seeded = false;
  await page.route('**/src/main.ts*', async (route) => {
    if (seeded) {
      await route.continue();
      return;
    }
    seeded = true;
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const request = indexedDB.open('cat-mine-idle');
        await new Promise((resolve, reject) => {
          request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'id' });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('saves', 'readwrite');
            transaction.objectStore('saves').put({ id: 'active', document: ${JSON.stringify(save)} });
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => { database.close(); resolve(); };
          };
        });
        await import('/src/main.ts?portfolio-map-seeded');
      `,
    });
  });

  await page.goto('/');
  const canvas = page.locator('#game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'gold');
  await expect.poll(() => assignedMinerAsset(page)).toBe('miner:SSR:forge:idle');
  await openMap(page);
  const map = page.getByRole('dialog', { name: 'Mine Map' });
  await page.screenshot({ path: 'test-results/mine-map-route.png' });
  await expect(map.getByRole('button', { name: /Amethyst Cavern Available/ })).toBeVisible();
  await map.getByRole('button', { name: /Amethyst Cavern Available/ }).click();
  await expect(map.getByText('Price: 1b gold')).toBeVisible();
  await map.getByRole('button', { name: 'Buy mine' }).click();
  await expect(map.getByRole('button', { name: /Amethyst Cavern Owned/ })).toBeVisible();
  await expect(map.getByText('1b gold', { exact: true })).toBeVisible();
  await map.getByRole('button', { name: 'Enter mine' }).click();
  await expect(map).not.toBeVisible();
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'amethyst');
  await expect.poll(() => assignedMinerAsset(page)).toBeNull();
  expect((await readSavedPortfolio(page)).assignments).toEqual([
    { slotKey: 'mine:gold:miner:floor-1', catInstanceId: 'forge-gold-1' },
  ]);
  await clickFirstMiner(page);
  const assignment = page.getByRole('dialog', { name: 'Assigned cat' });
  await expect(assignment).toBeVisible();
  await assignment.getByRole('button', { name: 'Change cat' }).click();
  await assignment.locator('.cat-assignment-candidate').click();
  await assignment.getByRole('button', { name: 'Confirm change' }).click();
  await expect.poll(() => assignedMinerAsset(page)).toBe('miner:SSR:forge:idle');
  await expect.poll(async () => (await readSavedPortfolio(page)).assignments).toEqual([
    { slotKey: 'mine:amethyst:miner:floor-1', catInstanceId: 'forge-amethyst-1' },
    { slotKey: 'mine:gold:miner:floor-1', catInstanceId: 'forge-gold-1' },
  ]);
  await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
  await page.screenshot({ path: 'test-results/mine-map-amethyst.png' });
  const goldIntervalSequence = (await readSavedPortfolio(page)).mines.gold.offlineSequence;

  await page.route('**/mine-map-away.html', (route) => route.fulfill({
    body: '<!doctype html><title>Away</title>',
    contentType: 'text/html',
  }));
  await page.goto('/mine-map-away.html');
  await page.clock.setFixedTime(new Date(FIXED_TIME_MS + 60_000));
  await page.goto('/');
  const amethystReward = page.getByRole('dialog', { name: 'Offline reward' });
  await expect(amethystReward).toBeVisible();
  await expect(amethystReward.getByText('Amethyst Cavern · Amethyst')).toBeVisible();
  await expect(amethystReward.locator('img')).toHaveAttribute(
    'src',
    '/assets/sites/landmarks/amethyst.svg',
  );
  await amethystReward.getByRole('button', { name: 'Claim' }).click();
  await expect(amethystReward).not.toBeVisible();
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'amethyst');

  await page.reload();
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'amethyst');
  await expect.poll(() => assignedMinerAsset(page)).toBe('miner:SSR:forge:idle');
  await openMap(page);
  await expect(map.getByRole('button', { name: /Amethyst Cavern Current/ })).toBeVisible();
  await expect(map.getByRole('button', { name: /Gold Mine Reward ready/ })).toBeVisible();

  await map.getByRole('button', { name: 'Close Map' }).click();
  await expect(canvas).toHaveAttribute('data-map-close-count', '1');
  await page.clock.setFixedTime(new Date(FIXED_TIME_MS + 60_000));
  await openMap(page);
  await expect(map.getByRole('button', { name: /Gold Mine Reward ready/ })).toBeVisible();
  await map.getByRole('button', { name: /Gold Mine Reward ready/ }).click();
  await expect(map.getByRole('button', { name: 'Claim & enter mine' })).toBeVisible();
  await map.getByRole('button', { name: 'Claim & enter mine' }).click();
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'gold');
  await expect.poll(() => assignedMinerAsset(page)).toBe('miner:SSR:forge:idle');
  const claimed = await readSavedPortfolio(page);
  expect(claimed.mines.gold.lastClaimedSequence).toBe(goldIntervalSequence);
  expect(claimed.mines.gold.offline).toBeNull();

  await page.reload();
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'gold');
  const reloaded = await readSavedPortfolio(page);
  expect(reloaded.mines.gold.lastClaimedSequence).toBeGreaterThanOrEqual(goldIntervalSequence);
  expect(reloaded.mines.gold.offline).toBeNull();
  expect(reloaded.walletGold).toBe(claimed.walletGold);
});

async function openMap(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!) as Array<{
    key: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  const map = items.find((item) => item.key === 'map')!;
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(
    box.x + (map.bounds.x + map.bounds.width / 2) * box.width / 360,
    box.y + (map.bounds.y + map.bounds.height / 2) * box.height / 640,
  );
  await expect(page.getByRole('dialog', { name: 'Mine Map' })).toBeVisible();
}

async function assignedMinerAsset(page: Page): Promise<string | null> {
  const raw = await page.locator('#game-viewport canvas').getAttribute('data-cat-runtime-bindings');
  if (raw === null) return null;
  const bindings = JSON.parse(raw) as Array<{ slotKey: string; assignedAssetId: string | null }>;
  return bindings.find((binding) => binding.slotKey === 'miner:floor-1')?.assignedAssetId ?? null;
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
    .split(',').map(Number);
  await page.mouse.click(
    box.x + (mineX + region.x + miner.x) * box.width / 360,
    box.y + (mineY + region.y + miner.y) * box.height / 640,
  );
}

async function readSavedPortfolio(page: Page): Promise<{
  walletGold: string;
  assignments: Array<{ slotKey: string; catInstanceId: string }>;
  mines: { gold: { lastClaimedSequence: number; offlineSequence: number; offline: unknown } };
}> {
  return page.evaluate(async () => {
    const request = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{ document: {
      walletGold: string;
      assignments: Array<{ slotKey: string; catInstanceId: string }>;
      mines: { gold: { lastClaimedSequence: number; offlineSequence: number; offline: unknown } };
    } }>((resolve, reject) => {
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result);
    });
    database.close();
    return record.document;
  });
}

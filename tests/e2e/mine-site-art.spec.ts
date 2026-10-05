import { expect, test, type Page } from '@playwright/test';

import { getMineBalance, MINE_SITE_IDS, type MineSiteId } from '../../src/config';
import {
  createInitialGameState,
  createInitialPortfolio,
  GameNumber,
  qualifyMineCatSlot,
  type CatRosterState,
  type OwnedMine,
} from '../../src/core';
import { createPortfolioSaveDocument } from '../../src/persistence';

const FIXED_TIME_MS = Date.parse('2026-10-01T10:00:00.000Z');

test('renders each owned site with its own surface and floor art', async ({ page }) => {
  await page.clock.install({ time: new Date(FIXED_TIME_MS) });
  await page.clock.setFixedTime(new Date(FIXED_TIME_MS));
  const initial = createInitialPortfolio(FIXED_TIME_MS);
  const mines: Partial<Record<MineSiteId, OwnedMine>> = { ...initial.mines };
  for (const siteId of MINE_SITE_IDS) {
    if (siteId === 'gold') continue;
    const { gold: ignoredWallet, ...state } = createInitialGameState(
      getMineBalance(siteId), FIXED_TIME_MS,
    );
    void ignoredWallet;
    const floors = state.floors.map((floor, index) => {
      const nextRequirement = getMineBalance(siteId).floors[index + 1]
        ?.unlockRequirement ?? null;
      return {
        ...floor,
        isUnlocked: true,
        mineShaftLevel: nextRequirement?.level ?? floor.mineShaftLevel,
        extractionProgress: index === 0 && siteId === 'amethyst'
          ? 0.7
          : index === 0 && siteId === 'ruby'
            ? 0.94
            : floor.extractionProgress,
      };
    });
    mines[siteId] = {
      state: {
        ...state,
        floors,
        elevator: siteId === 'diamond'
          ? {
              ...state.elevator,
              carriedMaterial: GameNumber.from(1),
              roundRobinCursor: -1,
            }
          : state.elevator,
      },
      purchasedAtMs: FIXED_TIME_MS,
      visitCount: 0,
      offlineSequence: 0,
      lastClaimedSequence: 0,
      offline: null,
      pendingClaim: null,
    };
  }
  const roster: CatRosterState = {
    cats: [createBoru('boru-amethyst', 'amethyst'), createBoru('boru-ruby', 'ruby')],
    assignments: ['amethyst', 'ruby'].map((siteId) => ({
      slotKey: qualifyMineCatSlot(siteId as MineSiteId, 'miner:floor-1'),
      catInstanceId: `boru-${siteId}`,
    })),
    assignmentRevision: 2,
    collectionRevision: 2,
  };
  const save = createPortfolioSaveDocument({
    ...initial,
    walletGold: GameNumber.from('1e13'),
    mines,
  }, FIXED_TIME_MS, roster);
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
        await import('/src/main.ts?mine-site-art-seeded');
      `,
    });
  });
  await page.goto('/');
  const canvas = page.locator('#game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'gold');

  for (const siteId of MINE_SITE_IDS) {
    if (siteId === 'gold') continue;
    await openMap(page);
    const map = page.getByRole('dialog', { name: 'Mine Map' });
    await map.locator(`[data-mine-id="${siteId}"]`).click();
    await map.getByRole('button', { name: 'Enter mine' }).click();
    await expect(canvas).toHaveAttribute('data-mine-site-id', siteId);
    await expect.poll(async () => {
      const animation = JSON.parse((await canvas.getAttribute('data-animation'))!) as {
        surfaceLandscape: { texture: string };
        elevatorShaft: { texture: string };
        elevatorTower: { texture: string };
        warehouseBuilding: { texture: string };
        surfaceHauler: { goldPourTexture: string };
        elevatorCargoMaterial: { texture: string; visible: boolean };
        surfaceElevatorCargoMaterial: { texture: string };
      };
      return [animation.surfaceLandscape.texture, animation.elevatorShaft.texture,
        animation.elevatorTower.texture,
        animation.warehouseBuilding.texture, animation.surfaceHauler.goldPourTexture,
        animation.elevatorCargoMaterial.texture,
        animation.elevatorCargoMaterial.visible,
        animation.surfaceElevatorCargoMaterial.texture];
    }).toEqual([`${siteId}-surface`, `${siteId}-shaft`, `${siteId}-tower-empty`,
      `${siteId}-warehouse`, `${siteId}-pour`, `${siteId}-ore-pile`,
      siteId === 'diamond', `${siteId}-ore-pile`]);
    const floors = JSON.parse((await canvas.getAttribute('data-floor-views'))!) as Array<{
      backgroundTextureKey: string;
      orePileTextureKey: string;
      miningImpactTextureKey: string;
      excavatorCargoTextureKey: string;
      excavatorCargoVisible: boolean;
      excavatorPourTextureKey: string;
      excavatorPourVisible: boolean;
      minerCrew: Array<{ textureKey: string }>;
    }>;
    expect(floors[0].backgroundTextureKey).toBe(`${siteId}-floor-upper`);
    expect(floors[4].backgroundTextureKey).toBe(`${siteId}-floor-upper`);
    expect(floors[5].backgroundTextureKey).toBe(`${siteId}-floor-middle`);
    expect(floors[9].backgroundTextureKey).toBe(`${siteId}-floor-middle`);
    expect(floors[10].backgroundTextureKey).toBe(`${siteId}-floor-deep`);
    expect(floors[14].backgroundTextureKey).toBe(`${siteId}-floor-deep`);
    expect(floors[0].orePileTextureKey).toBe(`${siteId}-ore-pile`);
    expect(floors[0].miningImpactTextureKey).toBe(`${siteId}-impact`);
    if (siteId === 'amethyst') {
      await expect.poll(async () => {
        const floor = JSON.parse((await canvas.getAttribute('data-floor-views'))!)[0];
        return [floor.minerCrew[0].textureKey, floor.excavatorCargoTextureKey,
          floor.excavatorCargoVisible, floor.excavatorPourVisible];
      }).toEqual([
        'marketplace-runtime-miner-boru-travel-empty',
        'amethyst-ore-pile',
        true,
        false,
      ]);
    }
    if (siteId === 'ruby') {
      await expect.poll(async () => {
        const floor = JSON.parse((await canvas.getAttribute('data-floor-views'))!)[0];
        return [floor.minerCrew[0].textureKey, floor.excavatorCargoVisible,
          floor.excavatorPourTextureKey, floor.excavatorPourVisible];
      }).toEqual([
        'marketplace-runtime-miner-boru-deposit',
        false,
        'ruby-pour',
        true,
      ]);
    }
    await page.screenshot({ path: `test-results/mine-site-${siteId}-upper.png` });
    const scroll = JSON.parse((await canvas.getAttribute('data-mine-scroll'))!) as {
      maxScrollY: number;
      scrollY: number;
    };
    const canvasBox = (await canvas.boundingBox())!;
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.wheel(0, scroll.maxScrollY / 2);
    await expect.poll(async () => {
      const current = JSON.parse((await canvas.getAttribute('data-mine-scroll'))!) as {
        scrollY: number;
      };
      return current.scrollY;
    }).toBeGreaterThan(scroll.maxScrollY * 0.35);
    await page.screenshot({ path: `test-results/mine-site-${siteId}-middle.png` });
    await page.mouse.wheel(0, scroll.maxScrollY * 2);
    await expect.poll(async () => {
      const current = JSON.parse((await canvas.getAttribute('data-mine-scroll'))!) as {
        scrollY: number;
      };
      return current.scrollY;
    }).toBe(scroll.maxScrollY);
    await page.screenshot({ path: `test-results/mine-site-${siteId}-deep.png` });
  }
  await page.reload();
  await expect(canvas).toHaveAttribute('data-mine-site-id', 'diamond');
  await expect.poll(async () => {
    const animation = JSON.parse((await canvas.getAttribute('data-animation'))!) as {
      surfaceHauler: { goldPourTexture: string };
      elevatorCargoMaterial: { texture: string };
    };
    const floors = JSON.parse((await canvas.getAttribute('data-floor-views'))!) as Array<{
      miningImpactTextureKey: string;
    }>;
    return [animation.surfaceHauler.goldPourTexture,
      animation.elevatorCargoMaterial.texture,
      floors[0].miningImpactTextureKey];
  }).toEqual(['diamond-pour', 'diamond-ore-pile', 'diamond-impact']);
});

function createBoru(catInstanceId: string, mineId: MineSiteId): CatRosterState['cats'][number] {
  const slotKey = qualifyMineCatSlot(mineId, 'miner:floor-1');
  return {
    catInstanceId,
    ownerUserId: 'fixture',
    assetId: 'miner:SSR:boru:idle',
    displayName: 'Boru',
    roleId: 'miner',
    rarityTier: 'SSR',
    level: 1,
    attributes: { power: 96, speed: 68, capacity: 95, efficiency: 90 },
    calculationVersion: 1,
    availabilityState: 'Assigned',
    assignedSlotKey: slotKey,
    updatedAt: FIXED_TIME_MS,
  };
}

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

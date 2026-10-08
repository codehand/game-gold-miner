import { openIntroMine } from '../helpers/openIntroMine';
import { expect, test, type Page } from '@playwright/test';

import { resolveHaulerCartAsset } from '../../src/game/assets/marketplaceRuntimeAssets';
import { SURFACE_HAULER_END_X, SURFACE_HAULER_START_X } from '../../src/game/layout';

interface Cart {
  phase: string;
  cartX: number;
  cartTexture: string;
  hasCargo: boolean;
}

async function readCart(page: Page, slot: number): Promise<Cart> {
  return page.locator('#game-viewport canvas').evaluate((canvas, index) => {
    const lead = JSON.parse(canvas.getAttribute('data-animation')!).surfaceHauler;
    return index === 0 ? lead : lead.assistants[index - 1];
  }, slot);
}

async function setQueue(page: Page, amount: number): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as { cargoFixture: { setQueue(amount: number): void } }).cargoFixture.setQueue(value);
  }, amount);
}

for (const [slot, name, assetId] of [
  [0, 'default', null],
  [1, 'Tobi', 'hauler:SR:tobi:walk'],
  [2, 'Rivet', 'hauler:SSR:rivet:walk'],
] as const) {
  test(`${name} retains a picked-up load until warehouse handoff`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    const fixedTime = new Date('2026-09-30T08:00:00Z');
    await page.clock.install({ time: fixedTime });
    await page.clock.pauseAt(fixedTime);
    // Isolated browser fixture: real driver/scene, constant simulation clock.
    // No user save or account is accessed; only tower availability is varied.
    await page.route('**/src/main.ts*', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `
        import { createGame, MineSimulationDriver } from '/src/game/index.ts';
        import { createInitialGameState, CAT_CALCULATION_VERSION, GameNumber } from '/src/core/index.ts';
        import { BASE_GAME_BALANCE } from '/src/config/index.ts';
        const now = ${fixedTime.getTime()};
        const initial = createInitialGameState(BASE_GAME_BALANCE, now);
        const cats = ['tobi', 'rivet'].map((name, index) => ({
          catInstanceId: name, ownerUserId: 'fixture',
          assetId: 'hauler:' + (index === 0 ? 'SR' : 'SSR') + ':' + name + ':walk',
          displayName: name, roleId: 'hauler', rarityTier: index === 0 ? 'SR' : 'SSR',
          level: 1, attributes: { power: 70, speed: 70, capacity: 70, efficiency: 70 },
          calculationVersion: CAT_CALCULATION_VERSION, availabilityState: 'Assigned',
          assignedSlotKey: 'hauler:' + (index + 2), updatedAt: now,
        }));
        const driver = new MineSimulationDriver({
          state: { ...initial, warehouse: { ...initial.warehouse, level: 20, inputQueue: GameNumber.from(1000) } },
          catRoster: { cats, assignments: cats.map(cat => ({ slotKey: cat.assignedSlotKey, catInstanceId: cat.catInstanceId })), assignmentRevision: 1, collectionRevision: 1 },
          balance: BASE_GAME_BALANCE, now: () => now,
        });
        createGame(document.querySelector('#game-viewport'), driver);
        window.cargoFixture = {
          setQueue: amount => driver.replaceState({ ...driver.state, warehouse: { ...driver.state.warehouse, inputQueue: GameNumber.from(amount) } }),
        };
      `,
    }));
    await page.goto('/');
    await openIntroMine(page);
    const canvas = page.locator('#game-viewport canvas');
    await expect.poll(async () => {
      await page.clock.runFor(100);
      expect(errors).toEqual([]);
      return canvas.getAttribute('data-boot-scene');
    }).toBe('BootScene');
    const asset = resolveHaulerCartAsset(assetId);
    const waitFor = async (predicate: (cart: Cart) => boolean) => {
      await expect.poll(async () => {
        await page.clock.runFor(80);
        return predicate(await readCart(page, slot));
      }, { timeout: 15_000, intervals: [0] }).toBe(true);
    };

    await waitFor(cart => cart.phase === 'loading' && cart.hasCargo);
    expect((await readCart(page, slot)).cartX).toBeCloseTo(SURFACE_HAULER_START_X);
    await waitFor(cart => cart.phase === 'delivering' && cart.cartTexture === asset.filledTexture);
    await setQueue(page, 0);
    await page.clock.runFor(120);
    expect((await readCart(page, slot)).cartTexture).toBe(asset.filledTexture);
    await page.screenshot({ path: testInfo.outputPath('loaded-with-empty-tower.png') });

    // Check every sampled frame until the load disappears, not just one
    // conveniently timed delivery snapshot. It may disappear only at the end.
    let handedOff = false;
    for (let frame = 0; frame < 60 && !handedOff; frame++) {
      await page.clock.runFor(80);
      const cart = await readCart(page, slot);
      if (cart.cartTexture === asset.emptyTexture) {
        expect(cart.phase).toBe('unloading');
        expect(cart.cartX).toBeCloseTo(SURFACE_HAULER_END_X);
        handedOff = true;
      } else {
        expect(cart.cartTexture).toBe(asset.filledTexture);
        expect(['delivering', 'unloading']).toContain(cart.phase);
      }
    }
    expect(handedOff).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('empty-after-handoff.png') });
    await waitFor(cart => cart.phase === 'returning');
    expect((await readCart(page, slot)).cartTexture).toBe(asset.emptyTexture);

    // A refill after departure must not magically fill a cart mid-route.
    await waitFor(cart => cart.phase === 'loading');
    await waitFor(cart => cart.phase === 'delivering');
    await setQueue(page, 1000);
    await page.clock.runFor(160);
    expect((await readCart(page, slot)).cartTexture).toBe(asset.emptyTexture);
    await waitFor(cart => cart.phase === 'unloading');
    expect((await readCart(page, slot)).cartTexture).toBe(asset.emptyTexture);
    await waitFor(cart => cart.phase === 'loading' && cart.cartTexture === asset.filledTexture);
    expect(errors).toEqual([]);
  });
}

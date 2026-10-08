import { openIntroMine } from '../helpers/openIntroMine';
import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createEmptyCatRoster, createInitialGameState, GameNumber } from '../../src/core';
import { calculateFloorSlotRegion } from '../../src/game/layout';
import { createSaveDocument } from '../../src/persistence';

async function seedSave(page: Page, warehouseLevel = 1): Promise<void> {
  const now = Date.now();
  const state = createInitialGameState(BASE_GAME_BALANCE, now);
  const document = createSaveDocument(
    {
      ...state, gold: GameNumber.from(100_000),
      warehouse: {
        ...state.warehouse, level: warehouseLevel,
        capacity: calculateLevelEffect(BASE_GAME_BALANCE.warehouse.baseCapacity, warehouseLevel, BASE_GAME_BALANCE.warehouse.upgrade),
      },
    },
    BASE_GAME_BALANCE,
    now,
    createEmptyCatRoster(),
  );
  await page.addInitScript((seeded) => {
    if (sessionStorage.getItem('marketplace-fixture-seeded')) return;
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
          sessionStorage.setItem('marketplace-fixture-seeded', 'true');
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

async function finishPortfolioBoot(page: Page): Promise<void> {
  const canvas = page.locator('#game-viewport canvas');
  const reward = page.getByRole('dialog', { name: 'Offline reward' });
  const conflict = page.getByText('Your device and cloud have different mine progress.');
  const deferred = page.getByText('Mine progress could not be synchronized.');
  await expect.poll(async () =>
    await canvas.count() > 0 || await reward.isVisible() ||
      await conflict.isVisible() || await deferred.isVisible(), {
    timeout: 15_000,
  }).toBe(true);
  if (await conflict.isVisible() || await deferred.isVisible()) {
    throw new Error(`Portfolio boot failed: ${JSON.stringify({
      boot: await page.locator('#app').getAttribute('data-portfolio-boot'),
      conflict: await page.locator('#app').getAttribute('data-portfolio-conflict'),
    })}`);
  }
  if (await reward.isVisible()) {
    await reward.getByRole('button', { name: 'Claim', exact: true }).click();
  }
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene', { timeout: 15_000 });
}

async function buy(page: Page, name: string, price: string): Promise<void> {
  await openShop(page);
  const marketplace = page.getByRole('dialog', { name: 'Marketplace' });
  await expect(marketplace).toBeVisible();
  await marketplace.getByRole('searchbox', { name: 'Search cats' }).fill(name);
  await marketplace.getByRole('button', { name: 'View cat' }).click();
  await marketplace.getByRole('button', { name: `Buy for ${price} gold` }).click();
  await marketplace.getByRole('button', { name: /^(Confirm purchase|Buy listed cat)$/ }).click();
  await expect.poll(async () => await marketplace.textContent(), { timeout: 15_000 })
    .toMatch(new RegExp(`${name} was added|Purchase unavailable`));
  if ((await marketplace.textContent())?.includes('Purchase unavailable')) {
    throw new Error(`Portfolio purchase diagnostics: ${await page.locator('#app').evaluate((element) => ({
      routine: (element as HTMLElement).dataset.portfolioRoutineSync,
      purchase: (element as HTMLElement).dataset.portfolioCatPurchase,
    })).then(JSON.stringify)}`);
  }
  const canvas = page.locator('#game-viewport canvas');
  const closesBefore = Number((await canvas.getAttribute('data-marketplace-close-count')) ?? '0');
  await marketplace.getByRole('button', { name: 'Close marketplace' }).click();
  // Scene input is re-enabled only by the dialog's queued `close` event, which
  // also bumps this count. A canvas press sent before it lands on disabled
  // input and is dropped, so the next `openShop` must wait for it.
  await expect(canvas).toHaveAttribute('data-marketplace-close-count', String(closesBefore + 1));
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

test('buys Boru, assigns the excavator to a Miner floor and preserves it on reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSave(page);
  await page.goto('/');
  await openIntroMine(page);
  const canvas = page.locator('#game-viewport canvas');
  await finishPortfolioBoot(page);
  await expect(page.locator('#app')).toHaveAttribute('data-guest-session', /signed-in/, { timeout: 15_000 });
  await expect.poll(() => page.locator('#app').getAttribute('data-cloud-save-upload'), { timeout: 15_000 })
    .toMatch(/uploaded|same-progress/);
  await buy(page, 'Boru', '42,000');
  await clickFirstMiner(page);
  const assignment = page.getByRole('dialog', { name: 'Assigned cat' });
  await expect(assignment).toContainText('Default miner');
  await assignment.getByRole('button', { name: 'Change cat' }).click();
  const boruCandidate = assignment.locator('.cat-assignment-candidate').filter({ hasText: 'Boru' });
  await expect(boruCandidate.locator('img')).toHaveAttribute('src', /catalog\/miner\/ssr\/boru\/idle-1\.png/);
  await boruCandidate.screenshot({ path: testInfo.outputPath('boru-candidate.png') });
  await boruCandidate.click();
  await assignment.getByRole('button', { name: 'Confirm change' }).click();
  await expect(assignment).toContainText('Cat changed. The new assignment is saved.');
  await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
  await expect.poll(() => canvas.getAttribute('data-cat-runtime-bindings')).toContain('miner:SSR:boru:idle');
  await page.screenshot({ path: testInfo.outputPath('boru-live-assigned.png') });
  await page.reload();
  await openIntroMine(page);
  await finishPortfolioBoot(page);
  await expect.poll(() => canvas.getAttribute('data-cat-runtime-bindings')).toContain('miner:SSR:boru:idle');
});

test('performs live Buy purchases against Supabase', async ({ page }) => {
  await seedSave(page);
  await page.goto('/');
  await openIntroMine(page);
  await finishPortfolioBoot(page);
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
  await expect(assignment).toContainText('Default miner · base production');
  await assignment.getByRole('button', { name: 'Change cat' }).click();
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
  await openIntroMine(page);
  await finishPortfolioBoot(page);
  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(document.querySelector('#game-viewport canvas')?.getAttribute('data-cat-runtime-bindings') ?? '[]')
      .find((binding: { slotKey: string }) => binding.slotKey === 'miner:floor-1')
  ))).toMatchObject({ assignedAssetId: 'miner:N:mica:idle' });
});

test('buys and equips Tobi and Rivet per cart, persists and returns to default', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSave(page, 20);
  await page.goto('/');
  await openIntroMine(page);
  const canvas = page.locator('#game-viewport canvas');
  await finishPortfolioBoot(page);
  await expect(page.locator('#app')).toHaveAttribute('data-guest-session', /signed-in/, { timeout: 15_000 });
  await expect.poll(() => page.locator('#app').getAttribute('data-cloud-save-upload'), { timeout: 15_000 }).toMatch(/uploaded|same-progress/);
  await buy(page, 'Tobi', '18,000');
  await buy(page, 'Rivet', '42,000');

  const clickHauler = async (slot: number) => {
    // Any visible Hauler opens the crew panel; select the stable cart button
    // instead of racing the desired moving/overlapping sprite.
    await page.waitForTimeout(150);
    const offline = page.getByRole('dialog', { name: 'Offline reward' });
    if (await offline.isVisible()) await offline.getByRole('button', { name: 'Claim', exact: true }).click();
    // The warehouse manager legitimately overlaps unloading carts. Click the
    // lead while it is on the open middle of the route, not under that actor.
    // The Hauler keeps walking between reading its position and the click
    // landing, and scene input returns only after the previous dialog's queued
    // `close` event; either can drop one press, so re-aim until it opens.
    const dialog = page.getByRole('dialog', { name: 'Assigned cat' });
    await expect(async () => {
      await page.waitForFunction(() => {
        const data = document.querySelector('#game-viewport canvas')?.getAttribute('data-animation');
        const crew = data ? JSON.parse(data).surfaceHauler : null;
        return crew && crew.catX > 110 && crew.catX < 190;
      });
      const animation = JSON.parse((await canvas.getAttribute('data-animation'))!);
      const crew = animation.surfaceHauler;
      const cat = { x: crew.catX, y: crew.catY };
      const [surfaceX, surfaceY] = (await canvas.getAttribute('data-layout-surface'))!.split(',').map(Number);
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + (surfaceX + cat.x) * box.width / 360, box.y + (surfaceY + cat.y) * box.height / 640);
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await dialog.getByRole('button', { name: `Cart ${slot}`, exact: true }).click();
    await expect(dialog).toContainText(`Slot hauler:${slot}`);
  };
  const assignment = page.getByRole('dialog', { name: 'Assigned cat' });
  const equip = async (slot: number, name: string) => {
    await clickHauler(slot);
    await expect(assignment).toContainText('Default Hauler');
    await assignment.getByRole('button', { name: 'Change cat' }).click();
    await assignment.locator('.cat-assignment-candidate').filter({ hasText: name }).click();
    await assignment.getByRole('button', { name: 'Confirm change' }).click();
    await expect(assignment).toContainText('Cat changed. The new assignment is saved.');
    await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
    await expect(assignment).toBeHidden();
  };
  const bindings = async () => JSON.parse((await canvas.getAttribute('data-cat-runtime-bindings'))!);
  await equip(1, 'Tobi');
  await equip(2, 'Rivet');
  await expect.poll(bindings).toEqual(expect.arrayContaining([
    expect.objectContaining({ slotKey: 'hauler:1', assignedAssetId: 'hauler:SR:tobi:walk' }),
    expect.objectContaining({ slotKey: 'hauler:2', assignedAssetId: 'hauler:SSR:rivet:walk' }),
    expect.objectContaining({ slotKey: 'hauler:3', assignedAssetId: null }),
  ]));
  await clickHauler(3);
  await expect(assignment.getByRole('button', { name: 'No compatible cats' })).toBeDisabled();
  await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
  await expect(assignment).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('hauler-crew-mobile.png') });

  await page.reload();
  await openIntroMine(page);
  await finishPortfolioBoot(page);
  await expect.poll(bindings).toEqual(expect.arrayContaining([
    expect.objectContaining({ slotKey: 'hauler:1', assignedAssetId: 'hauler:SR:tobi:walk' }),
    expect.objectContaining({ slotKey: 'hauler:2', assignedAssetId: 'hauler:SSR:rivet:walk' }),
  ]));
  const animation = JSON.parse((await canvas.getAttribute('data-animation'))!);
  expect(animation.surfaceHauler.catTexture).toBe('marketplace-runtime-hauler-tobi');
  expect(animation.surfaceHauler.cartTexture).toMatch(/^hauler-tobi-cart-/);
  expect(animation.surfaceHauler).toMatchObject({ cartWidth: 64, cartHeight: 64, catWidth: 52, catHeight: 52 });
  expect(animation.surfaceHauler.assistants[0].catTexture).toBe('marketplace-runtime-hauler-rivet');
  expect(animation.surfaceHauler.assistants[0].cartTexture).toMatch(/^hauler-rivet-cart-/);
  expect(animation.surfaceHauler.assistants[0]).toMatchObject({ cartWidth: 64, cartHeight: 64, catWidth: 52, catHeight: 52 });
  expect(animation.surfaceHauler.assistants[1]).toMatchObject({ cartWidth: 46, cartHeight: 46, catWidth: 52, catHeight: 52 });
  expect(animation.surfaceHauler.assistants[0].cartY).toBeLessThan(animation.surfaceHauler.cartY);
  expect(animation.surfaceHauler.thrusters).toEqual({ visible: false, jets: [] });
  expect(animation.surfaceHauler.assistants[0].thrusters.visible).toBe(true);
  expect(animation.surfaceHauler.assistants[0].thrusters.jets).toHaveLength(2);
  expect(animation.surfaceHauler.assistants.slice(1).every(
    (cart: { thrusters: { visible: boolean } }) => !cart.thrusters.visible,
  )).toBe(true);
  // Exercise texture changes over the live loop: an empty/filled swap must
  // never resize either vehicle or its operator.
  const seenCartTextures = new Set<string>();
  const seenThrusterLengths = new Set<number>();
  const seenRivetDirections = new Set<boolean>();
  await expect.poll(async () => {
    const lead = JSON.parse((await canvas.getAttribute('data-animation'))!).surfaceHauler;
    for (const cart of [lead, lead.assistants[0]]) {
      expect(cart).toMatchObject({ cartWidth: 64, cartHeight: 64, catWidth: 52, catHeight: 52 });
      seenCartTextures.add(cart.cartTexture);
    }
    const rivet = lead.assistants[0];
    expect(rivet.thrusters.visible).toBe(true);
    expect(rivet.thrusters.jets).toHaveLength(2);
    for (const [index, sourceX] of [48, 99].entries()) {
      const jet = rivet.thrusters.jets[index];
      expect(jet.x).toBeCloseTo(rivet.cartX + (rivet.flipX ? -1 : 1) * (sourceX / 128 - 0.5) * 64);
      expect(jet.y).toBeCloseTo(rivet.cartY);
      expect(jet.length).toBeGreaterThanOrEqual(5);
      expect(jet.length).toBeLessThanOrEqual(7.5);
      seenThrusterLengths.add(Math.round(jet.length * 100));
    }
    seenRivetDirections.add(rivet.flipX);
    return {
      textures: [...seenCartTextures].sort(),
      directions: seenRivetDirections.size,
      animated: seenThrusterLengths.size > 2,
    };
  }, { timeout: 15_000, intervals: [100] }).toEqual({
    textures: [
      'hauler-rivet-cart-empty', 'hauler-rivet-cart-filled',
      'hauler-tobi-cart-empty', 'hauler-tobi-cart-filled',
    ],
    directions: 2,
    animated: true,
  });
  await clickHauler(1);
  await assignment.getByRole('button', { name: 'Use default Hauler' }).click();
  await expect(assignment).toContainText('Cat changed. The new assignment is saved.');
  await expect(assignment).toContainText('Default Hauler');
  await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
  await expect(assignment).toBeHidden();
  await equip(3, 'Tobi');
  await expect.poll(bindings).toEqual(expect.arrayContaining([
    expect.objectContaining({ slotKey: 'hauler:1', assignedAssetId: null }),
    expect.objectContaining({ slotKey: 'hauler:3', assignedAssetId: 'hauler:SR:tobi:walk' }),
  ]));
  const restored = JSON.parse((await canvas.getAttribute('data-animation'))!).surfaceHauler;
  expect(restored).toMatchObject({ cartWidth: 46, cartHeight: 46, catWidth: 52, catHeight: 52 });
  expect(restored.assistants[1]).toMatchObject({ cartWidth: 64, cartHeight: 64, catWidth: 52, catHeight: 52 });
  // Removing Rivet must clear both jets; moving him to the lead exercises the
  // same effect on slot 1, not just the assistant renderer.
  await clickHauler(2);
  await assignment.getByRole('button', { name: 'Use default Hauler' }).click();
  await expect(assignment).toContainText('Cat changed. The new assignment is saved.');
  await assignment.getByRole('button', { name: 'Close assigned cat' }).click();
  await expect(assignment).toBeHidden();
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-animation'))!)
    .surfaceHauler.assistants[0].thrusters).toEqual({ visible: false, jets: [] });
  await equip(1, 'Rivet');
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-animation'))!)
    .surfaceHauler.thrusters.jets.length).toBe(2);
  await page.waitForFunction(() => {
    const crew = JSON.parse(document.querySelector('canvas')!.getAttribute('data-animation')!).surfaceHauler;
    return crew.cartX > 120 && crew.cartX < 180 && !crew.catFlipX;
  });
  await page.screenshot({ path: testInfo.outputPath('rivet-thrusters-mobile.png') });
  expect(errors).toEqual([]);
});

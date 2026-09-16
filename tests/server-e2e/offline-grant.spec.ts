import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { GameNumber, calculateLevelEffect, createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { formatAmount } from '../../src/game/view-model/formatAmount';
import { createServiceRoleClient } from '../server-integration/serviceRoleFixture';
import { tolerateNavigation } from './navigationFixture';

/**
 * Server-milestone Step 22: the credited offline reward is the server's.
 *
 * Proves the client half against the live stack: a stored row with an old
 * server `received_at` produces a server-computed `offlineGrant`, the browser
 * applies it, and the reward the player sees is that server figure — not the
 * client's own clock-derived projection, which for a browser that just started
 * is zero.
 *
 * `saves` denies every client write, so the row (and its chosen `received_at`)
 * is seeded through the service-role fixture, the same pattern the integration
 * suites use.
 */
const API_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const HOUR_MS = 60 * 60 * 1_000;
const RATE_PER_SECOND = '3600';

interface GuestSessionDiagnostic {
  readonly status: 'unconfigured' | 'sign-in-failed' | 'signed-in';
  readonly user?: { readonly id: string };
}

async function waitForGuestSession(page: Page): Promise<GuestSessionDiagnostic> {
  await expect
    .poll(async () => JSON.parse((await page.locator('#app').getAttribute('data-guest-session')) ?? '{}').status)
    .toBe('signed-in');
  return JSON.parse((await page.locator('#app').getAttribute('data-guest-session')) ?? '{}') as GuestSessionDiagnostic;
}

/**
 * `NaN` — not `0` — while a navigation is in flight: this value is asserted
 * from both sides (at least the grant, and under the grant plus one), and
 * `Number(null)` would have *satisfied* the upper bound, turning a mid-reload
 * read into a false pass instead of a retry.
 */
async function readStoredGoldNumber(page: Page): Promise<number> {
  const gold = await tolerateNavigation(() => readStoredGold(page));
  return gold === null ? Number.NaN : Number(gold);
}

async function readStoredGold(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const openRequest = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => resolve(openRequest.result);
    });
    if (!database.objectStoreNames.contains('saves')) {
      database.close();
      return null;
    }
    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{ document?: SaveDocumentV2 }>((resolve, reject) => {
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result);
    });
    database.close();
    return record?.document?.state.gold ?? null;
  });
}

test('credits the server offlineGrant, not the client clock projection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');

  const guest = await waitForGuestSession(page);
  expect(guest.user?.id).toBeTruthy();

  // This account is brand new and holds no local save, so the boot adoption
  // uploads nothing and the 30 s heartbeat is far off — the seed below cannot
  // race the app's own writes.

  // Seed a valid save whose only notable property is a custom production rate,
  // with a ten-hour-old server receipt and a matching ten-hour-old `savedAt`.
  // Ten hours exceeds the two-hour cap, so the credited duration is exactly the
  // cap regardless of request timing: 3600/s × 7,200 s × 0.5 = 12,960,000. The
  // matching `savedAt` keeps the client projection equal to the server grant,
  // so `chooseOfflineReward`'s `min` picks the server figure.
  const now = Date.now();
  const savedAt = now - 10 * HOUR_MS;
  const base = createInitialGameState(BASE_GAME_BALANCE, savedAt);
  // A strongly progressed remote so it strictly dominates whatever the fresh
  // local game has produced: the reconcile then adopts it (and its ten-hour-old
  // `savedAt`) rather than deferring a fork, which is what makes the client
  // projection and the server grant comparable.
  const big = GameNumber.from(1_000_000);
  const progressed = {
    ...base,
    elevator: {
      ...base.elevator,
      level: 10,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.elevator.baseCapacity,
        10,
        BASE_GAME_BALANCE.elevator.upgrade,
      ),
    },
    warehouse: {
      ...base.warehouse,
      level: 10,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.warehouse.baseCapacity,
        10,
        BASE_GAME_BALANCE.warehouse.upgrade,
      ),
      totalGoldDelivered: big,
    },
    floors: base.floors.map((floor) => ({
      ...floor,
      isUnlocked: true,
      mineShaftLevel: 10,
      totalExtracted: big,
      totalTransported: big,
    })),
  };
  const document = {
    ...createSaveDocument(progressed, BASE_GAME_BALANCE, savedAt),
    effectiveProductionRatePerSecond: RATE_PER_SECOND,
  };
  const admin = createServiceRoleClient(API_URL);
  await admin.from('saves').delete().eq('user_id', guest.user!.id);
  const { error } = await admin.from('saves').insert({
    user_id: guest.user!.id,
    revision: 1,
    schema_version: 2,
    document_json: JSON.stringify(document),
    received_at: new Date(now - 10 * HOUR_MS).toISOString(),
  });
  expect(error).toBeNull();

  await page.reload();
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');

  const expectedReward = formatAmount(
    GameNumber.deserialize(RATE_PER_SECOND).multiply(7_200).multiply(0.5),
  );

  const modal = page.getByTestId('offline-reward-modal');
  await expect
    .poll(async () => page.locator('#app').getAttribute('data-cloud-save-reconcile'), { timeout: 20_000 })
    .not.toBeNull();
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('offline-reward-time')).toHaveText('2h credited');
  await expect(page.getByTestId('offline-reward-amount')).toHaveText(`${expectedReward} gold`);

  await page.getByTestId('offline-reward-claim').click();
  await expect(modal).toHaveCount(0);

  // The credited gold is the server's grant on top of the fresh starting
  // balance. `GameNumber` keeps the exact value as a float, so allow the
  // sub-unit representation tail rather than requiring a byte-exact string.
  const expectedGold = BASE_GAME_BALANCE.startingGold + 12_960_000;
  await expect
    .poll(() => readStoredGoldNumber(page), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(expectedGold);
  await expect
    .poll(() => readStoredGoldNumber(page))
    .toBeLessThan(expectedGold + 1);
});

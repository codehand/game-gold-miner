import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { readCloudSave } from './cloudSaveFixture';

/**
 * Server-milestone Step 20: adopt existing local saves, proven end to end
 * against the live local stack.
 *
 * This is the client half the integration suite cannot cover: a real browser
 * starts with a pre-milestone version-1 `SaveDocument` already in IndexedDB,
 * boots the server build, receives a real anonymous session, and — with no
 * cloud save on the account — must have that local document adopted as the
 * cloud save rather than replaced by a fresh one. It then forces the same
 * lifecycle flush a hidden tab would and asserts the cloud copy is
 * **byte-for-byte** the local document.
 *
 * Assumes the local stack is up (`npm run supabase:start` /
 * `supabase db reset`), exactly like `guest-session.spec.ts` and the
 * integration suites.
 */
const API_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;

interface GuestSessionDiagnostic {
  readonly status: 'unconfigured' | 'sign-in-failed' | 'signed-in';
  readonly user?: { readonly id: string; readonly isAnonymous: boolean };
}

/** A pre-milestone version-1 save with real progress, missing only the Step 18 counter. */
function preMilestoneVersionOneDocument(): Record<string, unknown> {
  const base = createInitialGameState(BASE_GAME_BALANCE, Date.now() - 60_000);
  const elevatorLevel = base.elevator.level + 3;
  const state: GameState = {
    ...base,
    gold: GameNumber.from(500),
    elevator: {
      ...base.elevator,
      level: elevatorLevel,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.elevator.baseCapacity,
        elevatorLevel,
        BASE_GAME_BALANCE.elevator.upgrade,
      ),
    },
  };
  const current = createSaveDocument(state, BASE_GAME_BALANCE, Date.now() - 60_000);
  const warehouse = Object.fromEntries(
    Object.entries(current.state.warehouse).filter(
      ([key]) => key !== 'totalOfflineGoldClaimed',
    ),
  );

  return {
    ...current,
    schemaVersion: 1,
    state: { ...current.state, warehouse },
  };
}

/** Seeds the fixed active-save record before any application script runs. */
async function seedVersionOneIndexedDb(page: Page, document: Record<string, unknown>): Promise<void> {
  await page.addInitScript((seeded) => {
    return new Promise<void>((resolve, reject) => {
      const openRequest = indexedDB.open('cat-mine-idle', 1);
      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;
        if (!database.objectStoreNames.contains('saves')) {
          database.createObjectStore('saves', { keyPath: 'id' });
        }
      };
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction('saves', 'readwrite');
        transaction.objectStore('saves').put({ id: 'active', document: seeded });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, document);
}

async function waitForGuestSessionStatus(page: Page): Promise<GuestSessionDiagnostic> {
  await expect
    .poll(async () => JSON.parse((await page.locator('#app').getAttribute('data-guest-session')) ?? '{}').status)
    .toBe('signed-in');
  return JSON.parse((await page.locator('#app').getAttribute('data-guest-session')) ?? '{}') as GuestSessionDiagnostic;
}

async function readAccessTokenFromStorage(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) {
        continue;
      }
      const parsed: { access_token?: string } = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (parsed.access_token) {
        return parsed.access_token;
      }
    }
    return null;
  });

  expect(token).toBeTruthy();
  return token!;
}

async function readStoredDocument(page: Page): Promise<SaveDocumentV2 | null> {
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

    return record?.document ?? null;
  });
}

async function forceHiddenFlush(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test('adopts a pre-milestone version-1 local save on first sign-in, byte-for-byte', async ({ page }) => {
  const preMilestone = preMilestoneVersionOneDocument();
  const seededState = (preMilestone as { state: { elevator: { level: number }; gold: string } }).state;

  await seedVersionOneIndexedDb(page, preMilestone);
  await page.goto('/');

  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await waitForGuestSessionStatus(page);

  // The account had no cloud save, so the boot reconcile adopts the local one.
  const accessToken = await readAccessTokenFromStorage(page);
  await expect
    .poll(async () => (await readCloudSave(SAVE_URL, accessToken))?.document.schemaVersion ?? null, {
      message: 'the local save is adopted as the account cloud save',
      timeout: 20_000,
    })
    .toBe(2);

  const adopted = await readCloudSave(SAVE_URL, accessToken);
  expect(adopted).not.toBeNull();
  // The pre-milestone progress survived — this is the player's save, not a fresh game.
  expect(adopted!.document.state.elevator.level).toBe(seededState.elevator.level);
  expect(adopted!.document.state.warehouse.totalOfflineGoldClaimed).toBe('0');
  expect(adopted!.document.state.floors).toHaveLength(BASE_GAME_BALANCE.floors.length);

  // Force the lifecycle flush a hidden tab performs. It writes exactly one
  // document locally and forces that same document to the cloud, bypassing
  // §9's 60 s minimum interval. Capture that flushed document once and require
  // the cloud to reach *it*: comparing against a constant, rather than a fresh
  // local read, cannot race a later 30 s heartbeat write, which would
  // otherwise leave a moving local document chasing a cadence-limited cloud
  // copy until the poll times out.
  const flushNotBeforeMs = await page.evaluate(() => Date.now());
  await forceHiddenFlush(page);

  let flushedLocal: SaveDocumentV2 | null = null;
  await expect
    .poll(async () => {
      const local = await readStoredDocument(page);

      if (local === null || local.savedAtTimestampMs < flushNotBeforeMs) {
        return false;
      }

      flushedLocal = local;
      return true;
    }, {
      message: 'the forced lifecycle flush reaches IndexedDB',
      timeout: 10_000,
    })
    .toBe(true);

  expect(flushedLocal).not.toBeNull();

  await expect
    .poll(async () => {
      const cloud = await readCloudSave(SAVE_URL, accessToken);
      return cloud !== null && JSON.stringify(cloud.document) === JSON.stringify(flushedLocal);
    }, {
      message: 'the downloaded document is byte-for-byte the adopted local save',
      timeout: 20_000,
    })
    .toBe(true);
});

import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LIFECYCLE_SAVE_JOURNAL_KEY } from '../../src/platform/web';

/**
 * Server-milestone Step 21: survive local storage eviction.
 *
 * Proves the two client-side halves of Step 21's test against the live stack:
 *
 * 1. With the local save gone but the session still present, a signed-in player
 *    is restored from the cloud rather than reset.
 * 2. An unlinked guest whose account has no cloud copy is told their local save
 *    is gone instead of silently receiving a fresh game.
 *
 * The third half — the real iOS Safari seven-day behaviour — cannot be measured
 * from this suite; `memory-bank/techContext.md` records that measurement with
 * its status and date.
 *
 * Assumes the local stack is up (`npm run supabase:start` / `supabase db reset`).
 */
const API_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;

interface GuestSessionDiagnostic {
  readonly status: 'unconfigured' | 'sign-in-failed' | 'signed-in';
  readonly isNewSession?: boolean;
}

interface CloudSaveBody {
  readonly revision: number;
  readonly document: SaveDocumentV2;
}

/** A pre-milestone version-1 save with distinctive progress (elevator level 4). */
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

  return { ...current, schemaVersion: 1, state: { ...current.state, warehouse } };
}

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

/**
 * On the next navigation, deletes the local save — IndexedDB *and* the
 * synchronous lifecycle journal, both script-writable storage — before the app
 * module runs, while leaving the Supabase session in localStorage intact. That
 * is the partial-eviction state Step 21 handles: the credential survived, the
 * save did not. One-shot: the follow-up reload the reconcile triggers loads the
 * real module.
 */
async function clearLocalSaveOnceOnNextLoad(page: Page): Promise<void> {
  let pending = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!pending) {
      await route.continue();
      return;
    }

    pending = false;
    await route.fulfill({
      body: `
        localStorage.removeItem(${JSON.stringify(LIFECYCLE_SAVE_JOURNAL_KEY)});
        await new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('cat-mine-idle');
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        });
        await import('/src/main.ts?step-21-eviction');
      `,
      contentType: 'application/javascript',
    });
  });
}

/**
 * On the next navigation, writes an unreadable save (a version-1 document with
 * none of the required fields) before the app module runs, leaving the session
 * intact. Proves a corrupt-but-present save is never reported as "missing".
 */
async function seedCorruptSaveOnceOnNextLoad(page: Page): Promise<void> {
  let pending = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!pending) {
      await route.continue();
      return;
    }

    pending = false;
    await route.fulfill({
      body: `
        localStorage.removeItem(${JSON.stringify(LIFECYCLE_SAVE_JOURNAL_KEY)});
        await new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('cat-mine-idle');
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        });
        await new Promise((resolve, reject) => {
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
            transaction.objectStore('saves').put({ id: 'active', document: { schemaVersion: 1 } });
            transaction.oncomplete = () => { database.close(); resolve(); };
            transaction.onerror = () => reject(transaction.error);
          };
        });
        await import('/src/main.ts?step-21-corrupt');
      `,
      contentType: 'application/javascript',
    });
  });
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

async function getCloudSave(accessToken: string): Promise<CloudSaveBody | null> {
  const response = await fetch(SAVE_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  return response.status === 200 ? response.json() : null;
}

async function readStoredLevel(page: Page): Promise<number | null> {
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

    return record?.document?.state.elevator.level ?? null;
  });
}

test('restores a signed-in player from the cloud after the local save is evicted', async ({ page }) => {
  await seedVersionOneIndexedDb(page, preMilestoneVersionOneDocument());
  await page.goto('/');

  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await waitForGuestSessionStatus(page);

  const accessToken = await readAccessTokenFromStorage(page);
  await expect
    .poll(async () => (await getCloudSave(accessToken))?.document.schemaVersion ?? null, {
      message: 'the seeded save is adopted as the account cloud save',
      timeout: 20_000,
    })
    .toBe(2);

  const adopted = await getCloudSave(accessToken);
  const restoredLevel = adopted!.document.state.elevator.level;
  expect(restoredLevel).toBeGreaterThan(1);

  // Evict only the local save, keep the session, and reload.
  await clearLocalSaveOnceOnNextLoad(page);
  await page.reload();

  await expect
    .poll(() => readStoredLevel(page), {
      message: 'the cloud save is restored rather than a fresh game',
      timeout: 20_000,
    })
    .toBe(restoredLevel);
});

test('tells an unlinked guest with no cloud copy that the local save is gone', async ({ page }) => {
  // A self-contained save-sync surface: every download reports "no cloud copy"
  // and every upload is accepted. Stubbing the upload too matters — with a real
  // server, the forced upload on `no-cloud-save` would 409 against the row a
  // prior real boot created, and the §7 adopt would reload the page out from
  // under the banner this test polls for.
  await page.route('**/functions/v1/save-sync/v1/save', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ revision: 1, receivedAt: new Date().toISOString() }),
    });
  });

  await page.goto('/');
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await waitForGuestSessionStatus(page);

  // Evict the local save, keep the session, and reload. The first boot minted
  // the session; this one reuses it, which is what makes the state decidable.
  await clearLocalSaveOnceOnNextLoad(page);
  await page.reload();

  const diagnostic = await waitForGuestSessionStatus(page);
  expect(diagnostic.isNewSession).toBe(false);

  await expect(page.getByTestId('save-diagnostic')).toHaveAttribute('data-code', 'local-save-missing');
  await expect(page.getByTestId('save-diagnostic-message')).toContainText('no cloud save');
});

test('keeps the accurate corrupt-save warning instead of a false "not found"', async ({ page }) => {
  await page.route('**/functions/v1/save-sync/v1/save', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ revision: 1, receivedAt: new Date().toISOString() }),
    });
  });

  await page.goto('/');
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await waitForGuestSessionStatus(page);

  // Replace the local save with an unreadable one, keep the session, reload.
  await seedCorruptSaveOnceOnNextLoad(page);
  await page.reload();

  const diagnostic = await waitForGuestSessionStatus(page);
  expect(diagnostic.isNewSession).toBe(false);

  // Wait until both the local load and the reconcile have finished deciding,
  // then assert the accurate warning survived and the false notice never fired.
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect
    .poll(async () => page.locator('#app').getAttribute('data-cloud-save-reconcile'))
    .not.toBeNull();

  await expect(page.getByTestId('save-diagnostic')).toHaveAttribute('data-code', 'corrupt-save');
  await expect(page.locator('#app')).not.toHaveAttribute('data-local-save-notice', /.+/);
});

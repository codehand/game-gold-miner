import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';

/**
 * Server-milestone Step 24: rejection handling, the player-facing half.
 *
 * A save the server refuses must not cost an honest player their game. This
 * drives the real client against a save-sync surface that returns Step 23's
 * `422 save_rejected` on every upload and proves the three things the step's
 * test names: the session stays playable (production continues), the local save
 * is intact (not overwritten or dropped), and the player sees one comprehensible
 * notice. The audit-row half is proven against the live stack by
 * `tests/server-integration/save-audit.integration.test.ts`.
 *
 * A local save is seeded first so the boot reconcile adopts it and forces an
 * upload (`no-cloud-save`); a fresh boot with nothing local has nothing to send.
 *
 * Assumes the local stack is up (`npm run supabase:start` / `supabase db reset`).
 */
const SAVE_URL_PATTERN = '**/functions/v1/save-sync/v1/save';

/** A valid current-schema local save, so the boot reconcile has something to adopt. */
function localDocument(): SaveDocumentV2 {
  const savedAt = Date.now() - 60_000;
  return createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, savedAt),
    BASE_GAME_BALANCE,
    savedAt,
  );
}

/** Seeds the fixed active-save record before any application script runs. */
async function seedIndexedDb(page: Page, document: SaveDocumentV2): Promise<void> {
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

async function waitForSignedIn(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        JSON.parse((await page.locator('#app').getAttribute('data-guest-session')) ?? '{}').status,
    )
    .toBe('signed-in');
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

async function readGoldLabel(page: Page): Promise<string | null> {
  const serialized = await page.locator('#app canvas').getAttribute('data-hud-view');
  if (serialized === null) {
    return null;
  }
  return (JSON.parse(serialized) as { goldValueLabel?: string }).goldValueLabel ?? null;
}

test('a rejected upload keeps the save, keeps playing, and shows one notice', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // A self-contained save-sync surface: the account has no cloud copy, and
  // every upload is refused exactly as Step 23's bound refuses an inflated
  // document. The forced upload that adopts the seeded local save is what
  // reaches this route.
  await page.route(SAVE_URL_PATTERN, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'save_rejected',
          message: 'Claimed progress exceeds what the elapsed time allows.',
          detail: { counter: 'state.warehouse.totalGoldDelivered', claimed: '1', maximum: '0' },
        },
      }),
    });
  });

  await seedIndexedDb(page, localDocument());
  await page.goto('/');
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
  await waitForSignedIn(page);

  // One comprehensible notice reaches the player, with the §4 copy for a
  // rejected document rather than a raw code.
  await expect(page.getByTestId('save-diagnostic')).toHaveAttribute(
    'data-code',
    'cloud-sync-save-rejected',
  );
  await expect(page.getByTestId('save-diagnostic-message')).toContainText('could not be verified');

  // The local save is intact: a rejected upload never touches local storage.
  await expect
    .poll(async () => (await readStoredDocument(page))?.schemaVersion ?? null)
    .toBe(2);

  // The session stays playable: the mine keeps producing gold after the refusal.
  const goldBefore = await readGoldLabel(page);
  expect(goldBefore).not.toBeNull();
  await expect
    .poll(() => readGoldLabel(page), { message: 'production continues after a rejection', timeout: 15_000 })
    .not.toBe(goldBefore);

  expect(pageErrors).toEqual([]);
});

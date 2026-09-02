import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateOfflineIncome,
  catchUpSimulation,
  claimOfflineReward,
  createInitialGameState,
  createPendingOfflineReward,
} from '../../src/core';
import {
  createSaveDocument,
  deserializeSaveDocument,
  type SaveDocumentV1,
} from '../../src/persistence';
import { LIFECYCLE_SAVE_JOURNAL_KEY } from '../../src/platform/web';

const CANVAS_SELECTOR = '#game-viewport canvas';
const START_TIMESTAMP_MS = new Date('2026-09-02T03:00:00.000Z').getTime();
const FOREGROUND_BEFORE_TRANSITION_MS = 20_000;
const AWAY_DURATION_MS = 30_000;
const FINAL_TIMESTAMP_MS =
  START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS + AWAY_DURATION_MS;

test('matches uninterrupted play across hidden and visible transitions', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  await routeControlledApplication(page, 'visibility');
  await setControlledTime(page, START_TIMESTAMP_MS);
  await page.goto('/');
  await waitForBootedScene(page);

  const initialState = createInitialGameState(
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS,
  );
  const stateAtFirstHide = catchUpSimulation(
    initialState,
    FOREGROUND_BEFORE_TRANSITION_MS,
  );
  const firstHiddenDocument = createSaveDocument(
    stateAtFirstHide,
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS,
  );

  // The clock move and event happen in one browser task, before another render
  // frame can advance the driver. This proves the lifecycle boundary itself —
  // rather than a lucky preceding frame — captures the final foreground gap.
  await dispatchVisibility(
    page,
    'hidden',
    START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS,
  );
  await expect
    .poll(() => readStoredSave(page), {
      message: 'visibility hidden flushes the exact event-boundary state',
    })
    .toEqual(firstHiddenDocument);

  await dispatchVisibility(page, 'visible', FINAL_TIMESTAMP_MS);
  await expect
    .poll(async () => {
      const canvas = page.locator(CANVAS_SELECTOR);
      return canvas.getAttribute('data-hud-view');
    }, {
      message: 'the resumed render loop advances after becoming visible',
    })
    .not.toBeNull();

  await dispatchVisibility(page, 'hidden', FINAL_TIMESTAMP_MS);

  const uninterruptedState = catchUpSimulation(
    initialState,
    FINAL_TIMESTAMP_MS - START_TIMESTAMP_MS,
  );
  const uninterruptedDocument = createSaveDocument(
    uninterruptedState,
    BASE_GAME_BALANCE,
    FINAL_TIMESTAMP_MS,
  );

  await expect
    .poll(() => readStoredSave(page), {
      message: 'hidden-tab catch-up matches uninterrupted foreground play',
    })
    .toEqual(uninterruptedDocument);
  expect(browserErrors, 'lifecycle transitions emit no browser errors').toEqual([]);
});

test('persists abrupt navigation and consumes offline time exactly once', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  await routeControlledApplication(page, 'navigation');
  await page.route('**/lifecycle-away.html', async (route) => {
    await route.fulfill({
      body: '<!doctype html><title>Away</title><p>Lifecycle test destination</p>',
      contentType: 'text/html',
    });
  });
  await setControlledTime(page, START_TIMESTAMP_MS);
  await page.goto('/');
  await waitForBootedScene(page);

  await setControlledTime(
    page,
    START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS,
  );
  await page.goto('/lifecycle-away.html');

  const initialState = createInitialGameState(
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS,
  );
  const stateAtNavigation = catchUpSimulation(
    initialState,
    FOREGROUND_BEFORE_TRANSITION_MS,
  );
  const navigationDocument = createSaveDocument(
    stateAtNavigation,
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS,
  );

  await expect
    .poll(() => readLifecycleJournal(page), {
      message: 'pagehide journals the exact state before abrupt navigation',
    })
    .toEqual(navigationDocument);

  await setControlledTime(page, FINAL_TIMESTAMP_MS);
  await page.goto('/');
  await waitForBootedScene(page);

  const loaded = deserializeSaveDocument(
    navigationDocument,
    BASE_GAME_BALANCE,
  );
  const offlineIncome = calculateOfflineIncome(
    loaded.state,
    loaded.savedAtTimestampMs,
    FINAL_TIMESTAMP_MS,
    loaded.effectiveProductionRatePerSecond,
    BASE_GAME_BALANCE.offlineIncome,
  );
  const pendingReward = createPendingOfflineReward(offlineIncome);

  if (pendingReward === null) {
    throw new Error('The lifecycle fixture must produce an offline reward.');
  }

  const settledDocument = createSaveDocument(
    offlineIncome.state,
    BASE_GAME_BALANCE,
    FINAL_TIMESTAMP_MS,
  );

  await expect(page.getByTestId('offline-reward-modal')).toBeVisible();
  await expect
    .poll(() => readStoredSave(page), {
      message: 'returning settles the away interval before exposing its reward',
    })
    .toEqual(settledDocument);
  expect(
    await readLifecycleJournal(page),
    'IndexedDB catch-up clears the recovered emergency journal',
  ).toBeNull();

  const claim = claimOfflineReward(offlineIncome.state, pendingReward);

  if (claim.status !== 'claimed') {
    throw new Error('The lifecycle fixture reward must be claimable.');
  }

  const expectedClaimDocument = createSaveDocument(
    claim.state,
    BASE_GAME_BALANCE,
    FINAL_TIMESTAMP_MS,
  );

  await page.getByTestId('offline-reward-claim').click();
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await expect
    .poll(() => readStoredSave(page), {
      message: 'claim persists the one credited away interval',
    })
    .toEqual(expectedClaimDocument);

  await page.reload();
  await waitForBootedScene(page);
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  expect(await readStoredSave(page)).toEqual(expectedClaimDocument);
  expect(browserErrors, 'navigation and reload emit no browser errors').toEqual([]);
});

async function routeControlledApplication(
  page: Page,
  runId: string,
): Promise<void> {
  let firstBoot = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (route.request().url().includes(`step-34-${runId}`)) {
      await route.continue();
      return;
    }

    const resetDatabase = firstBoot
      ? `
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase('cat-mine-idle');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      `
      : '';

    firstBoot = false;
    await route.fulfill({
      body: `
        Date.now = () => Number(window.name);
        ${resetDatabase}
        await import('/src/main.ts?step-34-${runId}');
      `,
      contentType: 'application/javascript',
    });
  });
}

async function setControlledTime(page: Page, timestampMs: number): Promise<void> {
  await page.evaluate((value) => {
    window.name = String(value);
  }, timestampMs);
}

async function dispatchVisibility(
  page: Page,
  visibilityState: 'hidden' | 'visible',
  timestampMs: number,
): Promise<void> {
  await page.evaluate(({ state, now }) => {
    window.name = String(now);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, { state: visibilityState, now: timestampMs });
}

async function waitForBootedScene(page: Page): Promise<void> {
  await expect(page.locator(CANVAS_SELECTOR))
    .toHaveAttribute('data-boot-scene', 'BootScene');
}

async function readStoredSave(page: Page): Promise<SaveDocumentV1 | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (!database.objectStoreNames.contains('saves')) {
      database.close();
      return null;
    }

    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{ document?: SaveDocumentV1 } | undefined>(
      (resolve, reject) => {
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      },
    );
    database.close();

    return record?.document ?? null;
  });
}

async function readLifecycleJournal(
  page: Page,
): Promise<SaveDocumentV1 | null> {
  return page.evaluate((key) => {
    const serialized = localStorage.getItem(key);

    return serialized === null
      ? null
      : JSON.parse(serialized) as SaveDocumentV1;
  }, LIFECYCLE_SAVE_JOURNAL_KEY);
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return errors;
}

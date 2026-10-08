import { openIntroMine } from '../helpers/openIntroMine';
import { expect, test, type Page } from '@playwright/test';

import {
  advanceActiveMine,
  createInitialPortfolio,
  enterMine,
  suspendActiveMine,
} from '../../src/core';
import {
  createPortfolioSaveDocument,
  type PortfolioSaveDocumentV4,
} from '../../src/persistence';
import { LIFECYCLE_SAVE_JOURNAL_KEY } from '../../src/platform/web';

const CANVAS_SELECTOR = '#game-viewport canvas';
const START_TIMESTAMP_MS = new Date('2026-09-02T03:00:00.000Z').getTime();
const FOREGROUND_BEFORE_TRANSITION_MS = 20_000;
const AWAY_DURATION_MS = 30_000;
const FINAL_TIMESTAMP_MS =
  START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS + AWAY_DURATION_MS;

test('treats hidden-tab time as one claimed Gold Mine offline interval', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  await routeControlledApplication(page, 'visibility');
  await setControlledTime(page, START_TIMESTAMP_MS);
  await page.goto('/');
  await openIntroMine(page);
  await waitForBootedScene(page);

  const hideAtMs = START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS;
  const beforeHide = advanceActiveMine(createInitialPortfolio(START_TIMESTAMP_MS), hideAtMs);
  const suspended = suspendActiveMine(beforeHide, hideAtMs);
  const firstHiddenDocument = createPortfolioSaveDocument(suspended, hideAtMs);

  // The clock move and event happen in one browser task, before another render
  // frame can advance the driver. This proves the lifecycle boundary itself —
  // rather than a lucky preceding frame — captures the final foreground gap.
  await dispatchVisibility(page, 'hidden', hideAtMs);
  await expect
    .poll(() => readStoredSave(page), {
      message: 'visibility hidden flushes the exact event-boundary state',
    })
    .toEqual(firstHiddenDocument);

  await dispatchVisibility(page, 'visible', FINAL_TIMESTAMP_MS);
  const claim = enterMine(suspended, 'gold', FINAL_TIMESTAMP_MS);
  if (claim.status !== 'entered' || !claim.grant.reward.greaterThan(0)) {
    throw new Error('The hidden Gold interval must have a claimable reward.');
  }
  await expect(page.getByTestId('offline-reward-modal')).toBeVisible();
  expect((await readStoredSave(page))?.walletGold)
    .toBe(firstHiddenDocument.walletGold);
  await page.getByTestId('offline-reward-claim').click();
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await expect
    .poll(() => readStoredSave(page), {
      message: 'the hidden interval pays the shared wallet exactly once',
    })
    .toEqual(createPortfolioSaveDocument(claim.portfolio, FINAL_TIMESTAMP_MS));
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
  await openIntroMine(page);
  await waitForBootedScene(page);

  await setControlledTime(
    page,
    START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS,
  );
  await page.goto('/lifecycle-away.html');

  const hideAtMs = START_TIMESTAMP_MS + FOREGROUND_BEFORE_TRANSITION_MS;
  const beforeNavigation = advanceActiveMine(createInitialPortfolio(START_TIMESTAMP_MS), hideAtMs);
  const suspended = suspendActiveMine(beforeNavigation, hideAtMs);
  const navigationDocument = createPortfolioSaveDocument(suspended, hideAtMs);

  await expect
    .poll(() => readLifecycleJournal(page), {
      message: 'pagehide journals the exact state before abrupt navigation',
    })
    .toEqual(navigationDocument);

  await setControlledTime(page, FINAL_TIMESTAMP_MS);
  await page.goto('/');
  await openIntroMine(page);
  const claim = enterMine(suspended, 'gold', FINAL_TIMESTAMP_MS);
  if (claim.status !== 'entered' || !claim.grant.reward.greaterThan(0)) {
    throw new Error('The lifecycle fixture must produce an offline reward.');
  }
  await expect(page.getByTestId('offline-reward-modal')).toBeVisible();
  expect(await readStoredSave(page), 'an abrupt exit may leave only the journal')
    .toBeNull();
  expect(await readLifecycleJournal(page), 'the journal retains the pending interval')
    .toEqual(navigationDocument);

  const expectedClaimDocument = createPortfolioSaveDocument(claim.portfolio, FINAL_TIMESTAMP_MS);

  await page.getByTestId('offline-reward-claim').click();
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await waitForBootedScene(page);
  await expect
    .poll(() => readStoredSave(page), {
      message: 'claim persists the one credited away interval',
    })
    .toEqual(expectedClaimDocument);
  expect(await readLifecycleJournal(page), 'the committed claim clears the journal')
    .toBeNull();

  await page.reload();
  await openIntroMine(page);
  await waitForBootedScene(page);
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  const afterReload = await readStoredSave(page);
  expect(afterReload?.walletGold).toBe(expectedClaimDocument.walletGold);
  expect(afterReload?.mines.gold?.state.warehouse.totalOfflineGoldClaimed)
    .toBe(expectedClaimDocument.mines.gold!.state.warehouse.totalOfflineGoldClaimed);
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

async function readStoredSave(page: Page): Promise<PortfolioSaveDocumentV4 | null> {
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
    const record = await new Promise<{ document?: PortfolioSaveDocumentV4 } | undefined>(
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
): Promise<PortfolioSaveDocumentV4 | null> {
  return page.evaluate((key) => {
    const serialized = localStorage.getItem(key);

    return serialized === null
      ? null
      : JSON.parse(serialized) as PortfolioSaveDocumentV4;
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

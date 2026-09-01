import { expect, test, type Page } from '@playwright/test';

test('boots one Phaser canvas and scene across a reload', async ({ page }) => {
  const browserErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Cat Mine Idle');
  await assertSingleBoot(page);
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await expect.poll(async () => {
    return page.evaluate(async () => {
      await document.fonts.ready;

      return {
        bold: document.fonts.check('700 16px Fredoka'),
        family: getComputedStyle(document.body).fontFamily,
        semibold: document.fonts.check('600 16px Fredoka'),
      };
    });
  }).toEqual({
    bold: true,
    family: 'Fredoka, sans-serif',
    semibold: true,
  });

  await page.reload();
  await assertSingleBoot(page);

  expect(browserErrors).toEqual([]);
});

test('presents, claims, persists, and cannot duplicate offline rewards', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  let shouldSeed = true;
  const fixedTime = new Date('2026-08-28T10:00:00.000Z');

  await page.clock.install({ time: fixedTime });
  await page.clock.setFixedTime(fixedTime);

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });
  await page.route('**/src/main.ts*', async (route) => {
    if (!shouldSeed) {
      await route.continue();
      return;
    }

    shouldSeed = false;
    await route.fulfill({
      body: createSeededMainModule(),
      contentType: 'application/javascript',
    });
  });

  await page.goto('/');

  const modal = page.getByTestId('offline-reward-modal');
  await expect(modal).toBeVisible();
  await expect(page.getByTestId('offline-reward-time')).toHaveText('2h credited');
  await expect(page.getByTestId('offline-reward-amount')).toHaveText(
    '18k gold',
  );

  await page.getByTestId('offline-reward-claim').click();
  await expect(modal).toHaveCount(0);
  await expect.poll(() => readStoredGold(page)).toBe('18100');

  await page.reload();
  await assertSingleBoot(page);
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await expect.poll(() => readStoredGold(page)).toBe('18100');
  expect(browserErrors).toEqual([]);
});

async function assertSingleBoot(page: Page) {
  const canvas = page.locator('#app canvas');

  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '360');
  await expect(canvas).toHaveAttribute('height', '640');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect(canvas).toHaveAttribute('data-boot-scene-starts', '1');
  await expect(canvas).toHaveAttribute('data-renderer', /^(canvas|webgl)$/);
}

function createSeededMainModule(): string {
  const document = {
    schemaVersion: 1,
    savedAtTimestampMs: 0,
    effectiveProductionRatePerSecond: '5',
    state: {
      saveVersion: 1,
      lastUpdateTimestampMs: 0,
      simulationTick: 0,
      simulationRemainderMs: 0,
      gold: '100',
      floors: [
        createFloor('floor-1', 1, true),
        createFloor('floor-2', 2, false),
        createFloor('floor-3', 3, false),
        createFloor('floor-4', 4, false),
      ],
      elevator: {
        level: 1,
        capacity: '50',
        roundRobinCursor: 0,
        transitProgress: 0,
        carriedMaterial: '0',
      },
      warehouse: {
        level: 1,
        capacity: '60',
        inputQueue: '0',
        conversionProgress: 0,
        totalGoldDelivered: '0',
      },
    },
  };

  return `
    const request = indexedDB.open('cat-mine-idle');
    await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('saves', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('saves', 'readwrite');
        transaction.objectStore('saves').put({
          id: 'active',
          document: ${JSON.stringify(document)},
        });
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
    await import('/src/main.ts?offline-reward-seeded');
  `;
}

function createFloor(id: string, floorNumber: number, isUnlocked: boolean) {
  return {
    id,
    floorNumber,
    isUnlocked,
    mineShaftLevel: 1,
    extractionProgress: 0,
    materialQueue: '0',
    totalExtracted: '0',
    totalTransported: '0',
  };
}

async function readStoredGold(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{ document?: { state?: { gold?: string } } }>(
      (resolve, reject) => {
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      },
    );
    database.close();

    return record?.document?.state?.gold ?? null;
  });
}

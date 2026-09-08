import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateMineProductionRates,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';
// The view's own read-back type, imported rather than restated, so a renamed
// diagnostic field fails type-check instead of silently reading `undefined`.
import type { RenderedHudState } from '../../src/game/entities';
import { PLACEHOLDER_TEXTURES } from '../../src/game/assets/placeholderAssets';
import { formatAmount } from '../../src/game/view-model';
import { createSaveDocument } from '../../src/persistence';

const CANVAS_SELECTOR = '#game-viewport canvas';

const FIXED_TIME = new Date('2026-08-28T10:00:00.000Z');
const FIXTURE_TIMESTAMP_MS = FIXED_TIME.getTime();

/**
 * A balance well past `Number.MAX_SAFE_INTEGER` paired with four running
 * shafts, so both HUD values exercise the abbreviated formatter rather than
 * ordinary numerals.
 */
function createLargeBalanceState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    gold: GameNumber.from('1.46e16'),
    warehouse: {
      ...base.warehouse,
      inputQueue: GameNumber.from(42.12),
    },
    floors: base.floors.map((floor, index) => {
      return {
        ...floor,
        isUnlocked: index < 4,
        // Satisfies the configured 5 / 5 / 7 sequential unlock gates.
        mineShaftLevel: [6, 6, 8, 1][index] ?? floor.mineShaftLevel,
      };
    }),
  };
}

/**
 * One conversion cycle away from delivering gold: the warehouse holds a full
 * load of input at 90% progress, so the first 120 ms of credited simulation
 * completes a cycle and moves the HUD.
 */
function createWarehouseAboutToDeliverState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    warehouse: {
      ...base.warehouse,
      inputQueue: GameNumber.from(150),
      conversionProgress: 0.9,
    },
  };
}

test('shows abbreviated gold and the mine income estimate', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const fixture = createLargeBalanceState();

  await bootPausedFixture(page, fixture);

  const hud = await readRenderedHud(page);
  const rates = calculateMineProductionRates(fixture, BASE_GAME_BALANCE);

  expect(hud.goldLabel, 'gold icon replaces its caption').toBe('');
  expect(hud.incomeLabel, 'income icon replaces its caption').toBe('');
  // 1.46e16 gold: past every named tier, so it must reach the alphabetic run
  // rather than fall back to a serialized exponent.
  expect(hud.goldValueLabel, 'abbreviated gold').toBe('14.60qa');
  expect(hud.goldValueLabel).toBe(formatAmount(fixture.gold));
  expect(hud.warehouseQueueIconTexture, 'warehouse queue icon').toBe(
    PLACEHOLDER_TEXTURES.warehouse,
  );
  expect(hud.warehouseQueueValueLabel, 'warehouse input queue').toBe('42.12');
  // Derived through the same core calculation the HUD uses, so a balance
  // change cannot silently invalidate the expectation.
  expect(hud.incomeValueLabel, 'income estimate').toBe(
    formatAmount(rates.effectiveProductionPerSecond),
  );
  expect(errors).toEqual([]);
});

/**
 * The decisive check for Step 28: the HUD must report the authoritative
 * balance, not a number the renderer accumulated on its own.
 *
 * Gold changes only when the warehouse completes a cycle, so the fixture is
 * placed just before one, the clock is run well past it, and the displayed
 * label is compared against the core's own gold at the same instant.
 */
test('matches authoritative gold after a warehouse cycle completes', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const fixture = createWarehouseAboutToDeliverState();

  const before = await bootDriverFixture(page, fixture);

  expect(before.gold, 'starting balance').toBe(fixture.gold.serialize());
  expect(before.totalGoldDelivered, 'nothing delivered yet').toBe('0');

  const hudBefore = await readRenderedHud(page);

  expect(hudBefore.goldValueLabel, 'HUD before the cycle').toBe(
    formatAmount(fixture.gold),
  );

  // Comfortably past the 120 ms remaining on the current conversion and the
  // 1,200 ms cycle after it, and far enough past the last delivery that the
  // HUD's 100 ms diagnostic cadence cannot straddle it.
  await page.clock.runFor(2_000);

  const after = await readCoreState(page);

  expect(
    GameNumber.deserialize(after.totalGoldDelivered).greaterThan(0),
    'the warehouse must have delivered',
  ).toBe(true);
  expect(
    GameNumber.deserialize(after.gold).greaterThan(
      GameNumber.deserialize(before.gold),
    ),
    'gold must have risen',
  ).toBe(true);

  const hudAfter = await readRenderedHud(page);

  expect(hudAfter.goldValueLabel, 'HUD after the cycle').toBe(
    formatAmount(GameNumber.deserialize(after.gold)),
  );
  expect(hudAfter.goldValueLabel).not.toBe(hudBefore.goldValueLabel);
  // Roughly a hundred and twenty frames later the screen holds exactly the
  // objects it booted with: the changed value came from rebinding text, not
  // from rebuilding it.
  expect(after.displayObjectCount, 'display objects after the run').toBe(
    before.displayObjectCount,
  );
  expect(before.displayObjectCount, 'the scene must hold objects').toBeGreaterThan(
    0,
  );
  expect(errors).toEqual([]);
});

interface CoreStateReadBack {
  readonly gold: string;
  readonly totalGoldDelivered: string;
  /**
   * Every game object the scene currently holds. A HUD that rebuilt its text
   * objects to show a new value would grow this, or churn it, once per frame.
   */
  readonly displayObjectCount: number;
}

/**
 * Boots the real driver and scene on a paused clock, exposing a read-only view
 * of authoritative state. Nothing here advances the core: the reader must see
 * exactly what the last rendered frame was bound to.
 */
async function bootDriverFixture(
  page: Page,
  state: GameState,
): Promise<CoreStateReadBack> {
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(FIXED_TIME);
  await routeMainModule(
    page,
    `
      import { createGame, MineSimulationDriver } from '/src/game/index.ts';
      import { deserializeSaveDocument } from '/src/persistence/index.ts';
      import { BASE_GAME_BALANCE } from '/src/config/index.ts';

      const loaded = deserializeSaveDocument(
        ${JSON.stringify(
          createSaveDocument(state, BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS),
        )},
        BASE_GAME_BALANCE,
      );
      const driver = new MineSimulationDriver({
        state: loaded.state,
        balance: BASE_GAME_BALANCE,
        now: () => Date.now(),
      });

      const game = createGame(document.querySelector('#game-viewport'), driver);
      const countObjects = (objects) => {
        return objects.reduce((total, object) => {
          return total + 1 + (object.list ? countObjects(object.list) : 0);
        }, 0);
      };

      window.catMineIdleCore = () => ({
        gold: driver.state.gold.serialize(),
        totalGoldDelivered: driver.state.warehouse.totalGoldDelivered.serialize(),
        displayObjectCount: countObjects(
          game.scene.getScene('BootScene').children.list,
        ),
      });
    `,
  );

  await page.goto('/');
  await waitForBootedScene(page);

  return readCoreState(page);
}

/** Seeds one valid version-1 save and boots the real application against it. */
async function bootPausedFixture(page: Page, state: GameState): Promise<void> {
  const saveDocument = createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    FIXTURE_TIMESTAMP_MS,
  );

  await page.clock.install({ time: FIXED_TIME });
  await page.clock.setFixedTime(FIXED_TIME);
  await routeMainModule(
    page,
    `
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
            document: ${JSON.stringify(saveDocument)},
          });
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      });
      await import('/src/main.ts?hud-seeded');
    `,
  );

  await page.goto('/');
  await waitForBootedScene(page);
  // A pinned clock leaves no offline interval, so the mine is not covered.
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
}

/**
 * The HUD read-back reports what the view objects hold, not what the canvas
 * presented, so this waits on the scene rather than on a painted frame.
 */
async function waitForBootedScene(page: Page): Promise<void> {
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-boot-scene',
    'BootScene',
  );
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-hud-view',
    /"goldValueLabel":/,
  );
}

async function readCoreState(page: Page): Promise<CoreStateReadBack> {
  return page.evaluate(() => {
    return (
      window as unknown as { catMineIdleCore(): CoreStateReadBack }
    ).catMineIdleCore();
  });
}

/** Replaces the application entry once, then lets later imports through. */
async function routeMainModule(page: Page, body: string): Promise<void> {
  let pending = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!pending) {
      await route.continue();
      return;
    }

    pending = false;
    await route.fulfill({ body, contentType: 'application/javascript' });
  });
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

async function readRenderedHud(page: Page): Promise<RenderedHudState> {
  const serialized = await page
    .locator(CANVAS_SELECTOR)
    .getAttribute('data-hud-view');

  if (serialized === null) {
    throw new Error('Diagnostic "data-hud-view" was not published.');
  }

  return JSON.parse(serialized) as RenderedHudState;
}

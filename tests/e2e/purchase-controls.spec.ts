import { expect, test, type Locator, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateElevatorUpgradeCost,
  calculateMaxAffordableMineShaftUpgradeQuantity,
  calculateMineShaftUpgradeBatchCost,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  calculateWarehouseUpgradeBatchCost,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';
// The scene's own diagnostic type, imported rather than restated, so a renamed
// field fails type-check instead of silently reading `undefined`.
import type { PublishedPurchaseControl } from '../../src/game/scenes/BootScene';
import {
  calculateMineLayout,
  SURFACE_ELEVATOR_LEVEL_CONTROL,
  SURFACE_WAREHOUSE_LEVEL_CONTROL,
} from '../../src/game/layout';
import { createSaveDocument } from '../../src/persistence';

const CANVAS_SELECTOR = '#game-viewport canvas';

/**
 * `Date.now` is pinned while the timers keep running, so the scene renders and
 * processes input normally but the simulation credits no elapsed time. Every
 * difference these tests observe is therefore caused by a press.
 */
const FIXED_TIME = new Date('2026-08-28T10:00:00.000Z');
const FIXTURE_TIMESTAMP_MS = FIXED_TIME.getTime();

/** Frames to let pass while nothing changes, enough to catch a per-frame repaint. */
const IDLE_FRAME_SAMPLE = 20;

const FLOOR_1_KEY = 'mine-shaft:floor-1';
const ELEVATOR_KEY = 'elevator';
const WAREHOUSE_KEY = 'warehouse';

interface RenderStatsReadBack {
  /** Text canvases repainted since the counter was installed. */
  readonly rasterizations: number;
  readonly frames: number;
}

interface CoreStateReadBack {
  readonly gold: string;
  readonly mineShaftLevels: readonly number[];
  readonly elevatorLevel: number;
  readonly warehouseLevel: number;
  readonly displayObjectCount: number;
}

function createFixtureState(gold: GameNumber): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    gold,
    // Floor 2 is opened so a second shaft control exists: a press must reach
    // the control it was aimed at rather than whichever one was bound first.
    // Floor 1 sits at the level the save schema requires before floor 2 may be
    // unlocked, which also makes the two shafts differ in price.
    floors: base.floors.map((floor, index) => {
      if (index === 0) {
        return {
          ...floor,
          mineShaftLevel: BASE_GAME_BALANCE.floors[1].unlockRequirement?.level ?? 1,
        };
      }

      return index === 1 ? { ...floor, isUnlocked: true } : floor;
    }),
  };
}

/** The price the core would charge for each stage's next level. */
function nextCosts(state: GameState) {
  return {
    floor1: calculateMineShaftUpgradeCost(
      state.floors[0],
      BASE_GAME_BALANCE.floors[0],
    ),
    elevator: calculateElevatorUpgradeCost(
      state.elevator,
      BASE_GAME_BALANCE.elevator,
    ),
    warehouse: calculateWarehouseUpgradeCost(
      state.warehouse,
      BASE_GAME_BALANCE.warehouse,
    ),
  };
}

test('opens floor details and disables unaffordable upgrade choices', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const fixture = createFixtureState(GameNumber.from(1));

  const before = await bootDriverFixture(page, fixture);
  const control = await readPurchaseControl(page, FLOOR_1_KEY);

  expect(control.actionLabel, 'the floor control identifies its value').toBe('Level');
  expect(control.costLabel, 'the floor control shows the current level').toBe('5');
  expect(control.isEnabledAppearance, 'one gold cannot buy a level').toBe(
    false,
  );

  await pressPurchaseControl(page, FLOOR_1_KEY);
  const modal = page.getByTestId('mine-upgrade-modal');

  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Floor 1' })).toBeVisible();
  await expect(page.getByTestId('mine-upgrade-x1')).toBeDisabled();
  await expect(page.getByTestId('mine-upgrade-x5')).toBeDisabled();
  await expect(page.getByTestId('mine-upgrade-max')).toBeDisabled();

  const after = await readCoreState(page);

  expect(after.gold, 'a refusal must not spend gold').toBe(before.gold);
  expect(after.mineShaftLevels, 'a refusal must not raise a level').toEqual(
    before.mineShaftLevels,
  );
  expect((await readPurchaseControl(page, FLOOR_1_KEY)).costLabel).toBe(
    control.costLabel,
  );
  expect(errors).toEqual([]);
});

test('buys one mine-shaft level, deducting the price once', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  // Enough for one purchase several times over, so a double deduction is
  // visible as a wrong balance rather than as a second refusal.
  const fixture = createFixtureState(GameNumber.from(1_000));
  const cost = nextCosts(fixture).floor1;

  const before = await bootDriverFixture(page, fixture);
  const beforeControl = await readPurchaseControl(page, FLOOR_1_KEY);

  expect(beforeControl.isEnabledAppearance, 'the control must be enabled').toBe(
    true,
  );
  expect(beforeControl.costLabel).toBe('5');

  await pressPurchaseControl(page, FLOOR_1_KEY);
  const modal = page.getByTestId('mine-upgrade-modal');

  await expect(modal).toBeVisible();
  expect(
    (await readCoreState(page)).mineShaftLevels,
    'opening details must not buy anything',
  ).toEqual(before.mineShaftLevels);
  await page.getByTestId('mine-upgrade-x1').click();
  await expect(modal.getByText('Upgraded x1')).toBeVisible();

  const after = await readCoreState(page);

  expect(after.mineShaftLevels[0], 'exactly one level').toBe(
    before.mineShaftLevels[0] + 1,
  );
  expect(after.mineShaftLevels.slice(1), 'no other shaft moves').toEqual(
    before.mineShaftLevels.slice(1),
  );
  expect(
    GameNumber.deserialize(after.gold).equals(
      GameNumber.deserialize(before.gold).subtract(cost),
    ),
    'exactly one deduction',
  ).toBe(true);
  expect(after.elevatorLevel).toBe(before.elevatorLevel);
  expect(after.warehouseLevel).toBe(before.warehouseLevel);
  // The screen holds the objects it booted with: the new price and the
  // feedback came from rebinding text, not from rebuilding the control.
  expect(after.displayObjectCount).toBe(before.displayObjectCount);

  // The compact badge and still-open modal both rebind to the new level.
  await expect
    .poll(async () => (await readPurchaseControl(page, FLOOR_1_KEY)).costLabel, {
      message: 'the level badge must follow the new level',
    })
    .toBe('6');
  await expect(modal.getByText('Level 6')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shows floor attributes and buys every affordable level with MAX', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const fixture = createFixtureState(GameNumber.from(1_000));
  const floor = fixture.floors[0];
  const config = BASE_GAME_BALANCE.floors[0];
  const quantity = calculateMaxAffordableMineShaftUpgradeQuantity(
    floor,
    config,
    fixture.gold,
  );
  const cost = calculateMineShaftUpgradeBatchCost(floor, config, quantity);
  const before = await bootDriverFixture(page, fixture);

  await pressPurchaseControl(page, FLOOR_1_KEY);

  const modal = page.getByTestId('mine-upgrade-modal');

  await expect(modal).toContainText('Output / cycle');
  await expect(modal).toContainText('Cycle time');
  await expect(modal).toContainText('Gold waiting');
  await expect(modal).toContainText('Next output');
  await expect(page.getByTestId('mine-upgrade-x1')).toContainText('x1');
  await expect(page.getByTestId('mine-upgrade-x5')).toContainText('x5');
  await expect(page.getByTestId('mine-upgrade-max')).toContainText(
    `MAX x${quantity}`,
  );

  await page.getByTestId('mine-upgrade-max').click();

  const after = await readCoreState(page);

  expect(after.mineShaftLevels[0]).toBe(before.mineShaftLevels[0] + quantity);
  expect(
    GameNumber.deserialize(after.gold).equals(
      GameNumber.deserialize(before.gold).subtract(cost),
    ),
  ).toBe(true);
  await expect(modal).toContainText(`Level ${after.mineShaftLevels[0]}`);
  expect(errors).toEqual([]);
});

test('opens shared-stage details and buys x1 elevator plus x5 warehouse', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const fixture = createFixtureState(GameNumber.from(10_000));
  const costs = nextCosts(fixture);
  const warehouseX5Cost = calculateWarehouseUpgradeBatchCost(
    fixture.warehouse,
    BASE_GAME_BALANCE.warehouse,
    5,
  );

  const before = await bootDriverFixture(page, fixture);
  const elevatorControl = await readPurchaseControl(page, ELEVATOR_KEY);
  const warehouseControl = await readPurchaseControl(page, WAREHOUSE_KEY);
  const surfaceY = calculateMineLayout().surface.y;

  expect(elevatorControl).toMatchObject({
    actionLabel: 'Level',
    costLabel: String(before.elevatorLevel),
    isPressable: true,
    screenBounds: {
      x: SURFACE_ELEVATOR_LEVEL_CONTROL.x,
      y: surfaceY + SURFACE_ELEVATOR_LEVEL_CONTROL.y,
      width: SURFACE_ELEVATOR_LEVEL_CONTROL.width,
      height: SURFACE_ELEVATOR_LEVEL_CONTROL.height,
    },
  });
  expect(warehouseControl).toMatchObject({
    actionLabel: 'Level',
    costLabel: String(before.warehouseLevel),
    isPressable: true,
    screenBounds: {
      x: SURFACE_WAREHOUSE_LEVEL_CONTROL.x,
      y: surfaceY + SURFACE_WAREHOUSE_LEVEL_CONTROL.y,
      width: SURFACE_WAREHOUSE_LEVEL_CONTROL.width,
      height: SURFACE_WAREHOUSE_LEVEL_CONTROL.height,
    },
  });
  expect(elevatorControl.visualWorldBounds).toMatchObject({ width: 30, height: 34 });
  expect(warehouseControl.visualWorldBounds).toMatchObject({ width: 30, height: 34 });

  await pressPurchaseControl(page, ELEVATOR_KEY);
  const modal = page.getByTestId('mine-upgrade-modal');

  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Elevator Tower' })).toBeVisible();
  await expect(modal).toContainText('Capacity');
  await expect(modal).toContainText('Carrying');
  expect((await readCoreState(page)).elevatorLevel).toBe(before.elevatorLevel);
  await page.getByTestId('mine-upgrade-x1').click();
  await expect
    .poll(async () => (await readCoreState(page)).elevatorLevel)
    .toBe(before.elevatorLevel + 1);
  await page.getByTestId('mine-upgrade-close').click();

  await pressPurchaseControl(page, WAREHOUSE_KEY);
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Warehouse' })).toBeVisible();
  await expect(modal).toContainText('Capacity / cycle');
  await expect(modal).toContainText('Gold queued');
  expect((await readCoreState(page)).warehouseLevel).toBe(before.warehouseLevel);
  await page.getByTestId('mine-upgrade-x5').click();
  await expect
    .poll(async () => (await readCoreState(page)).warehouseLevel)
    .toBe(before.warehouseLevel + 5);

  const after = await readCoreState(page);

  expect(
    after.mineShaftLevels,
    'a shared-stage press must not touch a shaft',
  ).toEqual(before.mineShaftLevels);
  expect(
    GameNumber.deserialize(after.gold).equals(
      GameNumber.deserialize(before.gold)
        .subtract(costs.elevator)
        .subtract(warehouseX5Cost),
    ),
    'one deduction per purchase',
  ).toBe(true);
  expect(errors).toEqual([]);
});

/**
 * A regression guard for the frame cost of the upgrade controls.
 *
 * The scene expires press feedback on the frame clock, so every control
 * re-renders on every frame. `Text.setText` skips an unchanged value but
 * `Text.setColor` does not — it repaints the text's canvas and re-uploads its
 * texture — so writing a colour unconditionally repaints all twelve captions
 * sixty times a second to reproduce the pixels already on screen.
 */
test('re-renders idle controls without repainting any text', async ({ page }) => {
  const errors = collectBrowserErrors(page);

  await bootDriverFixture(page, createFixtureState(GameNumber.from(1_000)));

  // The first read installs the counter, so it is the baseline by definition.
  const before = await readRenderStats(page);

  // No press, and the pinned clock completes no tick, so every frame in this
  // window is one that changes nothing on screen.
  await expect
    .poll(async () => (await readRenderStats(page)).frames, {
      message: 'the render loop must actually run',
    })
    .toBeGreaterThan(before.frames + IDLE_FRAME_SAMPLE);

  const after = await readRenderStats(page);

  expect(
    after.rasterizations - before.rasterizations,
    'a frame that changes nothing must repaint no text',
  ).toBe(0);
  expect(errors).toEqual([]);
});

/**
 * Boots the real driver and scene against a pinned wall clock, exposing a
 * read-only view of authoritative state. Nothing advances the core, so any
 * change observed afterwards came from a press.
 */
async function bootDriverFixture(
  page: Page,
  state: GameState,
): Promise<CoreStateReadBack> {
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.setFixedTime(FIXED_TIME);
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
        mineShaftLevels: driver.state.floors.map((floor) => floor.mineShaftLevel),
        elevatorLevel: driver.state.elevator.level,
        warehouseLevel: driver.state.warehouse.level,
        displayObjectCount: countObjects(
          game.scene.getScene('BootScene').children.list,
        ),
      });

      // Counts text repaints by wrapping Phaser's own \`updateText\`, reached
      // through a live text object because this module is served raw and
      // cannot resolve the bare \`phaser\` specifier. Patched on the first
      // read, which is what makes that read the baseline.
      let rasterizations = 0;
      let patched = false;
      const findText = (objects) => {
        for (const object of objects) {
          if (typeof object.updateText === 'function') {
            return object;
          }

          const nested = object.list ? findText(object.list) : null;

          if (nested) {
            return nested;
          }
        }

        return null;
      };

      window.catMineIdleRenderStats = () => {
        const scene = game.scene.getScene('BootScene');

        if (!patched) {
          const text = findText(scene.children.list);

          if (text) {
            const prototype = Object.getPrototypeOf(text);
            const updateText = prototype.updateText;

            prototype.updateText = function (...args) {
              rasterizations += 1;
              return updateText.apply(this, args);
            };
            patched = true;
          }
        }

        return { rasterizations, frames: game.loop.frame };
      };
    `,
  );

  await page.goto('/');
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-boot-scene',
    'BootScene',
  );
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-purchase-controls',
    /"key":"elevator"/,
  );

  return readCoreState(page);
}

/**
 * Presses a control where it actually is on screen.
 *
 * The scene publishes each control's rectangle in logical coordinates; `FIT`
 * scales the canvas through CSS while its logical size stays 360x640, so the
 * rectangle is mapped through the canvas' own box rather than assumed to be
 * one-to-one with page pixels.
 */
async function pressPurchaseControl(page: Page, key: string): Promise<void> {
  const canvas = page.locator(CANVAS_SELECTOR);
  const control = await readPurchaseControl(page, key);
  const box = await boundingBox(canvas);
  const scaleX = box.width / 360;
  const scaleY = box.height / 640;
  const center = {
    x: box.x + (control.screenBounds.x + control.screenBounds.width / 2) * scaleX,
    y: box.y + (control.screenBounds.y + control.screenBounds.height / 2) * scaleY,
  };

  // The control must be inside the visible canvas, or the press below would
  // silently land somewhere else and the test would pass for the wrong reason.
  expect(center.x, `${key} horizontal position`).toBeGreaterThan(box.x);
  expect(center.x, `${key} horizontal position`).toBeLessThan(box.x + box.width);
  expect(center.y, `${key} vertical position`).toBeGreaterThan(box.y);
  expect(center.y, `${key} vertical position`).toBeLessThan(box.y + box.height);

  await page.mouse.click(center.x, center.y);
}

async function readPurchaseControl(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl> {
  const serialized = await page
    .locator(CANVAS_SELECTOR)
    .getAttribute('data-purchase-controls');

  if (serialized === null) {
    throw new Error('Diagnostic "data-purchase-controls" was not published.');
  }

  const controls = JSON.parse(serialized) as PublishedPurchaseControl[];
  const control = controls.find((candidate) => candidate.key === key);

  if (control === undefined) {
    throw new Error(
      `No upgrade control "${key}" was published; found ${controls
        .map(({ key: published }) => published)
        .join(', ')}.`,
    );
  }

  return control;
}

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('The game canvas has no bounding box.');
  }

  return box;
}

async function readRenderStats(page: Page): Promise<RenderStatsReadBack> {
  return page.evaluate(() => {
    return (
      window as unknown as { catMineIdleRenderStats(): RenderStatsReadBack }
    ).catMineIdleRenderStats();
  });
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

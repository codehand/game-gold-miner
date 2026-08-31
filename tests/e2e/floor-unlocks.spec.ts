import { expect, test, type Locator, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  createInitialGameState,
  describeFloorUnlock,
  GameNumber,
  type GameState,
} from '../../src/core';
// The views' own read-back types, imported rather than restated, so a renamed
// field fails type-check instead of silently reading `undefined`.
import type { RenderedFloorState } from '../../src/game/entities';
import type { PublishedPurchaseControl } from '../../src/game/scenes/BootScene';
import {
  formatAmount,
  PURCHASE_FEEDBACK_DURATION_MS,
} from '../../src/game/view-model';
import { createSaveDocument } from '../../src/persistence';

const CANVAS_SELECTOR = '#game-viewport canvas';

/**
 * The clock is paused at the fixture's own save timestamp, so no offline
 * interval exists at boot and nothing advances except through `runFor`. Every
 * change these tests observe therefore came from a press or from an amount of
 * simulated time this file chose.
 */
const FIXED_TIME = new Date('2026-08-28T10:00:00.000Z');
const FIXTURE_TIMESTAMP_MS = FIXED_TIME.getTime();

/**
 * Fake time granted once the scene exists, before anything is pressed.
 *
 * The scene publishes its diagnostics inside `create`, which the page runs on
 * load, but the game loop itself does not step again until the paused clock is
 * advanced — and until it has stepped, a pointer event dispatched at the canvas
 * is never taken up. Without this, the first press of a run is simply lost.
 */
const FIRST_STEP_MS = 100;

/** Fake time granted between samples while waiting for a floor to produce. */
const EXTRACTION_SAMPLE_MS = 250;
/** Samples before a floor is treated as idle: ten seconds of simulated mining. */
const MAX_EXTRACTION_SAMPLES = 40;

/** Fake time granted per attempt while waiting for a press to be processed. */
const PRESS_SETTLE_STEP_MS = 50;
/**
 * Attempts before a press is treated as lost. The total stays well inside the
 * feedback duration, so a press that did land is never waited out.
 */
const MAX_PRESS_SETTLE_ATTEMPTS = 8;

const FLOOR_1_UPGRADE_KEY = 'mine-shaft:floor-1';
const FLOOR_2_UNLOCK_KEY = 'floor-unlock:floor-2';
const FLOOR_2_UPGRADE_KEY = 'mine-shaft:floor-2';

/** Floor 1 one level short of the gate, with more than the unlock price. */
const STARTING_MINE_SHAFT_LEVEL = 4;
const STARTING_GOLD = 400;

/**
 * A mine whose floor 2 is locked behind a prerequisite it has not reached, and
 * a balance that could already pay the price. Gold alone must not open it.
 */
function createFixtureState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    gold: GameNumber.from(STARTING_GOLD),
    floors: base.floors.map((floor, index) => {
      return index === 0
        ? { ...floor, mineShaftLevel: STARTING_MINE_SHAFT_LEVEL }
        : floor;
    }),
  };
}

/** Floor 2's price, read from the same description the control renders. */
function unlockCost(state: GameState): GameNumber {
  const availability = describeFloorUnlock(state, 'floor-2', BASE_GAME_BALANCE);

  if (availability === null) {
    throw new Error('The fixture must leave floor 2 locked.');
  }

  return availability.cost;
}

test('blocks a premature unlock, then opens the floor and keeps it open', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const fixture = createFixtureState();
  const cost = unlockCost(fixture);

  await bootPausedFixture(page, fixture);

  // The requirement and the price are both on screen before anything is bought.
  const lockedFloor = (await readFloorViews(page))[1];

  expect(lockedFloor.statusLabel, 'floor 2 starts locked').toBe('Locked');
  expect(lockedFloor.isLockedAppearance, 'and drawn as locked').toBe(true);
  expect(lockedFloor.showsUpgradeControl, 'a locked shaft cannot be upgraded').toBe(
    false,
  );
  expect(
    lockedFloor.showsUnlockControl,
    'a locked floor offers an unlock instead',
  ).toBe(true);
  expect(
    lockedFloor.unlockRequirementLabel,
    'the requirement is on screen',
  ).toBe('Needs Floor 1 Lv 5');
  expect(lockedFloor.isUnlockRequirementMet, 'and drawn as unmet').toBe(false);

  const lockedControl = await readPurchaseControl(page, FLOOR_2_UNLOCK_KEY);

  expect(lockedControl.actionLabel, 'the unlock control is published').toBe(
    'Unlock',
  );
  expect(lockedControl.costLabel, 'the unlock price is shown').toBe(
    formatAmount(cost),
  );
  // The balance covers the price, so only the unmet prerequisite can be
  // holding this control shut.
  expect(
    lockedControl.isEnabledAppearance,
    'gold alone must not enable an unlock',
  ).toBe(false);

  await pressPurchaseControl(page, FLOOR_2_UNLOCK_KEY);

  expect(
    (await readPurchaseControl(page, FLOOR_2_UNLOCK_KEY)).feedbackLabel,
    'a premature unlock must say which gate refused it',
  ).toBe('Level too low');
  expect(
    (await readFloorViews(page))[1].isLockedAppearance,
    'a refused unlock must leave the floor closed',
  ).toBe(true);

  // Satisfying the prerequisite is the only thing that changes, and the
  // requirement must read as met without the floor opening by itself.
  await pressPurchaseControl(page, FLOOR_1_UPGRADE_KEY);

  const gatePassed = (await readFloorViews(page))[1];

  expect((await readFloorViews(page))[0].levelLabel, 'one level bought').toBe(
    `Lv ${STARTING_MINE_SHAFT_LEVEL + 1}`,
  );
  expect(gatePassed.isUnlockRequirementMet).toBe(true);
  expect(gatePassed.isLockedAppearance, 'the gate alone must not open it').toBe(
    true,
  );
  // The refusal covers the control while it is showing, so the control is read
  // once it has cleared and gone back to displaying its price.
  await page.clock.runFor(PURCHASE_FEEDBACK_DURATION_MS);

  const readyControl = await readPurchaseControl(page, FLOOR_2_UNLOCK_KEY);

  expect(readyControl.feedbackLabel, 'the refusal has cleared').toBe(null);
  expect(readyControl.costLabel, 'and shows the price again').toBe(
    formatAmount(cost),
  );
  expect(readyControl.isEnabledAppearance, 'both gates are now satisfied').toBe(
    true,
  );

  const goldBefore = await readGold(page);

  await pressPurchaseControl(page, FLOOR_2_UNLOCK_KEY);

  // The floor takes on its active appearance in place: same scene, same run.
  const opened = (await readFloorViews(page))[1];

  expect(opened.statusLabel, 'an opened floor is no longer marked locked').toBe(
    null,
  );
  expect(opened.isLockedAppearance, 'and takes its active appearance').toBe(
    false,
  );
  expect(opened.showsMiner, 'an opened floor is being worked').toBe(true);
  expect(opened.showsUnlockControl, 'nothing left to unlock').toBe(false);
  expect(opened.showsUpgradeControl, 'its shaft can now be upgraded').toBe(true);
  expect(opened.unlockRequirementLabel, 'and states no requirement').toBe(null);
  expect(
    (await readPurchaseControl(page, FLOOR_1_UPGRADE_KEY)).isVisible,
    'the rest of the mine is untouched',
  ).toBe(true);
  await expect(
    page.locator(CANVAS_SELECTOR),
    'the scene must not restart to show the change',
  ).toHaveAttribute('data-boot-scene-starts', '1');

  // Production only ever adds gold, so a fall of about one whole price is the
  // deduction and nothing else. The exact charge is pinned by unit tests; what
  // this proves is that the press the player made is what paid for the floor.
  const price = Number(formatAmount(cost));
  const spent = goldBefore - (await readGold(page));

  expect(spent, 'one unlock price is deducted').toBeGreaterThan(price * 0.9);
  expect(spent, 'and no more than one').toBeLessThanOrEqual(price + 1);

  // The opened floor replaces the wide unlock button with layout1's compact
  // Level badge. Pressing it proves the hidden unlock control left input.
  await page.clock.runFor(PURCHASE_FEEDBACK_DURATION_MS);

  const revealed = await readPurchaseControl(page, FLOOR_2_UPGRADE_KEY);

  expect(revealed.screenBounds.width, 'the Level badge uses its compact width').toBe(44);
  expect(revealed.screenBounds.height, 'the Level badge stays thumb-sized').toBe(50);
  expect(revealed.actionLabel).toBe('Level');
  expect(revealed.costLabel).toBe('1');
  // Without this the press below could be refused for gold and the level
  // assertion would fail for a reason that has nothing to do with the slot.
  expect(
    revealed.isEnabledAppearance,
    'and the opened shaft is affordable',
  ).toBe(true);

  await pressPurchaseControl(page, FLOOR_2_UPGRADE_KEY);

  expect(
    (await readFloorViews(page))[1].levelLabel,
    'a press in the shared slot buys a shaft level, not the hidden unlock',
  ).toBe('Lv 2');

  // The purchase completes no simulation tick, so it is persisted through the
  // applied-command hook rather than by the next tick's routine save.
  await page.clock.runFor(1_000);
  expect(
    await readStoredFloorUnlocks(page),
    'the open floor must reach the save before the reload',
  ).toEqual([true, true, false, false]);

  await page.reload();
  await waitForBootedScene(page);

  const restored = (await readFloorViews(page))[1];

  expect(restored.isLockedAppearance, 'floor 2 stays open across a reload').toBe(
    false,
  );
  expect(restored.statusLabel, 'and is not marked locked').toBe(null);
  expect(
    restored.showsUpgradeControl,
    'and offers its shaft upgrade',
  ).toBe(true);

  // A restored floor is a working floor, not just an unlocked-looking one.
  expect(
    Number(await extractedMaterialOnFloor(page, 1)),
    'the restored floor must extract material',
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/**
 * Runs the mine until one floor is holding material, and reports how much.
 *
 * A floor's pile is transient — the shared elevator empties it every trip — so
 * this samples far more often than a cycle lasts rather than reading once and
 * concluding the floor is idle. The budget covers several extraction cycles of
 * the slowest floor.
 */
async function extractedMaterialOnFloor(
  page: Page,
  index: number,
): Promise<string> {
  for (let step = 0; step < MAX_EXTRACTION_SAMPLES; step += 1) {
    await page.clock.runFor(EXTRACTION_SAMPLE_MS);

    const label = (await readFloorViews(page))[index].materialQueueLabel;

    if (label !== '0') {
      return label;
    }
  }

  return '0';
}

/** Seeds one valid version-1 save and boots the real application against it. */
async function bootPausedFixture(page: Page, state: GameState): Promise<void> {
  const saveDocument = createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    FIXTURE_TIMESTAMP_MS,
  );

  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(FIXED_TIME);
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
      await import('/src/main.ts?floor-unlock-seeded');
    `,
  );

  await page.goto('/');
  await waitForBootedScene(page);
  // A clock paused at the save's own timestamp leaves no offline interval, so
  // no reward modal covers the mine.
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
}

async function waitForBootedScene(page: Page): Promise<void> {
  const canvas = page.locator(CANVAS_SELECTOR);

  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect(canvas).toHaveAttribute('data-purchase-controls', /Unlock|Upgrade/);
  await page.clock.runFor(FIRST_STEP_MS);
}

/**
 * Presses a control where it actually is on screen, then advances the paused
 * clock until Phaser has processed the queued pointer event.
 *
 * Phaser reads pointer events on its own game step, which under a paused clock
 * only runs while time is being granted, and the browser delivers the event on
 * real time rather than on that clock. Waiting for the result — a label on the
 * control, or the control being gone because the press was the last thing it
 * had to sell — is what makes the press observed rather than assumed.
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

  for (let attempt = 0; attempt < MAX_PRESS_SETTLE_ATTEMPTS; attempt += 1) {
    await page.clock.runFor(PRESS_SETTLE_STEP_MS);

    const control = await findPurchaseControl(page, key);

    if (control === undefined || control.feedbackLabel !== null) {
      return;
    }
  }

  throw new Error(`The press on "${key}" never reached the scene.`);
}

async function findPurchaseControl(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl | undefined> {
  const controls = await readJsonAttribute<PublishedPurchaseControl[]>(
    page,
    'data-purchase-controls',
  );

  return controls.find((candidate) => candidate.key === key);
}

async function readPurchaseControl(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl> {
  const control = await findPurchaseControl(page, key);

  if (control === undefined) {
    const controls = await readJsonAttribute<PublishedPurchaseControl[]>(
      page,
      'data-purchase-controls',
    );

    throw new Error(
      `No purchase control "${key}" was published; found ${controls
        .map(({ key: published }) => published)
        .join(', ')}.`,
    );
  }

  return control;
}

async function readFloorViews(page: Page): Promise<RenderedFloorState[]> {
  return readJsonAttribute<RenderedFloorState[]>(page, 'data-floor-views');
}

/** The HUD's own gold reading, parsed back from what the player can see. */
async function readGold(page: Page): Promise<number> {
  const hud = await readJsonAttribute<{ goldValueLabel: string }>(
    page,
    'data-hud-view',
  );
  const gold = Number(hud.goldValueLabel);

  if (!Number.isFinite(gold)) {
    throw new Error(`The HUD gold reading "${hud.goldValueLabel}" is not a number.`);
  }

  return gold;
}

/** Lock states as the stored save holds them, not as the screen shows them. */
async function readStoredFloorUnlocks(page: Page): Promise<boolean[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{
      document?: { state?: { floors?: { isUnlocked: boolean }[] } };
    }>((resolve, reject) => {
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result);
    });
    database.close();

    return (record?.document?.state?.floors ?? []).map(
      ({ isUnlocked }) => isUnlocked,
    );
  });
}

async function readJsonAttribute<T>(page: Page, attribute: string): Promise<T> {
  const serialized = await page
    .locator(CANVAS_SELECTOR)
    .getAttribute(attribute);

  if (serialized === null) {
    throw new Error(`Diagnostic "${attribute}" was not published.`);
  }

  return JSON.parse(serialized) as T;
}

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('The game canvas has no bounding box.');
  }

  return box;
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

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateOfflineIncome,
  catchUpSimulation,
  claimOfflineReward,
  createInitialGameState,
  createPendingOfflineReward,
  purchaseElevatorUpgrade,
  purchaseFloorUnlock,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
  simulateEconomyProgression,
  type EconomyProgressionEvent,
  type GameState,
} from '../../src/core';
import type {
  RenderedFloorState,
  RenderedSharedStageState,
} from '../../src/game/entities';
import type { PublishedPurchaseControl } from '../../src/game/scenes/BootScene';
import { calculateMineLayout } from '../../src/game/layout';
import {
  createSaveDocument,
  deserializeSaveDocument,
  type SaveDocumentV2,
} from '../../src/persistence';
import {
  formatCreditedDuration,
  formatOfflineRewardAmount,
  type RenderedMineShaftUpgradeModalState,
} from '../../src/ui';

const CANVAS_SELECTOR = '#game-viewport canvas';
const LOGICAL_VIEWPORT_WIDTH = 360;
const LOGICAL_VIEWPORT_HEIGHT = 640;
const JOURNEY_START = new Date('2026-09-02T01:00:00.000Z');
const JOURNEY_START_MS = JOURNEY_START.getTime();
const OFFLINE_DURATION_MS = 60 * 60 * 1_000;
const STORE_SETTLE_TIMEOUT_MS = 5_000;

// `BootScene` republishes its rendered-state read-back at most once every
// `VIEW_DIAGNOSTIC_INTERVAL_MS` (100 ms), while the mine camera is moved the
// instant a wheel or drag is applied. This separation is enough for two reads
// to straddle a publish, so agreement between them proves no publish is
// pending. See `readSettledPurchaseControl`.
const VIEW_DIAGNOSTIC_SETTLE_MS = 120;
const VIEW_DIAGNOSTIC_SETTLE_READS = 3;
const MODAL_OPEN_TIMEOUT_MS = 5_000;
const PRESS_ATTEMPTS = 3;
const MINE_SCROLL_ATTEMPTS = 4;

// Two full clean-profile runs intentionally cross the default 30-second test
// budget because every real purchase waits for the 500 ms persistence debounce.
test.setTimeout(120_000);

interface JourneyStep {
  readonly event: EconomyProgressionEvent;
  readonly controlKey: string;
  readonly expectedDocument: SaveDocumentV2;
}

interface JourneyPlan {
  readonly steps: readonly JourneyStep[];
  readonly finalDocument: SaveDocumentV2;
  readonly returnTimestampMs: number;
  readonly expectedClaimDocument: SaveDocumentV2;
  readonly expectedOfflineRewardLabel: string;
  readonly expectedOfflineTimeLabel: string;
}

interface JourneyResult {
  readonly beforeOffline: SaveDocumentV2;
  readonly afterClaim: SaveDocumentV2;
  readonly browserErrors: readonly string[];
}

test('completes the same fresh player journey twice', async ({ browser }) => {
  const plan = createJourneyPlan();
  const first = await runJourney(browser, plan, 'first');
  const second = await runJourney(browser, plan, 'second');

  expect(first.beforeOffline, 'the first run reaches the planned saved state')
    .toEqual(plan.finalDocument);
  expect(second.beforeOffline, 'the second run reaches the planned saved state')
    .toEqual(plan.finalDocument);
  expect(second.beforeOffline, 'both clean profiles are deterministic')
    .toEqual(first.beforeOffline);

  expect(first.afterClaim, 'the first run persists the exact claimed reward')
    .toEqual(plan.expectedClaimDocument);
  expect(second.afterClaim, 'the second run persists the exact claimed reward')
    .toEqual(plan.expectedClaimDocument);
  expect(second.afterClaim, 'both claimed states are deterministic')
    .toEqual(first.afterClaim);

  expect(first.browserErrors, 'the first journey has no browser errors').toEqual([]);
  expect(second.browserErrors, 'the second journey has no browser errors').toEqual([]);
});

/**
 * Replays the proven economy policy in the test process and records the exact
 * authoritative document expected after each UI press. The journey stops at
 * the first event that has exercised every upgrade kind, opened two additional
 * floors, and reached the first configured milestone; it does not spill into
 * Step 34's lifecycle/background scenarios.
 */
function createJourneyPlan(): JourneyPlan {
  const report = simulateEconomyProgression(undefined, JOURNEY_START_MS);
  const steps: JourneyStep[] = [];
  const exercised = new Set<EconomyProgressionEvent['type']>();
  let state = createInitialGameState(BASE_GAME_BALANCE, JOURNEY_START_MS);
  let elapsedMs = 0;

  for (const event of report.events) {
    state = catchUpSimulation(state, event.elapsedMs - elapsedMs);
    elapsedMs = event.elapsedMs;
    state = applyExpectedPurchase(state, event);
    exercised.add(event.type);

    let expectedDocument: SaveDocumentV2;

    try {
      expectedDocument = createSaveDocument(
        state,
        BASE_GAME_BALANCE,
        JOURNEY_START_MS + elapsedMs,
      );
    } catch (error) {
      throw new Error(
        `Step 33 plan failed after ${event.type}:${event.targetId} ` +
        `at ${event.elapsedMs} ms; floor 1 extracted ` +
        `${state.floors[0].totalExtracted.serialize()} and transported ` +
        `${state.floors[0].totalTransported.serialize()}.`,
        { cause: error },
      );
    }

    steps.push({
      event,
      controlKey: controlKeyForEvent(event),
      expectedDocument,
    });

    if (journeyRequirementsAreMet(state, exercised)) {
      break;
    }
  }

  const finalStep = steps.at(-1);

  if (finalStep === undefined || !journeyRequirementsAreMet(state, exercised)) {
    throw new Error('The economy policy did not satisfy the Step 33 journey.');
  }

  const finalDocument = finalStep.expectedDocument;
  const returnTimestampMs = finalDocument.savedAtTimestampMs + OFFLINE_DURATION_MS;
  const loaded = deserializeSaveDocument(finalDocument, BASE_GAME_BALANCE);
  const offlineIncome = calculateOfflineIncome(
    loaded.state,
    loaded.savedAtTimestampMs,
    returnTimestampMs,
    loaded.effectiveProductionRatePerSecond,
    BASE_GAME_BALANCE.offlineIncome,
  );
  const pendingReward = createPendingOfflineReward(offlineIncome);

  if (pendingReward === null) {
    throw new Error('The completed journey must produce a positive offline reward.');
  }

  const claim = claimOfflineReward(offlineIncome.state, pendingReward);

  if (claim.status !== 'claimed') {
    throw new Error('The planned offline reward must be claimable.');
  }

  return {
    steps,
    finalDocument,
    returnTimestampMs,
    expectedClaimDocument: createSaveDocument(
      claim.state,
      BASE_GAME_BALANCE,
      returnTimestampMs,
    ),
    expectedOfflineRewardLabel:
      `${formatOfflineRewardAmount(pendingReward.reward)} gold`,
    expectedOfflineTimeLabel:
      `${formatCreditedDuration(pendingReward.creditedDurationMs)} credited`,
  };
}

async function runJourney(
  browser: Browser,
  plan: JourneyPlan,
  runId: string,
): Promise<JourneyResult> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const browserErrors = collectBrowserErrors(page);

  try {
    await page.clock.install({ time: JOURNEY_START });
    await page.clock.setFixedTime(JOURNEY_START);
    await routeCleanApplication(page, runId);
    await page.goto('/');
    await waitForBootedScene(page);

    expect(
      await readStoredSave(page),
      `${runId} profile starts without an active save`,
    ).toBeNull();
    await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);

    for (const [index, step] of plan.steps.entries()) {
      await page.clock.setFixedTime(
        new Date(JOURNEY_START_MS + step.event.elapsedMs),
      );
      await ensureControlIsPressable(page, step.controlKey);
      await expect
        .poll(
          async () => (await readPurchaseControl(page, step.controlKey))
            .isEnabledAppearance,
          {
            message: `journey step ${index + 1} enables ${step.controlKey}`,
          },
        )
        .toBe(true);

      await pressPurchaseControl(page, step.controlKey);
      await waitForStepApplied(page, step, index);
    }

    // Every command queues the latest document and resets the same 500 ms
    // debounce. Waiting once at the end proves that the final authoritative
    // state — not an intermediate purchase — is what reaches IndexedDB.
    await expect
      .poll(() => readStoredSave(page), {
        message: `${runId} final journey state reaches IndexedDB`,
        timeout: STORE_SETTLE_TIMEOUT_MS,
      })
      .toEqual(plan.finalDocument);
    const beforeOffline = await requireStoredSave(page);

    expect(
      beforeOffline.state.floors.filter(({ isUnlocked }) => isUnlocked),
      'the journey opens at least two additional floors',
    ).toHaveLength(3);
    expect(highestStageLevel(beforeOffline.state)).toBeGreaterThanOrEqual(
      firstMilestoneLevel(),
    );

    // Leave the running application at its current timestamp before moving the
    // controlled clock. Jumping the clock while the page is still alive and
    // then reloading would correctly make the lifecycle boundary treat that
    // gap as foreground catch-up, not as a closed-app offline interval.
    await page.route('**/step-33-away.html', async (route) => {
      await route.fulfill({
        body: '<!doctype html><title>Away</title>',
        contentType: 'text/html',
      });
    });
    await page.goto('/step-33-away.html');
    await page.clock.setFixedTime(new Date(plan.returnTimestampMs));
    await page.goto('/');
    await waitForBootedScene(page);

    const modal = page.getByTestId('offline-reward-modal');

    await expect(modal, `${runId} returning player sees the reward`).toBeVisible();
    await expect(page.getByTestId('offline-reward-time'))
      .toHaveText(plan.expectedOfflineTimeLabel);
    await expect(page.getByTestId('offline-reward-amount'))
      .toHaveText(plan.expectedOfflineRewardLabel);

    await page.getByTestId('offline-reward-claim').click();
    await expect(modal).toHaveCount(0);
    await expect
      .poll(() => readStoredSave(page), {
        message: `${runId} claim reaches IndexedDB`,
        timeout: STORE_SETTLE_TIMEOUT_MS,
      })
      .toEqual(plan.expectedClaimDocument);

    // Reloading at the same controlled instant proves the claimed interval was
    // consumed and cannot create a second reward.
    await page.reload();
    await waitForBootedScene(page);
    await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);

    return {
      beforeOffline,
      afterClaim: await requireStoredSave(page),
      browserErrors,
    };
  } finally {
    await context.close();
  }
}

async function waitForStepApplied(
  page: Page,
  step: JourneyStep,
  index: number,
): Promise<void> {
  const floorIndex = BASE_GAME_BALANCE.floors.findIndex(
    ({ id }) => id === step.event.targetId,
  );

  await expect
    .poll(async () => {
      switch (step.event.type) {
        case 'mine-shaft-upgrade': {
          const floors = await readJsonAttribute<RenderedFloorState[]>(
            page,
            'data-floor-views',
          );

          return floors[floorIndex]?.levelLabel;
        }
        case 'floor-unlock': {
          const floors = await readJsonAttribute<RenderedFloorState[]>(
            page,
            'data-floor-views',
          );

          return floors[floorIndex]?.isLockedAppearance;
        }
        case 'elevator-upgrade':
        case 'warehouse-upgrade': {
          const stages = await readJsonAttribute<RenderedSharedStageState[]>(
            page,
            'data-surface-views',
          );
          const stageIndex = step.event.type === 'elevator-upgrade' ? 0 : 1;

          return stages[stageIndex]?.levelLabel;
        }
      }
    }, {
      message: `journey step ${index + 1} applies ${step.controlKey}`,
    })
    .toBe(expectedRenderedResult(step, floorIndex));
}

function expectedRenderedResult(
  step: JourneyStep,
  floorIndex: number,
): string | boolean {
  switch (step.event.type) {
    case 'mine-shaft-upgrade':
      return `Lv ${step.expectedDocument.state.floors[floorIndex].mineShaftLevel}`;
    case 'floor-unlock':
      return false;
    case 'elevator-upgrade':
      return `Lv ${step.expectedDocument.state.elevator.level}`;
    case 'warehouse-upgrade':
      return `Lv ${step.expectedDocument.state.warehouse.level}`;
  }
}

function applyExpectedPurchase(
  state: GameState,
  event: EconomyProgressionEvent,
): GameState {
  const result = (() => {
    switch (event.type) {
      case 'mine-shaft-upgrade':
        return purchaseMineShaftUpgrade(
          state,
          event.targetId,
          BASE_GAME_BALANCE,
        );
      case 'elevator-upgrade':
        return purchaseElevatorUpgrade(state, BASE_GAME_BALANCE);
      case 'warehouse-upgrade':
        return purchaseWarehouseUpgrade(state, BASE_GAME_BALANCE);
      case 'floor-unlock':
        return purchaseFloorUnlock(state, event.targetId, BASE_GAME_BALANCE);
    }
  })();

  if (!result.success) {
    throw new Error(
      `The expected ${event.type} for ${event.targetId} was refused.`,
    );
  }

  if (!result.cost.equals(event.cost)) {
    throw new Error(`The expected cost for ${event.targetId} drifted.`);
  }

  return result.state;
}

function journeyRequirementsAreMet(
  state: GameState,
  exercised: ReadonlySet<EconomyProgressionEvent['type']>,
): boolean {
  return state.floors.filter(({ isUnlocked }) => isUnlocked).length >= 3 &&
    highestStageLevel(state) >= firstMilestoneLevel() &&
    exercised.has('mine-shaft-upgrade') &&
    exercised.has('elevator-upgrade') &&
    exercised.has('warehouse-upgrade') &&
    exercised.has('floor-unlock');
}

function firstMilestoneLevel(): number {
  return BASE_GAME_BALANCE.elevator.upgrade.milestones[0].level;
}

function highestStageLevel(
  state: SaveDocumentV2['state'] | GameState,
): number {
  return Math.max(
    ...state.floors
      .filter(({ isUnlocked }) => isUnlocked)
      .map(({ mineShaftLevel }) => mineShaftLevel),
    state.elevator.level,
    state.warehouse.level,
  );
}

function controlKeyForEvent(event: EconomyProgressionEvent): string {
  switch (event.type) {
    case 'mine-shaft-upgrade':
      return `mine-shaft:${event.targetId}`;
    case 'floor-unlock':
      return `floor-unlock:${event.targetId}`;
    case 'elevator-upgrade':
      return 'elevator';
    case 'warehouse-upgrade':
      return 'warehouse';
  }
}

async function routeCleanApplication(page: Page, runId: string): Promise<void> {
  let pending = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!pending) {
      await route.continue();
      return;
    }

    pending = false;
    await route.fulfill({
      body: `
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase('cat-mine-idle');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
        await import('/src/main.ts?step-33-${runId}');
      `,
      contentType: 'application/javascript',
    });
  });
}

async function waitForBootedScene(page: Page): Promise<void> {
  const canvas = page.locator(CANVAS_SELECTOR);

  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect(canvas).toHaveAttribute('data-purchase-controls', /mine-shaft/);
}

async function ensureControlIsPressable(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl> {
  const mine = calculateMineLayout().mine;
  const mineCenterY = mine.y + mine.height / 2;
  const canvas = page.locator(CANVAS_SELECTOR);
  const box = await boundingBox(canvas);
  const scaleX = box.width / LOGICAL_VIEWPORT_WIDTH;
  const scaleY = box.height / LOGICAL_VIEWPORT_HEIGHT;

  await page.mouse.move(
    box.x + (mine.x + mine.width / 2) * scaleX,
    box.y + mineCenterY * scaleY,
  );

  for (let attempt = 0; attempt < MINE_SCROLL_ATTEMPTS; attempt += 1) {
    // Settled first, every time. A wheel reaches the camera a frame or more
    // after it is dispatched and the read-back is published on its own
    // throttle, so a snapshot read too soon still describes the position
    // *before* the scroll landed. Deciding from that snapshot scrolls a mine
    // that has already moved — which is what walks a control out of the
    // viewport it was scrolled into.
    const control = await readSettledPurchaseControl(page, key);

    if (control.isPressable) {
      // The camera clamp and the read-back can update in the same tick. Wait
      // for the newly reachable control to be presented before asking Phaser
      // to hit-test it, especially now that the bottom navigation makes the
      // mine viewport shorter and the journey scrolls more often.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );

      return control;
    }

    // Exactly the distance the control must travel to reach the middle of the
    // viewport. Scrolling by a whole viewport height instead — as this did —
    // overshoots a control that was only just out of view, carrying it out
    // past the opposite edge and leaving a later press aimed at nothing.
    await page.mouse.wheel(
      0,
      control.screenBounds.y + control.screenBounds.height / 2 - mineCenterY,
    );
  }

  throw new Error(
    `Purchase control "${key}" could not be scrolled into the mine viewport.`,
  );
}

async function pressPurchaseControl(page: Page, key: string): Promise<void> {
  const canvas = page.locator(CANVAS_SELECTOR);
  const expectsModal = expectedModalTarget(key) !== null;

  for (let attempt = 1; attempt <= PRESS_ATTEMPTS; attempt += 1) {
    // Re-established per attempt rather than read once: a press that missed
    // tells us nothing about whether the mine has since settled somewhere the
    // control is reachable from.
    const control = await ensureControlIsPressable(page, key);
    const box = await boundingBox(canvas);
    const scaleX = box.width / LOGICAL_VIEWPORT_WIDTH;
    const scaleY = box.height / LOGICAL_VIEWPORT_HEIGHT;

    await page.mouse.click(
      box.x + (control.screenBounds.x + control.screenBounds.width / 2) * scaleX,
      box.y + (control.screenBounds.y + control.screenBounds.height / 2) * scaleY,
    );

    if (!expectsModal) {
      return;
    }

    if (await upgradeModalIsOpenFor(page, key)) {
      await expect(page.getByTestId('mine-upgrade-modal')).toBeVisible();
      await page.getByTestId('mine-upgrade-x1').click();
      await page.getByTestId('mine-upgrade-close').click();
      return;
    }

    // Either the press was aimed with a snapshot the camera has since moved
    // under, or it opened another floor's modal. Closing what is open keeps the
    // save untouched — only the correct modal's x1 CTA buys anything — and the
    // next attempt aims with a snapshot that has since settled.
    await closeUpgradeModalIfOpen(page);
  }

  throw new Error(
    `The upgrade modal for "${key}" did not open after ${PRESS_ATTEMPTS} presses.`,
  );
}

/**
 * The rendered-state read-back is throttled to `VIEW_DIAGNOSTIC_INTERVAL_MS`
 * while the mine camera moves the moment input is applied, so a snapshot read
 * just after a wheel can still describe where a control *was*. A press aimed
 * from that snapshot lands on empty space, the modal never opens, and the
 * journey fails with an error that says nothing about the real cause. Reading
 * until two consecutive snapshots agree on placement proves no publish is
 * pending, so the press is aimed where the control is now.
 */
async function readSettledPurchaseControl(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl> {
  let placement = controlPlacement(await readPurchaseControl(page, key));

  for (let read = 0; read < VIEW_DIAGNOSTIC_SETTLE_READS; read += 1) {
    await page.waitForTimeout(VIEW_DIAGNOSTIC_SETTLE_MS);
    const control = await readPurchaseControl(page, key);
    const next = controlPlacement(control);

    if (next === placement) {
      return control;
    }

    placement = next;
  }

  return readPurchaseControl(page, key);
}

/**
 * Only the fields a press depends on. Labels and affordability tick with the
 * simulation, so comparing whole controls would never settle.
 */
function controlPlacement(control: PublishedPurchaseControl): string {
  return JSON.stringify({
    screenBounds: control.screenBounds,
    isPressable: control.isPressable,
  });
}

interface UpgradeModalTarget {
  readonly type: string;
  readonly floorId?: string;
}

/**
 * The modal a control is expected to open, or `null` for the controls that
 * need no modal: a floor unlock buys directly.
 */
function expectedModalTarget(key: string): UpgradeModalTarget | null {
  if (key.startsWith('mine-shaft:')) {
    return { type: 'mine-shaft', floorId: key.slice('mine-shaft:'.length) };
  }

  if (key === 'elevator' || key === 'warehouse') {
    return { type: key };
  }

  return null;
}

function targetsMatch(actual: unknown, expected: UpgradeModalTarget): boolean {
  if (typeof actual !== 'object' || actual === null) {
    return false;
  }

  const target = actual as { readonly type?: unknown; readonly floorId?: unknown };

  return (
    target.type === expected.type &&
    (expected.floorId === undefined || target.floorId === expected.floorId)
  );
}

/**
 * True once the modal on screen is the one `key` opens. A press aimed with a
 * stale snapshot can open a *different* floor's modal, so the target is checked
 * rather than mere visibility: the caller must never press the x1 CTA of a
 * floor it did not mean to buy.
 */
async function upgradeModalIsOpenFor(page: Page, key: string): Promise<boolean> {
  const expected = expectedModalTarget(key);

  if (expected === null) {
    return false;
  }

  const deadline = Date.now() + MODAL_OPEN_TIMEOUT_MS;

  for (;;) {
    const rendered =
      await readJsonAttribute<RenderedMineShaftUpgradeModalState | null>(
        page,
        'data-floor-upgrade-modal',
      );

    if (rendered?.isVisible === true && targetsMatch(rendered.target, expected)) {
      return true;
    }

    if (Date.now() >= deadline) {
      return false;
    }

    await page.waitForTimeout(50);
  }
}

/** Dismisses whatever modal a missed press opened, without buying from it. */
async function closeUpgradeModalIfOpen(page: Page): Promise<void> {
  const rendered =
    await readJsonAttribute<RenderedMineShaftUpgradeModalState | null>(
      page,
      'data-floor-upgrade-modal',
    );

  if (rendered?.isVisible === true) {
    await page.getByTestId('mine-upgrade-close').click();
  }
}

async function readPurchaseControl(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl> {
  const controls = await readJsonAttribute<PublishedPurchaseControl[]>(
    page,
    'data-purchase-controls',
  );
  const control = controls.find((candidate) => candidate.key === key);

  if (control === undefined) {
    throw new Error(
      `No purchase control "${key}" was published; found ${controls
        .map(({ key: published }) => published)
        .join(', ')}.`,
    );
  }

  return control;
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

async function readStoredSave(page: Page): Promise<SaveDocumentV2 | null> {
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
    const record = await new Promise<{ document?: SaveDocumentV2 } | undefined>(
      (resolve, reject) => {
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      },
    );
    database.close();

    return record?.document ?? null;
  });
}

async function requireStoredSave(page: Page): Promise<SaveDocumentV2> {
  const document = await readStoredSave(page);

  if (document === null) {
    throw new Error('The player journey did not persist an active save.');
  }

  return document;
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

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('The game canvas has no bounding box.');
  }

  return box;
}

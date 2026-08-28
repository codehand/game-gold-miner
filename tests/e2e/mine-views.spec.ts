import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateLevelEffect,
  createInitialGameState,
  GameNumber,
  type GameState,
  type MineFloorState,
} from '../../src/core';
// The views' own read-back types, imported rather than restated: a second copy
// could drift from what `describeRenderedState` actually returns, which is the
// drift this diagnostic exists to catch. `import type` is erased before the
// Playwright process loads the module, so no Phaser reaches Node.
import type {
  RenderedFloorState,
  RenderedSharedStageState,
} from '../../src/game/entities';
import {
  calculateFloorSlotRegion,
  LOCKED_PANEL_BACKGROUND,
  MATERIAL_FILL,
  PANEL_BACKGROUND,
  PROGRESS_FILL,
  PROGRESS_TRACK,
} from '../../src/game/layout';
import {
  calculateMaterialPileSteps,
  MAX_MATERIAL_PILE_STEPS,
} from '../../src/game/view-model';
import { createSaveDocument } from '../../src/persistence';

const CANVAS_SELECTOR = '#game-viewport canvas';

/**
 * The clock is pinned to the fixture's own save timestamp so no offline
 * interval exists and the reward modal never opens over the mine.
 */
const FIXED_TIME = new Date('2026-08-28T10:00:00.000Z');
const FIXTURE_TIMESTAMP_MS = FIXED_TIME.getTime();

/**
 * Logical probe points. `FIT` scales the canvas through CSS while its backing
 * store stays 360x640, so these logical coordinates hold at any host viewport.
 * Each point sits where the sampled object is the topmost drawn thing.
 */
const UNLOCKED_FLOOR_PANEL_PROBE: readonly [number, number] = [212, 242];
const LOCKED_FLOOR_PANEL_PROBE: readonly [number, number] = [212, 494];
const FLOOR_PROGRESS_FILL_PROBE: readonly [number, number] = [40, 326];
const FLOOR_PROGRESS_TRACK_PROBE: readonly [number, number] = [112, 326];
const FILLED_PILE_BLOCK_PROBE: readonly [number, number] = [78, 308];
const EMPTY_PILE_BLOCK_PROBE: readonly [number, number] = [78, 281];
const ELEVATOR_PROGRESS_FILL_PROBE: readonly [number, number] = [40, 165];
const ELEVATOR_PROGRESS_TRACK_PROBE: readonly [number, number] = [100, 165];

/**
 * A known core snapshot whose floors differ in lock state, mine-shaft level,
 * extraction progress, and queued material, so a view bound to the wrong floor
 * or the wrong field cannot pass.
 */
function createFixtureState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    gold: GameNumber.from(4_200),
    floors: [
      withFloor(base.floors[0], {
        isUnlocked: true,
        mineShaftLevel: 6,
        extractionProgress: 0.25,
        materialQueue: GameNumber.from(40),
        totalExtracted: GameNumber.from(400),
        totalTransported: GameNumber.from(360),
      }),
      withFloor(base.floors[1], {
        isUnlocked: true,
        mineShaftLevel: 3,
        extractionProgress: 0.5,
        materialQueue: GameNumber.from(20.5),
        totalExtracted: GameNumber.from(120.5),
        totalTransported: GameNumber.from(100),
      }),
      base.floors[2],
      base.floors[3],
    ],
    elevator: {
      ...base.elevator,
      level: 2,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.elevator.baseCapacity,
        2,
        BASE_GAME_BALANCE.elevator.upgrade,
      ),
      transitProgress: 0.4,
      carriedMaterial: GameNumber.from(20),
    },
    warehouse: {
      ...base.warehouse,
      level: 2,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.warehouse.baseCapacity,
        2,
        BASE_GAME_BALANCE.warehouse.upgrade,
      ),
      inputQueue: GameNumber.from(30),
      conversionProgress: 0.75,
      totalGoldDelivered: GameNumber.from(900),
    },
  };
}

function withFloor(
  floor: MineFloorState,
  overrides: Partial<MineFloorState>,
): MineFloorState {
  return { ...floor, ...overrides };
}

test('binds four floor views and both shared stages to a known core snapshot', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  const fixture = createFixtureState();

  await page.clock.install({ time: FIXED_TIME });
  await page.clock.setFixedTime(FIXED_TIME);

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });

  await seedActiveSave(page, fixture);
  await page.addInitScript(() => {
    // Phaser disables preserveDrawingBuffer for performance, which makes the
    // WebGL canvas read back as transparent black. Forcing it on for the test
    // browser context only lets the pixel probes below sample real pixels; it
    // changes whether the buffer is retained, not what is drawn.
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      this: HTMLCanvasElement,
      contextType: string,
      attributes?: unknown,
    ) {
      if (contextType === 'webgl' || contextType === 'webgl2') {
        return originalGetContext.call(this, contextType, {
          ...(attributes as Record<string, unknown> | undefined),
          preserveDrawingBuffer: true,
        });
      }

      return originalGetContext.call(this, contextType, attributes);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  await page.goto('/');

  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  // A returning player with no elapsed time sees the mine, not a reward modal.
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);

  const floors = await readRenderedFloors(page);

  expect(floors).toHaveLength(fixture.floors.length);

  fixture.floors.forEach((source, index) => {
    const rendered = floors[index];
    const label = `floor ${source.floorNumber}`;

    // Floor number, mine-shaft level, lock state, and progress must match the
    // authoritative snapshot the save restored.
    expect(rendered.floorLabel, `${label} heading`).toBe(
      `Floor ${source.floorNumber}`,
    );
    expect(rendered.badgeLabel, `${label} badge`).toBe(
      String(source.floorNumber),
    );
    expect(rendered.levelLabel, `${label} level`).toBe(
      `Lv ${source.mineShaftLevel}`,
    );
    expect(rendered.statusLabel, `${label} lock state`).toBe(
      source.isUnlocked ? null : 'Locked',
    );
    expect(rendered.isLockedAppearance, `${label} locked appearance`).toBe(
      !source.isUnlocked,
    );
    expect(rendered.showsUpgradeControl, `${label} upgrade control`).toBe(
      source.isUnlocked,
    );
    expect(rendered.progressLabel, `${label} progress label`).toBe(
      `${Math.round(source.extractionProgress * 100)}%`,
    );
    // The drawn bar, not only its label, follows the snapshot value.
    expect(
      rendered.progressFillWidth / rendered.progressTrackWidth,
      `${label} progress bar`,
    ).toBeCloseTo(source.extractionProgress, 5);
    // The track is derived from the floor slot, so it must stay inside it
    // however the slot is sized.
    expect(rendered.progressTrackWidth, `${label} progress track`).toBeGreaterThan(
      0,
    );
    expect(
      rendered.progressTrackWidth,
      `${label} progress track`,
    ).toBeLessThan(calculateFloorSlotRegion(index).width);
    // Derived rather than hardcoded: the pile height depends on the balanced
    // elevator capacity, so a tuning change must not fail this test with an
    // opaque number mismatch. Binding a view to the wrong floor still fails,
    // because the fixture's floors hold different amounts.
    expect(rendered.materialPileSteps, `${label} material pile`).toBe(
      calculateMaterialPileSteps(source.materialQueue, fixture.elevator.capacity),
    );
  });

  expect(floors.map(({ levelLabel }) => levelLabel)).toEqual([
    'Lv 6',
    'Lv 3',
    'Lv 1',
    'Lv 1',
  ]);
  expect(floors.map(({ progressLabel }) => progressLabel)).toEqual([
    '25%',
    '50%',
    '0%',
    '0%',
  ]);
  expect(floors.map(({ materialQueueLabel }) => materialQueueLabel)).toEqual([
    '40',
    '20.5',
    '0',
    '0',
  ]);
  // The floors must actually differ, or the per-floor checks above would pass
  // with every view bound to the same floor.
  expect(new Set(floors.map(({ materialPileSteps }) => materialPileSteps)).size)
    .toBeGreaterThan(1);

  const [elevator, warehouse] = await readRenderedSharedStages(page);

  expect(elevator).toMatchObject({
    title: 'Elevator',
    levelLabel: `Lv ${fixture.elevator.level}`,
    queueLabel: 'Carrying 20',
    progressLabel: '40%',
    upgradeControlLabel: 'Upgrade',
  });
  expect(elevator.progressFillWidth / elevator.progressTrackWidth).toBeCloseTo(
    fixture.elevator.transitProgress,
    5,
  );
  expect(warehouse).toMatchObject({
    title: 'Warehouse',
    levelLabel: `Lv ${fixture.warehouse.level}`,
    queueLabel: 'Queued 30',
    progressLabel: '75%',
    upgradeControlLabel: 'Upgrade',
  });
  expect(warehouse.progressFillWidth / warehouse.progressTrackWidth).toBeCloseTo(
    fixture.warehouse.conversionProgress,
    5,
  );

  // Real pixels prove the views are drawn, that locked floors look different
  // from unlocked ones, and that bar and pile heights follow the snapshot.
  // The dataset above reports what the view objects hold, not what reached the
  // framebuffer.
  // The empty-pile probe samples the topmost block, which only proves the pile
  // stops at the queued amount while floor 1 is short of a full stack.
  expect(
    floors[0].materialPileSteps,
    'empty-pile probe needs floor 1 below a full pile',
  ).toBeLessThan(MAX_MATERIAL_PILE_STEPS);

  const [
    unlockedPanel,
    lockedPanel,
    progressFill,
    progressTrack,
    filledPileBlock,
    emptyPileBlock,
    elevatorFill,
    elevatorTrack,
  ] = await readLogicalPixels(page, [
    UNLOCKED_FLOOR_PANEL_PROBE,
    LOCKED_FLOOR_PANEL_PROBE,
    FLOOR_PROGRESS_FILL_PROBE,
    FLOOR_PROGRESS_TRACK_PROBE,
    FILLED_PILE_BLOCK_PROBE,
    EMPTY_PILE_BLOCK_PROBE,
    ELEVATOR_PROGRESS_FILL_PROBE,
    ELEVATOR_PROGRESS_TRACK_PROBE,
  ]);

  expect(unlockedPanel, 'unlocked floor panel must render').toBe(
    PANEL_BACKGROUND,
  );
  expect(lockedPanel, 'locked floor must be drawn distinctly').toBe(
    LOCKED_PANEL_BACKGROUND,
  );
  expect(progressFill, 'extraction progress must be filled').toBe(PROGRESS_FILL);
  expect(progressTrack, 'extraction progress must not overfill').toBe(
    PROGRESS_TRACK,
  );
  expect(filledPileBlock, 'material pile must render').toBe(MATERIAL_FILL);
  expect(emptyPileBlock, 'material pile must stop at the queued amount').toBe(
    PANEL_BACKGROUND,
  );
  expect(elevatorFill, 'elevator transit progress must be filled').toBe(
    PROGRESS_FILL,
  );
  expect(elevatorTrack, 'elevator transit progress must not overfill').toBe(
    PROGRESS_TRACK,
  );

  expect(browserErrors).toEqual([]);
});

/**
 * Regression guard for the read-back diagnostic itself.
 *
 * The rendered-state diagnostic is only trustworthy if it follows every rebind.
 * Published once at boot it would report a healthy first frame forever, so a
 * live snapshot that never reached the views would still look correct — the
 * exact failure this read-back exists to catch. Step 27 supplies the real
 * driver; until then this test replaces the application entry with a harness
 * that pushes a second snapshot through the same public `applySnapshot` path.
 */
test('republishes rendered values whenever a newer snapshot is applied', async ({
  page,
}) => {
  const browserErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });

  await page.route('**/src/main.ts*', async (route) => {
    await route.fulfill({
      body: `
        import { createGame, createMineViewModel } from '/src/game/index.ts';
        import { createInitialGameState } from '/src/core/index.ts';
        import { BASE_GAME_BALANCE } from '/src/config/index.ts';

        const initial = createMineViewModel(
          createInitialGameState(BASE_GAME_BALANCE, ${FIXTURE_TIMESTAMP_MS}),
        );
        const game = createGame(
          document.querySelector('#game-viewport'),
          initial,
        );

        window.applyNextSnapshot = () => {
          const [first, ...rest] = initial.floors;

          game.scene.getScene('BootScene').applySnapshot({
            ...initial,
            floors: [
              {
                ...first,
                levelLabel: 'Lv 9',
                extractionProgress: 0.6,
                extractionProgressLabel: '60%',
              },
              ...rest,
            ],
            elevator: { ...initial.elevator, queueLabel: 'Carrying 7' },
          });
        };
      `,
      contentType: 'application/javascript',
    });
  });

  await page.goto('/');

  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toHaveAttribute('data-floor-views', /Floor 1/);

  const bootFloors = await readRenderedFloors(page);

  expect(bootFloors[0].levelLabel).toBe('Lv 1');
  expect(bootFloors[0].progressLabel).toBe('0%');

  await page.evaluate(() => {
    (window as unknown as { applyNextSnapshot(): void }).applyNextSnapshot();
  });

  const [rebound] = await readRenderedFloors(page);
  const [elevator] = await readRenderedSharedStages(page);

  // A diagnostic frozen at boot would still report the values asserted above.
  expect(rebound.levelLabel, 'floor 1 level after rebind').toBe('Lv 9');
  expect(rebound.progressLabel, 'floor 1 progress label after rebind').toBe(
    '60%',
  );
  expect(
    rebound.progressFillWidth / rebound.progressTrackWidth,
    'floor 1 progress bar after rebind',
  ).toBeCloseTo(0.6, 5);
  expect(elevator.queueLabel, 'elevator queue after rebind').toBe('Carrying 7');

  expect(browserErrors).toEqual([]);
});

/** Writes one valid version-1 document before the application module runs. */
async function seedActiveSave(page: Page, state: GameState): Promise<void> {
  const document = createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    FIXTURE_TIMESTAMP_MS,
  );
  let shouldSeed = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!shouldSeed) {
      await route.continue();
      return;
    }

    shouldSeed = false;
    await route.fulfill({
      body: `
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
        await import('/src/main.ts?mine-views-seeded');
      `,
      contentType: 'application/javascript',
    });
  });
}

async function readRenderedFloors(page: Page): Promise<RenderedFloorState[]> {
  return readJsonAttribute<RenderedFloorState[]>(page, 'data-floor-views');
}

async function readRenderedSharedStages(
  page: Page,
): Promise<RenderedSharedStageState[]> {
  return readJsonAttribute<RenderedSharedStageState[]>(page, 'data-surface-views');
}

async function readJsonAttribute<T>(page: Page, attribute: string): Promise<T> {
  const serialized = await page.locator(CANVAS_SELECTOR).getAttribute(attribute);

  if (serialized === null) {
    throw new Error(`Diagnostic "${attribute}" was not published.`);
  }

  return JSON.parse(serialized) as T;
}

/**
 * Samples the canvas backing store at logical coordinates and returns each
 * colour as a lowercase `#rrggbb` string, matching the shared palette.
 */
async function readLogicalPixels(
  page: Page,
  points: readonly (readonly [number, number])[],
): Promise<string[]> {
  return page.evaluate((probes) => {
    const source = document.querySelector<HTMLCanvasElement>(
      '#game-viewport canvas',
    );

    if (source === null) {
      throw new Error('Game canvas was not found.');
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = source.width;
    offscreen.height = source.height;

    const context = offscreen.getContext('2d');

    if (context === null) {
      throw new Error('A 2D context was not available for pixel sampling.');
    }

    context.drawImage(source, 0, 0);

    return probes.map(([x, y]) => {
      const [red, green, blue] = context.getImageData(x, y, 1, 1).data;

      return `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
    });
  }, points);
}

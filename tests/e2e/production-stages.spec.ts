import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateLevelEffect,
  createInitialGameState,
  GameNumber,
  type GameState,
  type MineFloorState,
} from '../../src/core';
// The views' own read-back types, imported rather than restated, so a renamed
// diagnostic field fails type-check instead of silently reading `undefined`.
import type {
  RenderedFloorState,
  RenderedSharedStageState,
} from '../../src/game/entities';
import { PLACEHOLDER_TEXTURES } from '../../src/game/assets/placeholderAssets';
import {
  calculateFloorSlotRegion,
  calculateMineFloorPanelLayout,
  calculateMineLayout,
  HUD_BACKGROUND,
  MATERIAL_BACKLOG_FILL,
  MINE_SHAFT_CABIN_SIZE,
  MINE_SHAFT_CARGO_CAT_SIZE,
  PANEL_BACKGROUND,
  SURFACE_ELEVATOR_STOP_X,
  SURFACE_ELEVATOR_STOP_Y,
  SURFACE_ELEVATOR_TOWER_CENTER_X,
  SURFACE_ELEVATOR_TOWER_HEIGHT,
  SURFACE_ELEVATOR_TOWER_WIDTH,
  SURFACE_HAULER_END_X,
  SURFACE_HAULER_CART_SIZE,
  SURFACE_HAULER_START_X,
  SURFACE_WAREHOUSE_CENTER_X,
  SURFACE_WAREHOUSE_CENTER_Y,
  SURFACE_WAREHOUSE_HEIGHT,
  SURFACE_WAREHOUSE_MANAGER_SIZE,
  SURFACE_WAREHOUSE_MANAGER_X,
  SURFACE_WAREHOUSE_MANAGER_Y,
  SURFACE_WAREHOUSE_WIDTH,
} from '../../src/game/layout';
import { MAX_MATERIAL_PILE_STEPS } from '../../src/game/view-model';
import { createSaveDocument } from '../../src/persistence';

const CANVAS_SELECTOR = '#game-viewport canvas';

/**
 * Pinning the clock to the fixture's own save timestamp pauses the core: the
 * driver advances from `Date.now()`, so a clock that never moves credits no
 * simulated time. The renderer keeps running, which is the point — these
 * fixtures show a still frame of a bottleneck, not a stopped page.
 */
const FIXED_TIME = new Date('2026-08-28T10:00:00.000Z');
const FIXTURE_TIMESTAMP_MS = FIXED_TIME.getTime();

/**
 * Logical probe points. `FIT` scales the canvas through CSS while its backing
 * store stays 360x640, so these logical coordinates hold at any host viewport.
 * Each point sits where the sampled object is the topmost drawn thing.
 */
const FLOOR_PANEL = calculateMineFloorPanelLayout();
const FLOOR_ONE = calculateFloorSlotRegion(0);
const MINE_Y = calculateMineLayout().mine.y;
const FLOOR_ONE_PILE_BOTTOM_PROBE: readonly [number, number] = [
  FLOOR_ONE.x + FLOOR_PANEL.goldPile.x + FLOOR_PANEL.goldPile.width / 2,
  MINE_Y + FLOOR_ONE.y + FLOOR_PANEL.goldPile.y + FLOOR_PANEL.goldPile.height - 8,
];
const FLOOR_ONE_PILE_TOP_PROBE: readonly [number, number] = [
  FLOOR_ONE.x + FLOOR_PANEL.goldPile.x + FLOOR_PANEL.goldPile.width / 2,
  MINE_Y + FLOOR_ONE.y + FLOOR_PANEL.goldPile.y + FLOOR_PANEL.goldPile.height / 2,
];
const WAREHOUSE_BUILDING_PROBE: readonly [number, number] = [
  SURFACE_WAREHOUSE_CENTER_X,
  calculateMineLayout().surface.y + SURFACE_WAREHOUSE_CENTER_Y,
];
/**
 * Empty HUD background, painted on the very first frame whatever the fixture
 * holds. The canvas reads back as opaque black until a frame has actually been
 * presented, so every probe waits on this one first.
 */
const RENDERED_FRAME_PROBE: readonly [number, number] = [180, 8];

/** Floor levels that satisfy the configured 5 / 5 / 7 sequential unlock gates. */
const UNLOCKED_FLOOR_LEVELS = [6, 6, 8, 1] as const;

/**
 * Nothing is waiting anywhere: the shafts are the slowest stage, so the
 * elevator and warehouse sit idle and only extraction progress moves.
 */
function createExtractionLimitedState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    floors: [
      withFloor(base.floors[0], {
        extractionProgress: 0.6,
        totalExtracted: GameNumber.from(120),
        totalTransported: GameNumber.from(120),
      }),
      base.floors[1],
      base.floors[2],
      base.floors[3],
    ],
  };
}

/**
 * Every shaft has a full elevator trip waiting while the warehouse is nearly
 * empty: transport is the stage everything is queueing behind.
 */
function createTransportLimitedState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    gold: GameNumber.from(1_000),
    floors: base.floors.map((floor, index) => {
      return withFloor(floor, {
        isUnlocked: true,
        mineShaftLevel: UNLOCKED_FLOOR_LEVELS[index],
        extractionProgress: 0.2,
        materialQueue: GameNumber.from(60),
        totalExtracted: GameNumber.from(500),
        totalTransported: GameNumber.from(200),
      });
    }),
    elevator: {
      ...base.elevator,
      roundRobinCursor: -1,
      transitProgress: 0.5,
      carriedMaterial: GameNumber.from(50),
    },
    warehouse: {
      ...base.warehouse,
      inputQueue: GameNumber.from(10),
      conversionProgress: 0.3,
      totalGoldDelivered: GameNumber.from(900),
    },
  };
}

/**
 * A level-5 elevator out-paces the warehouse, so the shafts stay clear and the
 * backlog collects in the warehouse input queue instead.
 */
function createWarehouseLimitedState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);
  const elevatorCapacity = calculateLevelEffect(
    BASE_GAME_BALANCE.elevator.baseCapacity,
    5,
    BASE_GAME_BALANCE.elevator.upgrade,
  );

  return {
    ...base,
    gold: GameNumber.from(1_000),
    floors: base.floors.map((floor, index) => {
      return withFloor(floor, {
        isUnlocked: true,
        mineShaftLevel: UNLOCKED_FLOOR_LEVELS[index],
        extractionProgress: 0.4,
        materialQueue: GameNumber.from(5),
        totalExtracted: GameNumber.from(500),
        totalTransported: GameNumber.from(400),
      });
    }),
    elevator: {
      ...base.elevator,
      level: 5,
      capacity: elevatorCapacity,
      transitProgress: 0.2,
      carriedMaterial: GameNumber.from(30),
    },
    warehouse: {
      ...base.warehouse,
      inputQueue: GameNumber.from(70),
      conversionProgress: 0.8,
      totalGoldDelivered: GameNumber.from(2_400),
    },
  };
}

function createWarehouseLevelState(level: number): GameState {
  const state = createTransportLimitedState();

  return {
    ...state,
    warehouse: {
      ...state.warehouse,
      level,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.warehouse.baseCapacity,
        level,
        BASE_GAME_BALANCE.warehouse.upgrade,
      ),
    },
  };
}

function withFloor(
  floor: MineFloorState,
  overrides: Partial<MineFloorState>,
): MineFloorState {
  return { ...floor, ...overrides };
}

test('shows an idle transport and warehouse while extraction is the slowest stage', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  await bootPausedFixture(page, createExtractionLimitedState());

  const [floorOne] = await readRenderedFloors(page);
  const [elevator, warehouse] = await readRenderedSharedStages(page);

  // Extraction is the only stage with anything to show.
  expect(floorOne.progressLabel, 'extraction progress').toBe('60%');
  expect(
    floorOne.progressFillWidth / floorOne.progressTrackWidth,
    'extraction progress bar',
  ).toBeCloseTo(0.6, 5);
  expect(floorOne.materialPileSteps, 'floor pile').toBe(0);
  expect(floorOne.showsGoldPile, 'fixed decorative gold pile').toBe(true);
  expect(floorOne.goldPileDisplaySize, 'fixed decorative gold pile size').toBe(52);
  expect(floorOne.backlogLabel, 'floor backlog').toBeNull();
  expect(floorOne.showsMiner, 'placeholder miner').toBe(true);

  // Nothing is queued downstream, so both shared stages report themselves idle
  // and neither conveyor runs.
  expect(elevator).toMatchObject({
    assetFrame: 0,
    queueSteps: 0,
    statusLabel: 'Idle',
    showsConveyor: false,
    progressFillWidth: 0,
    cycleMarkerOffsetPx: 0,
  });
  expect(warehouse).toMatchObject({
    assetFrame: 0,
    queueSteps: 0,
    statusLabel: 'Idle',
    showsConveyor: false,
    progressFillWidth: 0,
  });

  // The walking frames stay cosmetic, but the miner's position is now the
  // authoritative extraction indicator and therefore freezes with the core.
  await expect
    .poll(async () => (await readRenderedFloors(page))[0].minerAssetFrame, {
      message: 'the generated digging sheet must advance while the core is paused',
    })
    .not.toBe(floorOne.minerAssetFrame);

  const [stillPaused] = await readRenderedFloors(page);

  expect(stillPaused.minerPatrolX, 'a paused core must freeze miner travel').toBe(
    floorOne.minerPatrolX,
  );
  expect(stillPaused.progressLabel, 'a paused core must not extract').toBe('60%');
  expect(stillPaused.progressFillWidth, 'a paused core must not extract').toBe(
    floorOne.progressFillWidth,
  );

  expect(errors).toEqual([]);
});

test('reports a full floor queue while transport is the slowest stage', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const fixture = createTransportLimitedState();

  await bootPausedFixture(page, fixture);

  const floors = await readRenderedFloors(page);
  const [elevator, warehouse] = await readRenderedSharedStages(page);

  // The waiting material is the bottleneck signal: every shaft holds a whole
  // elevator trip. The fixed environmental mound stays gold and visible.
  floors.forEach((floor, index) => {
    const label = `floor ${index + 1}`;

    expect(floor.materialPileSteps, `${label} queue fullness`).toBe(MAX_MATERIAL_PILE_STEPS);
    expect(floor.showsGoldPile, `${label} fixed gold mound`).toBe(true);
    expect(floor.goldPileDisplaySize, `${label} fixed gold mound size`).toBe(52);
    expect(floor.backlogLabel, `${label} backlog overlay`).toBeNull();
    expect(floor.isPileBackedUp, `${label} backlog colour`).toBe(true);
  });

  // Transport itself is working, not stalled, and its indicator follows the
  // authoritative transit progress.
  expect(elevator.statusLabel, 'elevator status').toBe('Returning');
  expect(elevator.showsConveyor, 'elevator conveyor').toBe(true);
  expect(elevator.assetFrame, 'elevator generated animation frame').toBeGreaterThanOrEqual(0);
  expect(
    elevator.progressFillWidth / elevator.progressTrackWidth,
    'elevator transit bar',
  ).toBeCloseTo(fixture.elevator.transitProgress, 5);
  expect(
    elevator.cycleMarkerOffsetPx / elevator.progressTrackWidth,
    'elevator cycle marker',
  ).toBeCloseTo(fixture.elevator.transitProgress, 5);

  // The stage downstream of the bottleneck is starved, not backed up.
  expect(warehouse.queueSteps, 'warehouse queue').toBe(1);
  expect(warehouse.statusLabel, 'warehouse status').toBe('Converting');
  expect(warehouse.isQueueBackedUp, 'warehouse backlog').toBe(false);

  const [pileBottom, pileTop] = await readLogicalPixels(
    page,
    [
      FLOOR_ONE_PILE_BOTTOM_PROBE,
      FLOOR_ONE_PILE_TOP_PROBE,
    ],
  );

  expect(pileBottom, 'a backed-up pile keeps the approved gold asset').not.toBe(MATERIAL_BACKLOG_FILL);
  expect(pileTop, 'a backed-up pile keeps the approved gold asset').not.toBe(MATERIAL_BACKLOG_FILL);
  expect(errors).toEqual([]);
});

test('loads a surface cart beneath the chute and pushes it toward the warehouse', async ({
  page,
}) => {
  await bootPausedFixture(page, createTransportLimitedState());

  type SurfaceHaulerReadBack = {
    surfaceHauler: {
      cartX: number;
      cartWidth: number;
      cartHeight: number;
      cartTexture: string;
      catX: number;
      catFlipX: boolean;
      activeCatCount: number;
      assistants: readonly {
        visible: boolean;
        x: number;
        y: number;
        flipX: boolean;
      }[];
      goldPourVisible: boolean;
    };
  };

  await expect.poll(async () => {
    const animation = await readJsonAttribute<SurfaceHaulerReadBack>(
      page,
      'data-animation',
    );

    return animation.surfaceHauler.goldPourVisible;
  }, {
    message: 'gold pours only when the cart is parked beneath a loaded chute',
    timeout: 6_500,
  }).toBe(true);

  const loading = await readJsonAttribute<SurfaceHaulerReadBack>(
    page,
    'data-animation',
  );

  expect(loading.surfaceHauler.cartX).toBe(SURFACE_HAULER_START_X);
  expect(loading.surfaceHauler.cartWidth).toBe(SURFACE_HAULER_CART_SIZE);
  expect(loading.surfaceHauler.cartHeight).toBe(SURFACE_HAULER_CART_SIZE);
  expect(loading.surfaceHauler.catX).toBeLessThan(loading.surfaceHauler.cartX);
  expect(loading.surfaceHauler.catFlipX).toBe(false);

  await expect.poll(async () => {
    const animation = await readJsonAttribute<SurfaceHaulerReadBack>(
      page,
      'data-animation',
    );

    return animation.surfaceHauler.cartX;
  }, {
    message: 'the filled cart eases from the chute toward the warehouse',
    timeout: 6_500,
  }).toBeGreaterThan(SURFACE_HAULER_START_X + 20);

  const delivering = await readJsonAttribute<SurfaceHaulerReadBack>(
    page,
    'data-animation',
  );

  expect(delivering.surfaceHauler.cartX).toBeLessThanOrEqual(
    SURFACE_HAULER_END_X,
  );
  expect(delivering.surfaceHauler.cartTexture).toBe(
    PLACEHOLDER_TEXTURES.goldContainerFilled,
  );
  expect(delivering.surfaceHauler.cartWidth).toBe(SURFACE_HAULER_CART_SIZE);
  expect(delivering.surfaceHauler.cartHeight).toBe(SURFACE_HAULER_CART_SIZE);
  expect(delivering.surfaceHauler.goldPourVisible).toBe(false);
});

test('adds one visible transport cat at each ten warehouse levels', async ({
  page,
}) => {
  await bootPausedFixture(page, createWarehouseLevelState(20));

  type SurfaceHaulerCrewReadBack = {
    surfaceHauler: {
      catX: number;
      catY: number;
      catFlipX: boolean;
      activeCatCount: number;
      assistants: readonly {
        visible: boolean;
        x: number;
        y: number;
        flipX: boolean;
      }[];
    };
  };

  await expect.poll(async () => {
    const animation = await readJsonAttribute<SurfaceHaulerCrewReadBack>(
      page,
      'data-animation',
    );

    return animation.surfaceHauler.activeCatCount;
  }, {
    message: 'warehouse level 20 reveals the base worker plus two assistants',
  }).toBe(3);

  const animation = await readJsonAttribute<SurfaceHaulerCrewReadBack>(
    page,
    'data-animation',
  );
  const visibleAssistants = animation.surfaceHauler.assistants.filter(
    (assistant) => assistant.visible,
  );

  expect(visibleAssistants).toHaveLength(2);
  expect(new Set(visibleAssistants.map((assistant) => (
    `${assistant.x},${assistant.y}`
  ))).size).toBe(2);
  expect(visibleAssistants.every((assistant) => (
    assistant.x !== animation.surfaceHauler.catX ||
    assistant.y !== animation.surfaceHauler.catY
  ))).toBe(true);
  expect(new Set([
    animation.surfaceHauler.catFlipX,
    ...visibleAssistants.map((assistant) => assistant.flipX),
  ]).size, 'phase-shifted cats may face different route directions').toBe(2);
});

test('stops the enlarged elevator beside the floor gold container', async ({
  page,
}) => {
  const fixture = createTransportLimitedState();

  await bootPausedFixture(page, {
    ...fixture,
    elevator: {
      ...fixture.elevator,
      roundRobinCursor: -1,
      transitProgress: 0,
    },
  });

  const animation = await readJsonAttribute<{
    elevatorCabin: {
      centerY: number;
      width: number;
      height: number;
    };
    elevatorCargoCat: {
      centerY: number;
      width: number;
      height: number;
    };
  }>(page, 'data-animation');
  const floor = calculateFloorSlotRegion(0);
  const expectedStopY = floor.y + FLOOR_PANEL.elevatorStopY;

  expect(animation.elevatorCabin.centerY, 'cabin stop aligns with cart').toBe(
    expectedStopY,
  );
  expect(animation.elevatorCabin.width, 'larger cabin width').toBe(
    MINE_SHAFT_CABIN_SIZE,
  );
  expect(animation.elevatorCabin.height, 'larger cabin height').toBe(
    MINE_SHAFT_CABIN_SIZE,
  );
  expect(animation.elevatorCargoCat.centerY, 'cargo cat follows cabin').toBe(
    expectedStopY + 3,
  );
  expect(animation.elevatorCargoCat.width, 'larger cargo cat width').toBe(
    MINE_SHAFT_CARGO_CAT_SIZE,
  );
});

test('returns through the surface boundary and stops inside the elevator tower', async ({
  page,
}) => {
  await bootPausedFixture(page, createExtractionLimitedState());

  const animation = await readJsonAttribute<{
    elevatorTower: {
      centerX: number;
      centerY: number;
      width: number;
      height: number;
    };
    surfaceElevatorCabin: {
      centerX: number;
      centerY: number;
      width: number;
      height: number;
    };
    warehouseBuilding: {
      centerX: number;
      centerY: number;
      width: number;
      height: number;
    };
    warehouseManager: {
      centerX: number;
      centerY: number;
      width: number;
      height: number;
      frame: number;
      flipX: boolean;
    };
    surfaceLandscape: {
      texture: string;
      centerX: number;
      centerY: number;
      width: number;
      height: number;
    };
  }>(page, 'data-animation');

  expect(animation.elevatorTower, 'generated surface headhouse').toMatchObject({
    centerX: SURFACE_ELEVATOR_TOWER_CENTER_X,
    width: SURFACE_ELEVATOR_TOWER_WIDTH,
    height: SURFACE_ELEVATOR_TOWER_HEIGHT,
  });
  expect(animation.surfaceLandscape, 'blue-sky surface backdrop').toEqual({
    texture: PLACEHOLDER_TEXTURES.surfaceLandscape,
    centerX: 180,
    centerY: 82,
    width: 360,
    height: 164,
  });
  expect(animation.surfaceElevatorCabin, 'cabin rests inside headhouse bay').toMatchObject({
    centerX: SURFACE_ELEVATOR_STOP_X,
    centerY: SURFACE_ELEVATOR_STOP_Y,
    width: MINE_SHAFT_CABIN_SIZE,
    height: MINE_SHAFT_CABIN_SIZE,
  });
  expect(animation.warehouseBuilding, 'generated warehouse replaces the legacy card').toEqual({
    centerX: SURFACE_WAREHOUSE_CENTER_X,
    centerY: SURFACE_WAREHOUSE_CENTER_Y,
    width: SURFACE_WAREHOUSE_WIDTH,
    height: SURFACE_WAREHOUSE_HEIGHT,
  });
  expect(animation.warehouseManager, 'warehouse manager stands at its loading bay').toMatchObject({
    centerX: SURFACE_WAREHOUSE_MANAGER_X,
    centerY: SURFACE_WAREHOUSE_MANAGER_Y,
    width: SURFACE_WAREHOUSE_MANAGER_SIZE,
    height: SURFACE_WAREHOUSE_MANAGER_SIZE,
  });
  expect(animation.warehouseManager.frame).toBeGreaterThanOrEqual(0);
  expect(animation.warehouseManager.frame).toBeLessThan(4);
  expect(animation.warehouseManager.flipX, 'warehouse cat looks toward the elevator').toBe(true);
});

/**
 * The backlog colour is the one production signal carried by pixels alone, so
 * it has to reach the framebuffer under either renderer.
 *
 * It used to be a fill-mode tint, which Phaser implements in WebGL only: on a
 * host that falls back to Canvas the recolour silently did nothing, and every
 * shaft looked clear while the mine was jammed. `Phaser.AUTO` picks the
 * renderer, and `BootScene` reports which one it got, so this run pins the
 * fallback and reads the same pixels the WebGL run does.
 */
test('keeps the approved gold pile under the Canvas renderer', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  await bootPausedFixture(page, createTransportLimitedState(), {
    withoutWebgl: true,
  });

  // Without this the run silently proves nothing: it would be a second WebGL
  // pass asserting what the test above already asserts.
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-renderer',
    'canvas',
  );

  const floors = await readRenderedFloors(page);

  floors.forEach((floor, index) => {
    expect(floor.isPileBackedUp, `floor ${index + 1} backlog colour`).toBe(true);
  });

  const [pileBottom, pileTop, warehouseQueueBlock] = await readLogicalPixels(
    page,
    [
      FLOOR_ONE_PILE_BOTTOM_PROBE,
      FLOOR_ONE_PILE_TOP_PROBE,
      WAREHOUSE_BUILDING_PROBE,
    ],
  );

  expect(pileBottom, 'Canvas keeps the approved gold asset').not.toBe(MATERIAL_BACKLOG_FILL);
  expect(pileTop, 'Canvas keeps the approved gold asset').not.toBe(MATERIAL_BACKLOG_FILL);
  // The stage downstream is not backed up, so it must still be drawn in the
  // artwork's own colours: recolouring everything would say as little as
  // recolouring nothing.
  expect(warehouseQueueBlock, 'Canvas keeps the warehouse artwork').not.toBe(
    MATERIAL_BACKLOG_FILL,
  );
  expect(warehouseQueueBlock, 'the warehouse building must still render').not.toBe(
    PANEL_BACKGROUND,
  );

  expect(errors).toEqual([]);
});

test('shows a full warehouse queue while conversion is the slowest stage', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const fixture = createWarehouseLimitedState();

  await bootPausedFixture(page, fixture);

  const floors = await readRenderedFloors(page);
  const [elevator, warehouse] = await readRenderedSharedStages(page);

  // A faster elevator keeps the queues clear, so no floor claims a backlog.
  floors.forEach((floor, index) => {
    expect(floor.materialPileSteps, `floor ${index + 1} pile`).toBe(1);
    expect(floor.backlogLabel, `floor ${index + 1} backlog`).toBeNull();
    expect(floor.isPileBackedUp, `floor ${index + 1} backlog colour`).toBe(false);
  });

  expect(elevator.statusLabel, 'elevator status').toBe('Collecting');
  expect(elevator.isQueueBackedUp, 'elevator backlog').toBe(false);

  // The backlog has moved to the warehouse input queue.
  expect(warehouse.queueSteps, 'warehouse queue').toBe(MAX_MATERIAL_PILE_STEPS);
  expect(warehouse.statusLabel, 'warehouse status').toBe('Backed up');
  expect(warehouse.isQueueBackedUp, 'warehouse backlog colour').toBe(true);
  expect(
    warehouse.progressFillWidth / warehouse.progressTrackWidth,
    'warehouse conversion bar',
  ).toBeCloseTo(fixture.warehouse.conversionProgress, 5);

  const [warehouseQueueBlock, floorPile] = await readLogicalPixels(page, [
    WAREHOUSE_BUILDING_PROBE,
    FLOOR_ONE_PILE_BOTTOM_PROBE,
  ]);

  expect(warehouseQueueBlock, 'the generated warehouse must remain visible').not.toBe(
    PANEL_BACKGROUND,
  );
  // The two piles must be told apart on screen, or "where the backlog is"
  // would not be readable at all.
  expect(floorPile, 'a clear shaft must keep its generated gold artwork').not.toBe(
    PANEL_BACKGROUND,
  );
  expect(floorPile, 'a clear shaft must not use the backlog treatment').not.toBe(
    MATERIAL_BACKLOG_FILL,
  );

  expect(errors).toEqual([]);
});

/**
 * The decisive check for Step 27: presentation must not decide when production
 * completes.
 *
 * Both runs advance the same fake wall clock by the same amount and settle the
 * core at exactly the same instant. Only the cosmetic animation speed differs,
 * by a factor of twenty. Gold must come out byte-identical while the animation
 * clock must genuinely differ — otherwise the multiplier is wired to nothing
 * and the equality proves nothing.
 */
test('cannot change gold output by changing the animation speed', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const slow = await runAnimationSpeedTrial(page, 1);
  const fast = await runAnimationSpeedTrial(page, 20);

  expect(slow.elapsedMs, 'credited simulation time').toBe(8_000);
  expect(fast.elapsedMs, 'credited simulation time').toBe(slow.elapsedMs);
  expect(Number(slow.gold), 'the session must actually produce gold').toBeGreaterThan(
    Number(BASE_GAME_BALANCE.startingGold),
  );
  expect(fast.gold, 'gold must not depend on animation speed').toBe(slow.gold);

  expect(slow.animationTimeMs, 'the animation clock must run').toBeGreaterThan(0);
  expect(
    fast.animationTimeMs / slow.animationTimeMs,
    'the animation speed multiplier must actually scale motion',
  ).toBeGreaterThan(10);

  expect(errors).toEqual([]);
});

interface AnimationSpeedTrial {
  readonly gold: string;
  readonly elapsedMs: number;
  readonly animationTimeMs: number;
}

/**
 * Boots the real driver and scene without persistence, advances the paused
 * clock by a fixed amount, then settles the core to that exact instant so the
 * result depends on elapsed time alone and not on where frames happened to
 * land.
 */
async function runAnimationSpeedTrial(
  page: Page,
  animationSpeedMultiplier: number,
): Promise<AnimationSpeedTrial> {
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(FIXED_TIME);
  await routeMainModule(
    page,
    `
      import { createGame, MineSimulationDriver } from '/src/game/index.ts';
      import { createInitialGameState } from '/src/core/index.ts';
      import { BASE_GAME_BALANCE } from '/src/config/index.ts';

      const speedMultiplier = Number(
        new URLSearchParams(location.search).get('animationSpeed'),
      );
      const driver = new MineSimulationDriver({
        state: createInitialGameState(BASE_GAME_BALANCE, ${FIXTURE_TIMESTAMP_MS}),
        balance: BASE_GAME_BALANCE,
        now: () => Date.now(),
      });

      createGame(document.querySelector('#game-viewport'), driver, {
        animationSpeedMultiplier: speedMultiplier,
      });

      window.catMineIdleTrial = {
        settle: () => {
          driver.advance();

          return {
            gold: driver.state.gold.serialize(),
            elapsedMs:
              driver.state.lastUpdateTimestampMs - ${FIXTURE_TIMESTAMP_MS},
          };
        },
      };
    `,
  );

  await page.goto(`/?animationSpeed=${animationSpeedMultiplier}`);

  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');

  await page.clock.runFor(8_000);

  const settled = await page.evaluate(() => {
    return (
      window as unknown as {
        catMineIdleTrial: { settle(): { gold: string; elapsedMs: number } };
      }
    ).catMineIdleTrial.settle();
  });
  const animation = await readJsonAttribute<{
    speedMultiplier: number;
    animationTimeMs: number;
  }>(page, 'data-animation');

  expect(animation.speedMultiplier, 'configured animation speed').toBe(
    animationSpeedMultiplier,
  );

  return { ...settled, animationTimeMs: animation.animationTimeMs };
}

/** Seeds one valid version-1 save and boots the real application against it. */
async function bootPausedFixture(
  page: Page,
  state: GameState,
  options: { readonly withoutWebgl?: boolean } = {},
): Promise<void> {
  const saveDocument = createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    FIXTURE_TIMESTAMP_MS,
  );

  await page.clock.install({ time: FIXED_TIME });
  await page.clock.setFixedTime(FIXED_TIME);
  await installPixelProbeSupport(page);

  if (options.withoutWebgl === true) {
    await disableWebgl(page);
  }

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
      await import('/src/main.ts?production-stages-seeded');
    `,
  );

  await page.goto('/');

  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  // A pinned clock leaves no offline interval, so the mine is not covered.
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await waitForRenderedFrame(page);
}

/**
 * The scene publishes its diagnostics inside `create`, before the first frame
 * is presented, so a probe taken immediately after them can sample an empty
 * buffer. Waiting for a point the layout always paints makes every later probe
 * read a real frame.
 */
async function waitForRenderedFrame(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readLogicalPixels(page, [RENDERED_FRAME_PROBE]))[0], {
      message: 'the canvas never presented a frame',
    })
    .toBe(HUD_BACKGROUND);
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

/**
 * Refuses every WebGL context, which is what makes `Phaser.AUTO` fall back to
 * its Canvas renderer — the same thing a blocklisted GPU or an embedded
 * webview does to a real player.
 */
async function disableWebgl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      this: HTMLCanvasElement,
      contextType: string,
      attributes?: unknown,
    ) {
      // `experimental-webgl` included: Phaser's feature detection falls back
      // to that alias, and Chromium still honours it.
      if (contextType.replace('experimental-', '').startsWith('webgl')) {
        return null;
      }

      return originalGetContext.call(this, contextType, attributes);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

async function installPixelProbeSupport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Phaser disables preserveDrawingBuffer for performance, which makes the
    // WebGL canvas read back as transparent black. Forcing it on for the test
    // browser context only lets the pixel probes sample real pixels; it changes
    // whether the buffer is retained, not what is drawn.
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

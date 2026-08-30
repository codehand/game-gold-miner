import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  createInitialGameState,
  GameNumber,
  type GameState,
  type MineFloorState,
} from '../../src/core';
import {
  assertRenderableMineViewModel,
  calculateMaterialPileSteps,
  createMineViewModel,
  formatAmount,
  MAX_MATERIAL_PILE_STEPS,
} from '../../src/game/view-model';

const FIXTURE_TIMESTAMP_MS = 1_700_000_000_000;

/**
 * A known fixture whose floors differ in lock state, level, progress, and
 * queued material, so a view bound to the wrong field cannot pass.
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
      }),
      withFloor(base.floors[1], {
        isUnlocked: true,
        mineShaftLevel: 3,
        extractionProgress: 0.5,
        materialQueue: GameNumber.from(12.5),
      }),
      base.floors[2],
      base.floors[3],
    ],
    elevator: {
      ...base.elevator,
      level: 2,
      capacity: GameNumber.from(50),
      transitProgress: 0.4,
      carriedMaterial: GameNumber.from(20),
    },
    warehouse: {
      ...base.warehouse,
      level: 3,
      capacity: GameNumber.from(60),
      inputQueue: GameNumber.from(30),
      conversionProgress: 0.75,
    },
  };
}

function withFloor(
  floor: MineFloorState,
  overrides: Partial<MineFloorState>,
): MineFloorState {
  return { ...floor, ...overrides };
}

/** Every view model here is derived against the shipped balance data. */
function createViewModel(state: GameState) {
  return createMineViewModel(state, BASE_GAME_BALANCE);
}

describe('mine view model', () => {
  it('mirrors every floor number, level, lock state, and progress value', () => {
    const state = createFixtureState();
    const viewModel = createViewModel(state);

    expect(viewModel.floors).toHaveLength(state.floors.length);

    viewModel.floors.forEach((floor, index) => {
      const source = state.floors[index];

      expect(floor.id).toBe(source.id);
      expect(floor.floorNumber).toBe(source.floorNumber);
      expect(floor.floorLabel).toBe(`Floor ${source.floorNumber}`);
      expect(floor.isUnlocked).toBe(source.isUnlocked);
      expect(floor.mineShaftLevel).toBe(source.mineShaftLevel);
      expect(floor.levelLabel).toBe(`Lv ${source.mineShaftLevel}`);
      expect(floor.extractionProgress).toBe(source.extractionProgress);
      expect(floor.extractionProgressLabel).toBe(
        `${Math.round(source.extractionProgress * 100)}%`,
      );
      expect(floor.materialQueueLabel).toBe(formatAmount(source.materialQueue));
    });

    expect(viewModel.floors.map(({ floorLabel }) => floorLabel)).toEqual([
      'Floor 1',
      'Floor 2',
      'Floor 3',
      'Floor 4',
    ]);
    expect(viewModel.floors.map(({ levelLabel }) => levelLabel)).toEqual([
      'Lv 6',
      'Lv 3',
      'Lv 1',
      'Lv 1',
    ]);
    expect(
      viewModel.floors.map(({ extractionProgressLabel }) => extractionProgressLabel),
    ).toEqual(['25%', '50%', '0%', '0%']);
  });

  it('marks locked floors distinctly and hides their upgrade control', () => {
    const viewModel = createViewModel(createFixtureState());

    expect(viewModel.floors.map(({ statusLabel }) => statusLabel)).toEqual([
      null,
      null,
      'Locked',
      'Locked',
    ]);
    expect(
      viewModel.floors.map(({ upgradeControl }) => upgradeControl === null),
    ).toEqual([false, false, true, true]);
    expect(viewModel.floors[2].materialPileSteps).toBe(0);
    expect(viewModel.floors[2].materialQueueLabel).toBe('0');
  });

  it('offers an upgrade control on every unlocked floor', () => {
    const viewModel = createViewModel(createFixtureState());

    for (const floor of viewModel.floors.filter(({ isUnlocked }) => isUnlocked)) {
      expect(floor.upgradeControl?.actionLabel).toBe('Upgrade');
      expect(floor.upgradeControl?.target).toEqual({
        type: 'mine-shaft',
        floorId: floor.id,
      });
    }
  });

  it('describes the shared elevator and warehouse from authoritative state', () => {
    const state = createFixtureState();
    const viewModel = createViewModel(state);

    expect(viewModel.elevator).toMatchObject({
      id: 'elevator',
      title: 'Elevator',
      level: 2,
      levelLabel: 'Lv 2',
      capacityLabel: 'Cap 50',
      queueLabel: 'Carrying 20',
      progress: 0.4,
      progressLabel: '40%',
    });
    expect(viewModel.elevator.upgradeControl).toMatchObject({
      actionLabel: 'Upgrade',
      target: { type: 'elevator' },
    });
    expect(viewModel.warehouse).toMatchObject({
      id: 'warehouse',
      title: 'Warehouse',
      level: 3,
      levelLabel: 'Lv 3',
      capacityLabel: 'Cap 60',
      queueLabel: 'Queued 30',
      progress: 0.75,
      progressLabel: '75%',
    });
    expect(viewModel.warehouse.upgradeControl).toMatchObject({
      actionLabel: 'Upgrade',
      target: { type: 'warehouse' },
    });
  });

  it('reads a fresh game exactly as the core creates it', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);
    const viewModel = createViewModel(state);

    expect(viewModel.floors.map(({ isUnlocked }) => isUnlocked)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(viewModel.floors.every(({ levelLabel }) => levelLabel === 'Lv 1')).toBe(
      true,
    );
    expect(
      viewModel.floors.every(
        ({ extractionProgressLabel }) => extractionProgressLabel === '0%',
      ),
    ).toBe(true);
    expect(viewModel.elevator.queueLabel).toBe('Carrying 0');
    expect(viewModel.warehouse.queueLabel).toBe('Queued 0');
  });

  it('does not mutate the authoritative snapshot it reads', () => {
    const state = createFixtureState();
    const before = JSON.stringify(state);

    createViewModel(state);

    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects progress values a bar could not represent', () => {
    const state = createFixtureState();

    expect(() =>
      createViewModel({
        ...state,
        floors: [
          withFloor(state.floors[0], { extractionProgress: 1 }),
          ...state.floors.slice(1),
        ],
      }),
    ).toThrow(/progress must be in \[0, 1\)/);
    expect(() =>
      createViewModel({
        ...state,
        warehouse: { ...state.warehouse, conversionProgress: Number.NaN },
      }),
    ).toThrow(/warehouse conversion progress must be in \[0, 1\)/);
  });

  it('rejects levels a control could not display', () => {
    const state = createFixtureState();

    expect(() =>
      createViewModel({
        ...state,
        elevator: { ...state.elevator, level: 0 },
      }),
    ).toThrow(/elevator level must be a positive safe integer/);
  });
});

describe('bottleneck signals', () => {
  it('marks a floor backed up once a whole elevator trip is waiting', () => {
    const state = createFixtureState();
    const viewModel = createViewModel({
      ...state,
      floors: [
        // 40 of a 50 capacity is a full pile; 12.5 is not.
        state.floors[0],
        withFloor(state.floors[1], { materialQueue: GameNumber.from(12.5) }),
        state.floors[2],
        state.floors[3],
      ],
    });

    expect(
      viewModel.floors.map(({ isMaterialBackedUp }) => isMaterialBackedUp),
    ).toEqual([true, false, false, false]);
    expect(viewModel.floors.map(({ backlogLabel }) => backlogLabel)).toEqual([
      'Backed up',
      null,
      null,
      null,
    ]);
    expect(viewModel.floors[0].materialPileSteps).toBe(MAX_MATERIAL_PILE_STEPS);
  });

  it('shows the elevator carrying a load rather than backed up', () => {
    const state = createFixtureState();
    const carrying = createViewModel(state).elevator;
    const idle = createViewModel({
      ...state,
      elevator: {
        ...state.elevator,
        transitProgress: 0,
        carriedMaterial: GameNumber.from(0),
      },
    }).elevator;

    expect(carrying).toMatchObject({
      // 20 of a 50 capacity: a partly loaded car.
      queueSteps: 2,
      isRunning: true,
      // A full car is one full trip, not a backlog: transport pressure shows
      // up as full floor piles, which the elevator itself cannot report.
      isBackedUp: false,
      statusLabel: 'In transit',
    });
    expect(idle).toMatchObject({
      queueSteps: 0,
      isRunning: false,
      isBackedUp: false,
      statusLabel: 'Idle',
    });
  });

  it('shows the warehouse idle, converting, or backed up', () => {
    const state = createFixtureState();
    const readWarehouse = (inputQueue: number, conversionProgress: number) => {
      return createViewModel({
        ...state,
        warehouse: {
          ...state.warehouse,
          inputQueue: GameNumber.from(inputQueue),
          conversionProgress,
        },
      }).warehouse;
    };

    expect(readWarehouse(0, 0)).toMatchObject({
      queueSteps: 0,
      isRunning: false,
      isBackedUp: false,
      statusLabel: 'Idle',
    });
    expect(readWarehouse(15, 0.5)).toMatchObject({
      queueSteps: 2,
      isRunning: true,
      isBackedUp: false,
      statusLabel: 'Converting',
    });
    // 45 of a 60 capacity is a full cycle of input already waiting.
    expect(readWarehouse(45, 0.5)).toMatchObject({
      queueSteps: MAX_MATERIAL_PILE_STEPS,
      isRunning: true,
      isBackedUp: true,
      statusLabel: 'Backed up',
    });
  });

  it('measures each waiting pile against the stage that removes it', () => {
    const state = createFixtureState();
    const viewModel = createViewModel(state);

    // Floor piles measure against the elevator's 50, the warehouse queue
    // against the warehouse's own 60, so the same amount reads differently.
    expect(viewModel.floors[0].materialQueueLabel).toBe('40');
    expect(viewModel.floors[0].materialPileSteps).toBe(4);
    expect(
      createViewModel({
        ...state,
        warehouse: { ...state.warehouse, inputQueue: GameNumber.from(40) },
      }).warehouse.queueSteps,
    ).toBe(3);
  });
});

describe('renderable snapshot guard', () => {
  it('accepts a snapshot with exactly the floor count the screen renders', () => {
    const viewModel = createViewModel(createFixtureState());

    expect(() =>
      assertRenderableMineViewModel(viewModel, viewModel.floors.length),
    ).not.toThrow();
  });

  it('rejects a snapshot the screen would render only partially', () => {
    const viewModel = createViewModel(createFixtureState());

    // Fewer floors than views would leave the surplus views showing blank
    // panels that look like real unlocked floors.
    expect(() =>
      assertRenderableMineViewModel(
        { ...viewModel, floors: viewModel.floors.slice(0, 3) },
        4,
      ),
    ).toThrow(
      'The mine screen renders exactly 4 floors, but the snapshot describes 3.',
    );
    // More floors than views would silently drop the deepest floor.
    expect(() =>
      assertRenderableMineViewModel(
        { ...viewModel, floors: [...viewModel.floors, viewModel.floors[0]] },
        4,
      ),
    ).toThrow(
      'The mine screen renders exactly 4 floors, but the snapshot describes 5.',
    );
  });
});

describe('material pile height', () => {
  const capacity = GameNumber.from(50);

  it('grows with the queue relative to one elevator trip', () => {
    expect(calculateMaterialPileSteps(GameNumber.from(0), capacity)).toBe(0);
    expect(calculateMaterialPileSteps(GameNumber.from(1), capacity)).toBe(1);
    expect(calculateMaterialPileSteps(GameNumber.from(12.5), capacity)).toBe(2);
    expect(calculateMaterialPileSteps(GameNumber.from(25), capacity)).toBe(3);
    expect(calculateMaterialPileSteps(GameNumber.from(37.5), capacity)).toBe(4);
  });

  it('caps at the tallest pile once the elevator is the bottleneck', () => {
    expect(calculateMaterialPileSteps(GameNumber.from(1e12), capacity)).toBe(
      MAX_MATERIAL_PILE_STEPS,
    );
    expect(
      calculateMaterialPileSteps(GameNumber.from(5), GameNumber.from(0)),
    ).toBe(MAX_MATERIAL_PILE_STEPS);
  });
});

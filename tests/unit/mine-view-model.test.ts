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

describe('mine view model', () => {
  it('mirrors every floor number, level, lock state, and progress value', () => {
    const state = createFixtureState();
    const viewModel = createMineViewModel(state);

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
    const viewModel = createMineViewModel(createFixtureState());

    expect(viewModel.floors.map(({ statusLabel }) => statusLabel)).toEqual([
      null,
      null,
      'Locked',
      'Locked',
    ]);
    expect(
      viewModel.floors.map(({ showsUpgradeControl }) => showsUpgradeControl),
    ).toEqual([true, true, false, false]);
    expect(viewModel.floors[2].materialPileSteps).toBe(0);
    expect(viewModel.floors[2].materialQueueLabel).toBe('0');
  });

  it('offers an upgrade control on every unlocked floor', () => {
    const viewModel = createMineViewModel(createFixtureState());

    for (const floor of viewModel.floors.filter(({ isUnlocked }) => isUnlocked)) {
      expect(floor.showsUpgradeControl).toBe(true);
      expect(floor.upgradeControlLabel).toBe('Upgrade');
    }
  });

  it('describes the shared elevator and warehouse from authoritative state', () => {
    const state = createFixtureState();
    const viewModel = createMineViewModel(state);

    expect(viewModel.elevator).toMatchObject({
      id: 'elevator',
      title: 'Elevator',
      level: 2,
      levelLabel: 'Lv 2',
      capacityLabel: 'Cap 50',
      queueLabel: 'Carrying 20',
      progress: 0.4,
      progressLabel: '40%',
      upgradeControlLabel: 'Upgrade',
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
      upgradeControlLabel: 'Upgrade',
    });
  });

  it('reads a fresh game exactly as the core creates it', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);
    const viewModel = createMineViewModel(state);

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

    createMineViewModel(state);

    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects progress values a bar could not represent', () => {
    const state = createFixtureState();

    expect(() =>
      createMineViewModel({
        ...state,
        floors: [
          withFloor(state.floors[0], { extractionProgress: 1 }),
          ...state.floors.slice(1),
        ],
      }),
    ).toThrow(/progress must be in \[0, 1\)/);
    expect(() =>
      createMineViewModel({
        ...state,
        warehouse: { ...state.warehouse, conversionProgress: Number.NaN },
      }),
    ).toThrow(/warehouse conversion progress must be in \[0, 1\)/);
  });

  it('rejects levels a control could not display', () => {
    const state = createFixtureState();

    expect(() =>
      createMineViewModel({
        ...state,
        elevator: { ...state.elevator, level: 0 },
      }),
    ).toThrow(/elevator level must be a positive safe integer/);
  });
});

describe('renderable snapshot guard', () => {
  it('accepts a snapshot with exactly the floor count the screen renders', () => {
    const viewModel = createMineViewModel(createFixtureState());

    expect(() =>
      assertRenderableMineViewModel(viewModel, viewModel.floors.length),
    ).not.toThrow();
  });

  it('rejects a snapshot the screen would render only partially', () => {
    const viewModel = createMineViewModel(createFixtureState());

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

describe('provisional amount display', () => {
  it('rounds ordinary amounts to one decimal place', () => {
    expect(formatAmount(GameNumber.from(0))).toBe('0');
    expect(formatAmount(GameNumber.from(40))).toBe('40');
    expect(formatAmount(GameNumber.from(12.5))).toBe('12.5');
    expect(formatAmount(GameNumber.from(12.34))).toBe('12.3');
  });

  it('keeps very large amounts serialized until Step 28 abbreviates them', () => {
    expect(formatAmount(GameNumber.from('1e30'))).toBe('1e+30');
  });
});

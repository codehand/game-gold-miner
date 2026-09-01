import { describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateElevatorUpgradeCost,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  createInitialGameState,
  describeFloorUnlock,
  GameNumber,
  type GameState,
} from '../../src/core';
// Imported from the runtime barrel rather than `src/game`, whose barrel loads
// Phaser: the driver is deliberately renderer-free so Node can command it.
import { MineSimulationDriver } from '../../src/game/runtime';
import {
  createMineViewModel,
  createUpgradeControlViewModel,
  createPurchaseFeedback,
  describePurchaseFeedback,
  formatAmount,
  purchaseTargetKey,
  PURCHASE_FEEDBACK_DURATION_MS,
  type MineViewModel,
  type PurchaseOutcome,
} from '../../src/game/view-model';

const FIXTURE_TIMESTAMP_MS = 1_700_000_000_000;

function createState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS),
    ...overrides,
  };
}

function createViewModel(state: GameState): MineViewModel {
  return createMineViewModel(state, BASE_GAME_BALANCE);
}

/** A mine whose floor-1 shaft and balance decide floor 2's unlock gates. */
function createUnlockState(mineShaftLevel: number, gold: number): GameState {
  return createState({
    gold: GameNumber.from(gold),
    floors: createState().floors.map((floor, index) => {
      return index === 0 ? { ...floor, mineShaftLevel } : floor;
    }),
  });
}

/** Floor 2's unlock price, read from the same place the command charges it. */
function unlockCost(state: GameState): GameNumber {
  const availability = describeFloorUnlock(state, 'floor-2', BASE_GAME_BALANCE);

  if (availability === null) {
    throw new Error('Floor 2 is already open in this fixture.');
  }

  return availability.cost;
}

/** A driver on a frozen clock, so nothing but a command can change state. */
function createPausedDriver(
  state: GameState,
  onCommandApplied?: () => void,
): MineSimulationDriver {
  return new MineSimulationDriver({
    state,
    balance: BASE_GAME_BALANCE,
    now: () => state.lastUpdateTimestampMs,
    onCommandApplied,
  });
}

describe('purchase control view model', () => {
  it('prices every control through the same cost the command charges', () => {
    const state = createState({ gold: GameNumber.from(10_000) });
    const viewModel = createViewModel(state);

    state.floors.forEach((floor, index) => {
      const control = viewModel.floors[index].upgradeControl;

      if (!floor.isUnlocked) {
        expect(control, `floor ${floor.floorNumber} is locked`).toBeNull();
        return;
      }

      expect(control?.costLabel, `floor ${floor.floorNumber} price`).toBe(
        formatAmount(
          calculateMineShaftUpgradeCost(floor, BASE_GAME_BALANCE.floors[index]),
        ),
      );
    });

    expect(viewModel.elevator.upgradeControl.costLabel).toBe(
      formatAmount(
        calculateElevatorUpgradeCost(state.elevator, BASE_GAME_BALANCE.elevator),
      ),
    );
    expect(viewModel.warehouse.upgradeControl.costLabel).toBe(
      formatAmount(
        calculateWarehouseUpgradeCost(
          state.warehouse,
          BASE_GAME_BALANCE.warehouse,
        ),
      ),
    );
  });

  it('abbreviates a price past the safe integer range', () => {
    const state = createState({
      gold: GameNumber.from('1e30'),
      floors: createState().floors.map((floor, index) => {
        return index === 0 ? { ...floor, mineShaftLevel: 120 } : floor;
      }),
    });
    const control = createViewModel(state).floors[0].upgradeControl;

    expect(control?.costLabel).toBe(
      formatAmount(
        calculateMineShaftUpgradeCost(state.floors[0], BASE_GAME_BALANCE.floors[0]),
      ),
    );
    // Level 120 at a 1.15 growth rate is well past a plain numeral.
    expect(control?.costLabel).toMatch(/^[\d.]+(?:k|m|b|t)$/);
  });

  it('affords a control at exactly its price, and not one unit below', () => {
    const cost = GameNumber.from(250);
    const target = { type: 'elevator' } as const;

    expect(
      createUpgradeControlViewModel(target, cost, cost).isEnabled,
      'exactly enough gold buys the level',
    ).toBe(true);
    expect(
      createUpgradeControlViewModel(target, cost, GameNumber.from(249.999))
        .isEnabled,
    ).toBe(false);
    expect(
      createUpgradeControlViewModel(target, cost, GameNumber.from(251))
        .isEnabled,
    ).toBe(true);
  });

  it('marks controls enabled only from the current balance', () => {
    const poor = createViewModel(createState({ gold: GameNumber.from(0) }));
    const rich = createViewModel(createState({ gold: GameNumber.from(1e9) }));

    expect(poor.floors[0].upgradeControl?.isEnabled).toBe(false);
    expect(poor.elevator.upgradeControl.isEnabled).toBe(false);
    expect(poor.warehouse.upgradeControl.isEnabled).toBe(false);
    expect(rich.floors[0].upgradeControl?.isEnabled).toBe(true);
    expect(rich.elevator.upgradeControl.isEnabled).toBe(true);
    expect(rich.warehouse.upgradeControl.isEnabled).toBe(true);
  });

  it('gives every control a distinct key and its own command target', () => {
    const viewModel = createViewModel(createState());
    const controls = [
      ...viewModel.floors.map(({ upgradeControl }) => upgradeControl),
      viewModel.elevator.upgradeControl,
      viewModel.warehouse.upgradeControl,
    ].filter((control) => control !== null);
    const keys = controls.map(({ key }) => key);

    expect(new Set(keys).size, 'keys must be unique').toBe(keys.length);
    keys.forEach((key, index) => {
      expect(key).toBe(purchaseTargetKey(controls[index].target));
    });
    expect(purchaseTargetKey({ type: 'mine-shaft', floorId: 'floor-1' })).not.toBe(
      purchaseTargetKey({ type: 'mine-shaft', floorId: 'floor-2' }),
    );
  });
});

describe('floor unlock control view model', () => {
  it('prices the unlock through the same description the command charges', () => {
    const state = createUnlockState(5, 5_000);
    const control = createViewModel(state).floors[1].unlockControl;

    expect(control).toMatchObject({
      actionLabel: 'Unlock',
      costLabel: formatAmount(unlockCost(state)),
      key: 'floor-unlock:floor-2',
      target: { type: 'floor-unlock', floorId: 'floor-2' },
      isEnabled: true,
    });
  });

  it('stays disabled until both the requirement and the price are satisfied', () => {
    const cases = [
      { mineShaftLevel: 4, gold: 5_000, isEnabled: false },
      { mineShaftLevel: 5, gold: 249, isEnabled: false },
      { mineShaftLevel: 4, gold: 0, isEnabled: false },
      { mineShaftLevel: 5, gold: 250, isEnabled: true },
    ] as const;

    for (const { mineShaftLevel, gold, isEnabled } of cases) {
      const viewModel = createViewModel(createUnlockState(mineShaftLevel, gold));

      expect(
        viewModel.floors[1].unlockControl?.isEnabled,
        `level ${mineShaftLevel} with ${gold} gold`,
      ).toBe(isEnabled);
    }
  });

  it('names the gate a locked floor is waiting on', () => {
    const gated = createViewModel(createUnlockState(4, 5_000)).floors[1];
    const ready = createViewModel(createUnlockState(5, 5_000)).floors[1];

    expect(gated.unlockRequirementLabel).toBe('Needs Floor 1 Lv 5');
    expect(gated.isUnlockRequirementMet).toBe(false);
    // The label stays visible once the gate is passed, but reads as satisfied,
    // so a player who is only short of gold is not told to keep upgrading.
    expect(ready.unlockRequirementLabel).toBe('Needs Floor 1 Lv 5');
    expect(ready.isUnlockRequirementMet).toBe(true);
  });

  it('gives every floor exactly one control, and never the same key twice', () => {
    const viewModel = createViewModel(createUnlockState(5, 5_000));
    const keys = viewModel.floors.flatMap((floor) => {
      expect(
        floor.upgradeControl === null,
        `floor ${floor.floorNumber} offers one purchase`,
      ).toBe(floor.unlockControl !== null);

      return [floor.upgradeControl?.key, floor.unlockControl?.key].filter(
        (key) => key !== undefined,
      );
    });

    expect(keys).toEqual([
      'mine-shaft:floor-1',
      'floor-unlock:floor-2',
      'floor-unlock:floor-3',
      'floor-unlock:floor-4',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('replaces the unlock control with an upgrade control once the floor opens', () => {
    const driver = createPausedDriver(createUnlockState(5, 5_000));

    expect(driver.purchase({ type: 'floor-unlock', floorId: 'floor-2' })).toBe(
      'unlocked',
    );

    const floor = driver.snapshot.floors[1];

    expect(floor.unlockControl, 'nothing left to unlock').toBeNull();
    expect(floor.unlockRequirementLabel).toBeNull();
    expect(floor.upgradeControl?.target).toEqual({
      type: 'mine-shaft',
      floorId: 'floor-2',
    });
  });
});

describe('purchase press feedback', () => {
  it('labels each outcome and marks only a completed purchase positive', () => {
    const at = (outcome: PurchaseOutcome) => {
      return describePurchaseFeedback(createPurchaseFeedback(outcome, 1_000), 1_000);
    };

    expect(at('purchased')).toEqual({ label: 'Upgraded!', isPositive: true });
    expect(at('unlocked')).toEqual({ label: 'Unlocked!', isPositive: true });
    expect(at('insufficient-funds')).toEqual({
      label: 'Need more gold',
      isPositive: false,
    });
    expect(at('requirement-not-met')).toEqual({
      label: 'Level too low',
      isPositive: false,
    });
    expect(at('unavailable')).toEqual({
      label: 'Unavailable',
      isPositive: false,
    });
  });

  it('shows a result until it expires, then clears itself', () => {
    const feedback = createPurchaseFeedback('purchased', 1_000);
    const lastVisibleMs = 1_000 + PURCHASE_FEEDBACK_DURATION_MS - 1;

    expect(describePurchaseFeedback(feedback, 1_000)).not.toBeNull();
    expect(describePurchaseFeedback(feedback, lastVisibleMs)).not.toBeNull();
    expect(
      describePurchaseFeedback(feedback, lastVisibleMs + 1),
      'the result must not outlive its duration',
    ).toBeNull();
    expect(describePurchaseFeedback(null, 1_000)).toBeNull();
  });

  it('clears a result the clock has moved behind', () => {
    const feedback = createPurchaseFeedback('purchased', 1_000);

    // Falling back to the live price is safer than pinning a stale result.
    expect(describePurchaseFeedback(feedback, 999)).toBeNull();
    expect(describePurchaseFeedback(feedback, Number.NaN)).toBeNull();
  });

  it('rejects a result stamped with an unusable clock reading', () => {
    expect(() => createPurchaseFeedback('purchased', Number.NaN)).toThrow(
      /finite presentation timestamp/,
    );
  });
});

describe('purchase commands through the driver', () => {
  it('buys a mine shaft once, deducting exactly the displayed price', () => {
    const state = createState({ gold: GameNumber.from(1_000) });
    const driver = createPausedDriver(state);
    const before = driver.snapshot.floors[0].upgradeControl;
    const cost = calculateMineShaftUpgradeCost(
      state.floors[0],
      BASE_GAME_BALANCE.floors[0],
    );

    expect(driver.purchase({ type: 'mine-shaft', floorId: 'floor-1' })).toBe(
      'purchased',
    );

    expect(driver.state.floors[0].mineShaftLevel).toBe(
      state.floors[0].mineShaftLevel + 1,
    );
    expect(driver.state.gold.equals(state.gold.subtract(cost))).toBe(true);
    // Only the bought floor moves: a command must not touch its neighbours.
    expect(driver.state.floors.slice(1)).toEqual(state.floors.slice(1));

    const after = driver.snapshot.floors[0].upgradeControl;

    expect(after?.costLabel, 'the button price must follow the new level').not.toBe(
      before?.costLabel,
    );
    expect(after?.costLabel).toBe(
      formatAmount(
        calculateMineShaftUpgradeCost(
          driver.state.floors[0],
          BASE_GAME_BALANCE.floors[0],
        ),
      ),
    );
  });

  it('buys the shared elevator and warehouse through their own commands', () => {
    const state = createState({ gold: GameNumber.from(1_000) });
    const driver = createPausedDriver(state);

    expect(driver.purchase({ type: 'elevator' })).toBe('purchased');
    expect(driver.purchase({ type: 'warehouse' })).toBe('purchased');

    expect(driver.state.elevator.level).toBe(state.elevator.level + 1);
    expect(driver.state.warehouse.level).toBe(state.warehouse.level + 1);
    expect(
      driver.state.elevator.capacity.greaterThan(state.elevator.capacity),
      'an elevator upgrade must widen the stage',
    ).toBe(true);
    expect(
      driver.state.warehouse.capacity.greaterThan(state.warehouse.capacity),
    ).toBe(true);
    expect(
      driver.state.gold.equals(
        state.gold
          .subtract(
            calculateElevatorUpgradeCost(
              state.elevator,
              BASE_GAME_BALANCE.elevator,
            ),
          )
          .subtract(
            calculateWarehouseUpgradeCost(
              state.warehouse,
              BASE_GAME_BALANCE.warehouse,
            ),
          ),
      ),
    ).toBe(true);
  });

  it('refuses an unaffordable purchase without changing anything', () => {
    const state = createState({ gold: GameNumber.from(1) });
    const driver = createPausedDriver(state);
    const before = driver.snapshot;

    expect(driver.purchase({ type: 'mine-shaft', floorId: 'floor-1' })).toBe(
      'insufficient-funds',
    );
    expect(driver.purchase({ type: 'elevator' })).toBe(
      'insufficient-funds',
    );
    expect(driver.purchase({ type: 'warehouse' })).toBe(
      'insufficient-funds',
    );

    expect(driver.state.gold.equals(state.gold)).toBe(true);
    expect(driver.state.floors[0].mineShaftLevel).toBe(
      state.floors[0].mineShaftLevel,
    );
    expect(driver.state.elevator.level).toBe(state.elevator.level);
    expect(driver.state.warehouse.level).toBe(state.warehouse.level);
    // A refusal derives no new snapshot, so the scene skips rebinding entirely.
    expect(driver.snapshot).toBe(before);
  });

  it('refuses a shaft on a locked floor', () => {
    const driver = createPausedDriver(createState({ gold: GameNumber.from(1e9) }));

    expect(driver.purchase({ type: 'mine-shaft', floorId: 'floor-4' })).toBe(
      'unavailable',
    );
    expect(driver.state.floors[3].mineShaftLevel).toBe(
      BASE_GAME_BALANCE.floors[3].startingLevel,
    );
  });

  it('charges against the gold the mine has now, not the last rendered frame', () => {
    const state = createState({ gold: GameNumber.from(0) });
    let nowMs = state.lastUpdateTimestampMs;
    const driver = new MineSimulationDriver({
      state,
      balance: BASE_GAME_BALANCE,
      now: () => nowMs,
    });

    expect(driver.snapshot.floors[0].upgradeControl?.isEnabled).toBe(false);

    // No frame is pulled: the mine runs while the player's finger is moving,
    // and the purchase must see that gold.
    nowMs += 60_000;

    expect(driver.purchase({ type: 'mine-shaft', floorId: 'floor-1' })).toBe(
      'purchased',
    );
    expect(driver.state.floors[0].mineShaftLevel).toBe(2);
    expect(driver.state.gold.greaterThan(0)).toBe(true);
  });

  it('opens one floor, deducting exactly the displayed price', () => {
    const state = createUnlockState(5, 5_000);
    const cost = unlockCost(state);
    const onCommandApplied = vi.fn();
    const driver = createPausedDriver(state, onCommandApplied);

    expect(driver.snapshot.floors[1].unlockControl?.costLabel).toBe(
      formatAmount(cost),
    );
    expect(driver.purchase({ type: 'floor-unlock', floorId: 'floor-2' })).toBe(
      'unlocked',
    );

    expect(driver.state.floors[1].isUnlocked).toBe(true);
    expect(driver.state.floors[1].mineShaftLevel).toBe(
      BASE_GAME_BALANCE.floors[1].startingLevel,
    );
    expect(driver.state.gold.equals(state.gold.subtract(cost))).toBe(true);
    // The floors either side of it are untouched, and floor 3 is still gated.
    expect(driver.state.floors[0]).toEqual(state.floors[0]);
    expect(driver.state.floors[2].isUnlocked).toBe(false);
    expect(onCommandApplied).toHaveBeenCalledTimes(1);

    // A second press cannot open it again or charge for it again.
    expect(driver.purchase({ type: 'floor-unlock', floorId: 'floor-2' })).toBe(
      'unavailable',
    );
    expect(driver.state.gold.equals(state.gold.subtract(cost))).toBe(true);
    expect(onCommandApplied).toHaveBeenCalledTimes(1);
  });

  it('names which gate refused an unlock, and changes nothing', () => {
    const gated = createPausedDriver(createUnlockState(4, 5_000));
    const gatedBefore = gated.snapshot;

    expect(gated.purchase({ type: 'floor-unlock', floorId: 'floor-2' })).toBe(
      'requirement-not-met',
    );
    expect(gated.state.floors[1].isUnlocked).toBe(false);
    expect(gated.state.gold.equals(5_000)).toBe(true);
    // A refusal derives no new snapshot, so the scene skips rebinding entirely.
    expect(gated.snapshot).toBe(gatedBefore);

    const broke = createPausedDriver(createUnlockState(5, 100));

    expect(broke.purchase({ type: 'floor-unlock', floorId: 'floor-2' })).toBe(
      'insufficient-funds',
    );
    expect(broke.state.floors[1].isUnlocked).toBe(false);
    expect(broke.state.gold.equals(100)).toBe(true);
  });

  it('reports an applied command once, and never a refused one', () => {
    const onCommandApplied = vi.fn();
    // Exactly one upgrade's worth of gold, derived through the same cost
    // function the command charges.
    const driver = createPausedDriver(
      createState({
        gold: calculateMineShaftUpgradeCost(
          createState().floors[0],
          BASE_GAME_BALANCE.floors[0],
        ),
      }),
      onCommandApplied,
    );

    expect(driver.purchase({ type: 'mine-shaft', floorId: 'floor-1' })).toBe(
      'purchased',
    );
    expect(onCommandApplied).toHaveBeenCalledTimes(1);

    // The first purchase spent the balance, so the second is refused.
    expect(driver.purchase({ type: 'mine-shaft', floorId: 'floor-1' })).toBe(
      'insufficient-funds',
    );
    expect(onCommandApplied).toHaveBeenCalledTimes(1);
  });
});

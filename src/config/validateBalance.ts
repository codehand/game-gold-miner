import type {
  BaseGameBalanceConfig,
  MilestoneConfig,
  SharedStageConfig,
  UpgradeConfig,
} from './types';

const REQUIRED_MILESTONES = [
  { level: 10, multiplier: 2 },
  { level: 25, multiplier: 2 },
  { level: 50, multiplier: 3 },
  { level: 100, multiplier: 4 },
] as const satisfies readonly MilestoneConfig[];

export function validateBaseGameBalance(
  config: BaseGameBalanceConfig,
): void {
  assertNonNegativeFinite(config.startingGold, 'startingGold');

  if (config.floors.length !== 4) {
    throw new Error('Balance config must define exactly four floors.');
  }

  const floorIds = new Set<string>();

  config.floors.forEach((floor, index) => {
    const label = `floors[${index}]`;

    if (floorIds.has(floor.id)) {
      throw new Error(`Balance config contains duplicate floor id ${floor.id}.`);
    }
    floorIds.add(floor.id);

    assertPositiveInteger(floor.floorNumber, `${label}.floorNumber`);
    if (floor.floorNumber !== index + 1) {
      throw new Error('Floor numbers must be ordered sequentially from one.');
    }

    assertPositiveInteger(floor.startingLevel, `${label}.startingLevel`);
    assertPositiveFinite(floor.baseYield, `${label}.baseYield`);
    assertPositiveFinite(floor.cycleDurationMs, `${label}.cycleDurationMs`);
    assertNonNegativeFinite(floor.unlockCost, `${label}.unlockCost`);
    validateUpgrade(floor.upgrade, `${label}.upgrade`);

    if (index === 0) {
      if (!floor.startingUnlocked || floor.unlockRequirement !== null) {
        throw new Error('Floor one must start unlocked without a requirement.');
      }
      return;
    }

    const previousFloor = config.floors[index - 1];
    const requirement = floor.unlockRequirement;

    if (floor.startingUnlocked || requirement === null) {
      throw new Error('Only floor one may start unlocked.');
    }
    if (requirement.floorId !== previousFloor.id) {
      throw new Error(`${label} must require the immediately previous floor.`);
    }
    assertPositiveInteger(requirement.level, `${label}.unlockRequirement.level`);
  });

  validateSharedStage(config.elevator, 'elevator');
  validateSharedStage(config.warehouse, 'warehouse');
  assertPositiveSafeInteger(
    config.offlineIncome.capDurationMs,
    'offlineIncome.capDurationMs',
  );
  assertUnitInterval(
    config.offlineIncome.efficiency,
    'offlineIncome.efficiency',
  );

  if (config.elevator.id !== 'elevator') {
    throw new Error('Elevator config must use the elevator identifier.');
  }
  if (config.warehouse.id !== 'warehouse') {
    throw new Error('Warehouse config must use the warehouse identifier.');
  }
}

function validateSharedStage(stage: SharedStageConfig, label: string): void {
  assertPositiveInteger(stage.startingLevel, `${label}.startingLevel`);
  assertPositiveFinite(stage.baseCapacity, `${label}.baseCapacity`);
  assertPositiveFinite(stage.cycleDurationMs, `${label}.cycleDurationMs`);
  validateUpgrade(stage.upgrade, `${label}.upgrade`);
}

function validateUpgrade(upgrade: UpgradeConfig, label: string): void {
  assertPositiveFinite(upgrade.baseCost, `${label}.baseCost`);
  assertGreaterThanOne(upgrade.costGrowthRate, `${label}.costGrowthRate`);
  assertGreaterThanOne(upgrade.outputGrowthRate, `${label}.outputGrowthRate`);

  if (upgrade.milestones.length !== REQUIRED_MILESTONES.length) {
    throw new Error(`${label}.milestones must contain the required schedule.`);
  }

  upgrade.milestones.forEach((milestone, index) => {
    const required = REQUIRED_MILESTONES[index];

    if (
      milestone.level !== required.level ||
      milestone.multiplier !== required.multiplier
    ) {
      throw new Error(
        `${label}.milestones must be ordered 10/25/50/100 with x2/x2/x3/x4 multipliers.`,
      );
    }
  });
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function assertGreaterThanOne(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 1) {
    throw new Error(`${label} must be a finite number greater than one.`);
  }
}

function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number from zero to one.`);
  }
}

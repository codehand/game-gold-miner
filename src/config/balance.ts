import type {
  BaseGameBalanceConfig,
  MilestoneConfig,
  UpgradeConfig,
} from './types';

const MILESTONES = [
  { level: 10, multiplier: 2 },
  { level: 25, multiplier: 2 },
  { level: 50, multiplier: 3 },
  { level: 100, multiplier: 4 },
] as const satisfies readonly MilestoneConfig[];

function upgrade(
  baseCost: number,
  outputGrowthRate: number,
): UpgradeConfig {
  return {
    baseCost,
    costGrowthRate: 1.15,
    outputGrowthRate,
    milestones: MILESTONES,
  };
}

export const BASE_GAME_BALANCE = {
  startingGold: 100,
  floors: [
    {
      id: 'floor-1',
      floorNumber: 1,
      startingUnlocked: true,
      startingLevel: 1,
      baseYield: 10,
      cycleDurationMs: 2_000,
      unlockCost: 0,
      unlockRequirement: null,
      upgrade: upgrade(25, 1.1),
    },
    {
      id: 'floor-2',
      floorNumber: 2,
      startingUnlocked: false,
      startingLevel: 1,
      baseYield: 30,
      cycleDurationMs: 2_500,
      unlockCost: 250,
      unlockRequirement: { floorId: 'floor-1', level: 5 },
      upgrade: upgrade(75, 1.1),
    },
    {
      id: 'floor-3',
      floorNumber: 3,
      startingUnlocked: false,
      startingLevel: 1,
      baseYield: 90,
      cycleDurationMs: 3_000,
      unlockCost: 1_500,
      unlockRequirement: { floorId: 'floor-2', level: 5 },
      upgrade: upgrade(225, 1.1),
    },
    {
      id: 'floor-4',
      floorNumber: 4,
      startingUnlocked: false,
      startingLevel: 1,
      baseYield: 270,
      cycleDurationMs: 3_500,
      unlockCost: 7_500,
      unlockRequirement: { floorId: 'floor-3', level: 7 },
      upgrade: upgrade(675, 1.1),
    },
  ],
  elevator: {
    id: 'elevator',
    startingLevel: 1,
    baseCapacity: 50,
    cycleDurationMs: 1_500,
    upgrade: upgrade(100, 1.12),
  },
  warehouse: {
    id: 'warehouse',
    startingLevel: 1,
    baseCapacity: 60,
    cycleDurationMs: 1_200,
    upgrade: upgrade(120, 1.12),
  },
  offlineIncome: {
    capDurationMs: 2 * 60 * 60 * 1_000,
    efficiency: 0.5,
  },
} as const satisfies BaseGameBalanceConfig;

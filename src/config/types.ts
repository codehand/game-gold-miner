export interface MilestoneConfig {
  readonly level: number;
  readonly multiplier: number;
}

export interface UpgradeConfig {
  readonly baseCost: number;
  readonly costGrowthRate: number;
  readonly outputGrowthRate: number;
  readonly milestones: readonly MilestoneConfig[];
}

export interface UnlockRequirement {
  readonly floorId: string;
  readonly level: number;
}

export interface MineFloorConfig {
  readonly id: string;
  readonly floorNumber: number;
  readonly startingUnlocked: boolean;
  readonly startingLevel: number;
  readonly baseYield: number;
  readonly cycleDurationMs: number;
  readonly unlockCost: number;
  readonly unlockRequirement: UnlockRequirement | null;
  readonly upgrade: UpgradeConfig;
}

export interface SharedStageConfig {
  readonly id: 'elevator' | 'warehouse';
  readonly startingLevel: number;
  readonly baseCapacity: number;
  readonly cycleDurationMs: number;
  readonly upgrade: UpgradeConfig;
}

export interface BaseGameBalanceConfig {
  readonly startingGold: number;
  readonly floors: readonly MineFloorConfig[];
  readonly elevator: SharedStageConfig;
  readonly warehouse: SharedStageConfig;
}

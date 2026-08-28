import type { MilestoneConfig, UpgradeConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';

export function calculateLevelEffect(
  baseValue: number,
  level: number,
  upgrade: UpgradeConfig,
): GameNumber {
  validateLevel(level);

  return GameNumber.from(baseValue)
    .multiply(integerPower(upgrade.outputGrowthRate, level - 1))
    .multiply(calculateMilestoneMultiplier(level, upgrade.milestones));
}

export function calculateMilestoneMultiplier(
  level: number,
  milestones: readonly MilestoneConfig[],
): GameNumber {
  validateLevel(level);

  return milestones.reduce((multiplier, milestone) => {
    return level >= milestone.level
      ? multiplier.multiply(milestone.multiplier)
      : multiplier;
  }, GameNumber.from(1));
}

function integerPower(base: number, exponent: number): GameNumber {
  let result = GameNumber.from(1);
  let factor = GameNumber.from(base);
  let remainingExponent = exponent;

  while (remainingExponent > 0) {
    if (remainingExponent % 2 === 1) {
      result = result.multiply(factor);
    }

    remainingExponent = Math.floor(remainingExponent / 2);

    if (remainingExponent > 0) {
      factor = factor.multiply(factor);
    }
  }

  return result;
}

function validateLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new Error('Effect level must be a positive safe integer.');
  }
}

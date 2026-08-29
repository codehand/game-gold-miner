/**
 * Pure HUD snapshot.
 *
 * The fixed top HUD carries the two numbers the whole screen is about: what
 * the player can spend, and how fast the mine is actually earning. Both labels
 * and both values are derived here, so they are unit-testable in Node and the
 * scene only paints strings it is handed.
 */

import type { BaseGameBalanceConfig } from '../../config';
import { calculateMineProductionRates, type GameState } from '../../core';
import { formatAmount } from './formatAmount';

export interface HudViewModel {
  /** English caption above the spendable balance. */
  readonly goldLabel: string;
  readonly goldValueLabel: string;
  /** English caption above the mine's estimated earnings per second. */
  readonly incomeLabel: string;
  readonly incomeValueLabel: string;
}

export function createHudViewModel(
  state: GameState,
  balance: BaseGameBalanceConfig,
): HudViewModel {
  const rates = calculateMineProductionRates(state, balance);

  return {
    goldLabel: 'Gold',
    goldValueLabel: formatAmount(state.gold),
    incomeLabel: 'Income /s',
    // The effective rate, already capped at the chain's slowest stage, so the
    // HUD estimates what the mine can deliver rather than what the shafts
    // could extract if transport and conversion were free.
    incomeValueLabel: formatAmount(rates.effectiveProductionPerSecond),
  };
}

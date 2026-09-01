/**
 * Pure HUD snapshot.
 *
 * The fixed top HUD carries the two numbers the whole screen is about: what
 * the player can spend, and how fast the mine is actually earning. The icon
 * supplies each number's meaning, so the review-approved HUD omits captions.
 */

import type { BaseGameBalanceConfig } from '../../config';
import { calculateMineProductionRates, type GameState } from '../../core';
import { formatAmount } from './formatAmount';

export interface HudViewModel {
  /** Empty after the icon-only Step 32A HUD review. */
  readonly goldLabel: string;
  readonly goldValueLabel: string;
  /** Empty after the icon-only Step 32A HUD review. */
  readonly incomeLabel: string;
  readonly incomeValueLabel: string;
}

export function createHudViewModel(
  state: GameState,
  balance: BaseGameBalanceConfig,
): HudViewModel {
  const rates = calculateMineProductionRates(state, balance);

  return {
    goldLabel: '',
    goldValueLabel: formatAmount(state.gold),
    incomeLabel: '',
    // The effective rate, already capped at the chain's slowest stage, so the
    // HUD estimates what the mine can deliver rather than what the shafts
    // could extract if transport and conversion were free.
    incomeValueLabel: formatAmount(rates.effectiveProductionPerSecond),
  };
}

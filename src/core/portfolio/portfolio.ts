import { getMineBalance, getMineSite, type MineSiteId } from '../../config';
import {
  EMPTY_CAT_PRODUCTION_MODIFIERS,
  type CatProductionModifiers,
} from '../cats';
import { calculateMineProductionRates } from '../economy/calculateProductionRates';
import { EMPTY_BOOST_STATE, type BoostState } from '../boost/boost';
import { GameNumber } from '../numbers/GameNumber';
import { calculateOfflineGrant, type OfflineGrant } from '../offline-income/calculateOfflineGrant';
import { catchUpSimulation } from '../simulation/catchUpSimulation';
import type { GameState } from '../state/GameState';
import { createInitialGameState } from '../state/createInitialGameState';

export type MineProgressState = Omit<GameState, 'gold'>;

export interface MineOfflineInterval {
  readonly sequence: number;
  readonly startedAtMs: number;
  readonly savedRatePerSecond: GameNumber;
}

/**
 * An offline interval frozen at a provisional mine-entry boundary. The mine
 * may run in the foreground while this claim waits for cloud validation, but
 * its reward is not part of the shared wallet until `settlePendingMineClaim`
 * applies the authoritative server amount.
 */
export interface MinePendingClaim extends MineOfflineInterval {
  readonly endedAtMs: number;
}

export interface OwnedMine {
  readonly state: MineProgressState;
  readonly purchasedAtMs: number;
  readonly visitCount: number;
  readonly offlineSequence: number;
  readonly lastClaimedSequence: number;
  readonly offline: MineOfflineInterval | null;
  readonly pendingClaim: MinePendingClaim | null;
}

export interface PortfolioState {
  readonly activeMineId: MineSiteId | null;
  readonly selectedMineId: MineSiteId;
  readonly boostMineId: MineSiteId | null;
  readonly walletGold: GameNumber;
  readonly mines: Readonly<Partial<Record<MineSiteId, OwnedMine>>>;
}

export type MinePurchaseResult =
  | { readonly status: 'purchased'; readonly portfolio: PortfolioState }
  | {
      readonly status: 'already-owned' | 'prerequisite-locked' |
        'insufficient-gold' | 'clock-regressed' | 'not-active';
      readonly portfolio: PortfolioState;
    };

export type MineEnterResult =
  | {
      readonly status: 'entered';
      readonly portfolio: PortfolioState;
      readonly grant: OfflineGrant;
      readonly claimedSequence: number | null;
    }
  | {
      readonly status: 'not-owned' | 'already-active' | 'clock-regressed' | 'claim-pending';
      readonly portfolio: PortfolioState;
    };

export function createInitialPortfolio(timestampMs: number): PortfolioState {
  assertTimestamp(timestampMs);
  const initial = createInitialGameState(getMineBalance('gold'), timestampMs);
  return {
    activeMineId: 'gold',
    selectedMineId: 'gold',
    boostMineId: null,
    walletGold: initial.gold,
    mines: {
      gold: {
        state: withoutWallet(initial),
        purchasedAtMs: timestampMs,
        visitCount: 1,
        offlineSequence: 0,
        lastClaimedSequence: 0,
        offline: null,
        pendingClaim: null,
      },
    },
  };
}

/** The existing simulation receives a temporary selected-mine + wallet view. */
export function activeGameState(portfolio: PortfolioState): GameState | null {
  if (portfolio.activeMineId === null) return null;
  const mine = requireMine(portfolio, portfolio.activeMineId);
  return { ...mine.state, gold: portfolio.walletGold };
}

export function replaceActiveGameState(
  portfolio: PortfolioState,
  state: GameState,
): PortfolioState {
  const mineId = portfolio.activeMineId;
  if (mineId === null) throw new Error('No foreground mine is selected.');
  if (state.gold.lessThan(0)) throw new Error('Wallet gold cannot be negative.');
  const mine = requireMine(portfolio, mineId);
  if (state.lastUpdateTimestampMs < mine.state.lastUpdateTimestampMs) {
    throw new Error('Mine state cannot move backwards in time.');
  }
  return {
    ...portfolio,
    walletGold: state.gold,
    mines: {
      ...portfolio.mines,
      [mineId]: { ...mine, state: withoutWallet(state) },
    },
  };
}

export function advanceActiveMine(
  portfolio: PortfolioState,
  timestampMs: number,
  modifiers: CatProductionModifiers = EMPTY_CAT_PRODUCTION_MODIFIERS,
): PortfolioState {
  assertTimestamp(timestampMs);
  const state = activeGameState(portfolio);
  if (state === null || timestampMs <= state.lastUpdateTimestampMs) {
    return portfolio;
  }
  const next = catchUpSimulation(
    state,
    timestampMs - state.lastUpdateTimestampMs,
    getMineBalance(portfolio.activeMineId!),
    modifiers,
  );
  return replaceActiveGameState(portfolio, next);
}

export function purchaseMine(
  portfolio: PortfolioState,
  mineId: MineSiteId,
  timestampMs: number,
  modifiers: CatProductionModifiers = EMPTY_CAT_PRODUCTION_MODIFIERS,
): MinePurchaseResult {
  assertTimestamp(timestampMs);
  if (portfolio.mines[mineId] !== undefined) {
    return { status: 'already-owned', portfolio };
  }
  if (portfolio.activeMineId === null) {
    return { status: 'not-active', portfolio };
  }
  if (isBeforeActiveTime(portfolio, timestampMs)) {
    return { status: 'clock-regressed', portfolio };
  }
  const current = advanceActiveMine(portfolio, timestampMs, modifiers);
  const site = getMineSite(mineId);
  const prerequisite = site.prerequisiteMineId === null
    ? null
    : current.mines[site.prerequisiteMineId];
  const requiredFloor = site.prerequisiteFloorId === null
    ? null
    : prerequisite?.state.floors.find((floor) => floor.id === site.prerequisiteFloorId);
  if (site.prerequisiteMineId !== null &&
    (prerequisite === undefined || requiredFloor?.isUnlocked !== true)) {
    return { status: 'prerequisite-locked', portfolio: current };
  }
  const price = GameNumber.from(site.unlockPriceGold);
  if (current.walletGold.lessThan(price)) {
    return { status: 'insufficient-gold', portfolio: current };
  }
  const newState = createInitialGameState(getMineBalance(mineId), timestampMs);
  return {
    status: 'purchased',
    portfolio: {
      ...current,
      walletGold: current.walletGold.subtract(price),
      mines: {
        ...current.mines,
        [mineId]: {
          state: withoutWallet(newState),
          purchasedAtMs: timestampMs,
          visitCount: 0,
          offlineSequence: 0,
          lastClaimedSequence: 0,
          offline: null,
          pendingClaim: null,
        },
      },
    },
  };
}

export function previewMineOfflineGrant(
  portfolio: PortfolioState,
  mineId: MineSiteId,
  timestampMs: number,
  boost: BoostState = EMPTY_BOOST_STATE,
): OfflineGrant | null {
  assertTimestamp(timestampMs);
  const mine = portfolio.mines[mineId];
  if (mine === undefined || mine.offline === null) return null;
  return calculateOfflineGrant(
    mine.offline.startedAtMs,
    timestampMs,
    mine.offline.savedRatePerSecond,
    getMineBalance(mineId).offlineIncome,
    portfolio.boostMineId === mineId ? boost : EMPTY_BOOST_STATE,
  );
}

/** Closes the outgoing interval and settles the target's old interval once. */
export function enterMine(
  portfolio: PortfolioState,
  mineId: MineSiteId,
  timestampMs: number,
  modifiers: CatProductionModifiers = EMPTY_CAT_PRODUCTION_MODIFIERS,
  boost: BoostState = EMPTY_BOOST_STATE,
): MineEnterResult {
  assertTimestamp(timestampMs);
  if (portfolio.mines[mineId] === undefined) {
    return { status: 'not-owned', portfolio };
  }
  if (portfolio.activeMineId === mineId) {
    return { status: 'already-active', portfolio };
  }
  if (hasPendingClaim(portfolio)) {
    return { status: 'claim-pending', portfolio };
  }
  if (isBeforeActiveTime(portfolio, timestampMs)) {
    return { status: 'clock-regressed', portfolio };
  }
  const current = advanceActiveMine(portfolio, timestampMs, modifiers);
  const target = requireMine(current, mineId);
  if (target.pendingClaim !== null) {
    return { status: 'claim-pending', portfolio: current };
  }
  const interval = target.offline;
  if (interval !== null && timestampMs < interval.startedAtMs) {
    return { status: 'clock-regressed', portfolio: current };
  }
  const grant = previewMineOfflineGrant(current, mineId, timestampMs, boost) ?? zeroGrant();
  const mines = { ...current.mines };
  if (current.activeMineId !== null) {
    const outgoingId = current.activeMineId;
    const outgoing = requireMine(current, outgoingId);
    const outgoingState = activeGameState(current)!;
    const rate = calculateMineProductionRates(
      outgoingState,
      getMineBalance(outgoingId),
      modifiers,
    ).effectiveProductionPerSecond;
    const sequence = outgoing.offlineSequence + 1;
    mines[outgoingId] = {
      ...outgoing,
      offlineSequence: sequence,
      offline: {
        sequence,
        startedAtMs: timestampMs,
        savedRatePerSecond: rate,
      },
    };
  }
  mines[mineId] = {
    ...target,
    state: {
      ...target.state,
      lastUpdateTimestampMs: timestampMs,
      warehouse: {
        ...target.state.warehouse,
        totalOfflineGoldClaimed:
          target.state.warehouse.totalOfflineGoldClaimed.add(grant.reward),
      },
    },
    visitCount: target.visitCount + 1,
    lastClaimedSequence: interval?.sequence ?? target.lastClaimedSequence,
    offline: null,
    pendingClaim: null,
  };
  return {
    status: 'entered',
    portfolio: {
      ...current,
      activeMineId: mineId,
      selectedMineId: mineId,
      walletGold: current.walletGold.add(grant.reward),
      mines,
    },
    grant,
    claimedSequence: interval?.sequence ?? null,
  };
}

/**
 * Switches foreground ownership at a fixed boundary without crediting the
 * target mine's offline reward. This is used only after a configured cloud
 * command has been durably journaled for later replay.
 */
export function enterMineWithPendingClaim(
  portfolio: PortfolioState,
  mineId: MineSiteId,
  timestampMs: number,
  modifiers: CatProductionModifiers = EMPTY_CAT_PRODUCTION_MODIFIERS,
  boost: BoostState = EMPTY_BOOST_STATE,
): MineEnterResult {
  assertTimestamp(timestampMs);
  if (portfolio.mines[mineId] === undefined) {
    return { status: 'not-owned', portfolio };
  }
  if (portfolio.activeMineId === mineId) {
    return { status: 'already-active', portfolio };
  }
  if (hasPendingClaim(portfolio)) {
    return { status: 'claim-pending', portfolio };
  }
  if (isBeforeActiveTime(portfolio, timestampMs)) {
    return { status: 'clock-regressed', portfolio };
  }
  const current = advanceActiveMine(portfolio, timestampMs, modifiers);
  const target = requireMine(current, mineId);
  if (target.pendingClaim !== null) {
    return { status: 'claim-pending', portfolio: current };
  }
  const interval = target.offline;
  if (interval !== null && timestampMs < interval.startedAtMs) {
    return { status: 'clock-regressed', portfolio: current };
  }
  const grant = previewMineOfflineGrant(current, mineId, timestampMs, boost) ?? zeroGrant();
  const mines = { ...current.mines };
  if (current.activeMineId !== null) {
    const outgoingId = current.activeMineId;
    const outgoing = requireMine(current, outgoingId);
    const outgoingState = activeGameState(current)!;
    const rate = calculateMineProductionRates(
      outgoingState,
      getMineBalance(outgoingId),
      modifiers,
    ).effectiveProductionPerSecond;
    const sequence = outgoing.offlineSequence + 1;
    mines[outgoingId] = {
      ...outgoing,
      offlineSequence: sequence,
      offline: {
        sequence,
        startedAtMs: timestampMs,
        savedRatePerSecond: rate,
      },
    };
  }
  mines[mineId] = {
    ...target,
    state: {
      ...target.state,
      lastUpdateTimestampMs: timestampMs,
    },
    visitCount: target.visitCount + 1,
    offline: null,
    pendingClaim: interval === null ? null : {
      ...interval,
      endedAtMs: timestampMs,
    },
  };
  return {
    status: 'entered',
    portfolio: {
      ...current,
      activeMineId: mineId,
      selectedMineId: mineId,
      mines,
    },
    grant,
    claimedSequence: interval?.sequence ?? null,
  };
}

/** Credits one server-approved frozen claim without touching live progress. */
export function settlePendingMineClaim(
  portfolio: PortfolioState,
  mineId: MineSiteId,
  sequence: number,
  reward: GameNumber,
): PortfolioState {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || reward.lessThan(0)) {
    throw new Error('A valid pending claim settlement is required.');
  }
  const mine = requireMine(portfolio, mineId);
  const pending = mine.pendingClaim;
  if (pending === null || pending.sequence !== sequence ||
      mine.lastClaimedSequence >= sequence) {
    throw new Error('The pending claim does not match this settlement.');
  }
  return {
    ...portfolio,
    walletGold: portfolio.walletGold.add(reward),
    mines: {
      ...portfolio.mines,
      [mineId]: {
        ...mine,
        lastClaimedSequence: sequence,
        pendingClaim: null,
        state: {
          ...mine.state,
          warehouse: {
            ...mine.state.warehouse,
            totalOfflineGoldClaimed:
              mine.state.warehouse.totalOfflineGoldClaimed.add(reward),
          },
        },
      },
    },
  };
}

export function suspendActiveMine(
  portfolio: PortfolioState,
  timestampMs: number,
  modifiers: CatProductionModifiers = EMPTY_CAT_PRODUCTION_MODIFIERS,
): PortfolioState {
  assertTimestamp(timestampMs);
  const mineId = portfolio.activeMineId;
  if (mineId === null || isBeforeActiveTime(portfolio, timestampMs)) return portfolio;
  const current = advanceActiveMine(portfolio, timestampMs, modifiers);
  const mine = requireMine(current, mineId);
  const rate = calculateMineProductionRates(
    activeGameState(current)!,
    getMineBalance(mineId),
    modifiers,
  ).effectiveProductionPerSecond;
  const sequence = mine.offlineSequence + 1;
  return {
    ...current,
    activeMineId: null,
    mines: {
      ...current.mines,
      [mineId]: {
        ...mine,
        offlineSequence: sequence,
        offline: {
          sequence,
          startedAtMs: timestampMs,
          savedRatePerSecond: rate,
        },
      },
    },
  };
}

function requireMine(portfolio: PortfolioState, mineId: MineSiteId): OwnedMine {
  const mine = portfolio.mines[mineId];
  if (mine === undefined) throw new Error(`Mine ${mineId} is not owned.`);
  return mine;
}

function hasPendingClaim(portfolio: PortfolioState): boolean {
  return Object.values(portfolio.mines).some(
    (mine) => mine !== undefined && mine.pendingClaim !== null,
  );
}

function withoutWallet(state: GameState): MineProgressState {
  return {
    saveVersion: state.saveVersion,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs,
    simulationTick: state.simulationTick,
    simulationRemainderMs: state.simulationRemainderMs,
    floors: state.floors,
    elevator: state.elevator,
    warehouse: state.warehouse,
  };
}

function isBeforeActiveTime(portfolio: PortfolioState, timestampMs: number): boolean {
  const state = activeGameState(portfolio);
  return state !== null && timestampMs < state.lastUpdateTimestampMs;
}

function zeroGrant(): OfflineGrant {
  return {
    elapsedDurationMs: 0,
    creditedDurationMs: 0,
    reward: GameNumber.from(0),
  };
}

function assertTimestamp(timestampMs: number): void {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new Error('Portfolio timestamp must be a non-negative safe integer.');
  }
}

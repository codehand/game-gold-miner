import { getMineBalance, MINE_SITE_IDS } from '../../config';
import { EMPTY_BOOST_STATE, type BoostState } from '../boost/boost';
import { type CatRosterState } from '../cats';
import { GameNumber } from '../numbers/GameNumber';
import { type PortfolioState } from '../portfolio/portfolio';
import { projectCatRosterToMine } from '../portfolio/portfolioCatRoster';
import { type GameState } from '../state/GameState';
import { evaluateProgressBound, type ProgressBoundViolation } from './progressBound';

export interface PortfolioRoutineBoundInput {
  readonly previous: PortfolioState;
  readonly candidate: PortfolioState;
  readonly previousCatRoster: CatRosterState;
  readonly candidateCatRoster: CatRosterState;
  readonly previousReceivedAtMs: number;
  readonly serverNowMs: number;
  readonly boostState?: BoostState;
}

/**
 * A routine save may advance only the foreground mine. Ownership, offline
 * intervals, claims, workforce and selected mine require separate server
 * commands. The server supplies both timestamps; client save clocks are never
 * used to enlarge this interval.
 */
export function evaluatePortfolioRoutineBound(
  input: PortfolioRoutineBoundInput,
): ProgressBoundViolation | null {
  const { previous, candidate } = input;
  const activeMineId = previous.activeMineId;
  if (activeMineId === null || candidate.activeMineId !== activeMineId ||
    candidate.selectedMineId !== previous.selectedMineId ||
    candidate.boostMineId !== previous.boostMineId) {
    return violation('activeMineId', String(candidate.activeMineId), String(activeMineId));
  }
  if (!sameRoster(input.previousCatRoster, input.candidateCatRoster)) {
    return violation('cats', 'changed', 'unchanged');
  }

  for (const mineId of MINE_SITE_IDS) {
    const before = previous.mines[mineId];
    const after = candidate.mines[mineId];
    if ((before === undefined) !== (after === undefined)) {
      return violation(`mines.${mineId}.ownership`, String(after !== undefined), String(before !== undefined));
    }
    if (before === undefined || after === undefined) continue;
    if (mineId !== activeMineId && JSON.stringify(before) !== JSON.stringify(after)) {
      return violation(`mines.${mineId}.state`, 'changed', 'unchanged');
    }
    if (mineId === activeMineId && (
      before.purchasedAtMs !== after.purchasedAtMs ||
      before.visitCount !== after.visitCount ||
      before.offlineSequence !== after.offlineSequence ||
      before.lastClaimedSequence !== after.lastClaimedSequence ||
      before.offline !== null || after.offline !== null
    )) {
      return violation(`mines.${mineId}.interval`, 'changed', 'unchanged');
    }
  }

  const before = previous.mines[activeMineId]!;
  const after = candidate.mines[activeMineId]!;
  if (after.state.lastUpdateTimestampMs < before.state.lastUpdateTimestampMs ||
    after.state.lastUpdateTimestampMs > input.serverNowMs) {
    return violation(`mines.${activeMineId}.lastUpdateTimestampMs`,
      String(after.state.lastUpdateTimestampMs), String(input.serverNowMs));
  }
  if (!after.state.warehouse.totalOfflineGoldClaimed.equals(
    before.state.warehouse.totalOfflineGoldClaimed,
  )) {
    return violation(`mines.${activeMineId}.offlineClaim`,
      after.state.warehouse.totalOfflineGoldClaimed.serialize(),
      before.state.warehouse.totalOfflineGoldClaimed.serialize());
  }
  if (after.state.warehouse.totalGoldDelivered.lessThan(
    before.state.warehouse.totalGoldDelivered,
  ) || after.state.floors.some((floor, index) =>
    floor.totalExtracted.lessThan(before.state.floors[index].totalExtracted) ||
    floor.totalTransported.lessThan(before.state.floors[index].totalTransported))) {
    return violation(`mines.${activeMineId}.lifetimeCounters`, 'decreased', 'monotonic');
  }

  const deltaDelivered = after.state.warehouse.totalGoldDelivered.subtract(
    before.state.warehouse.totalGoldDelivered,
  );
  const maximumWallet = previous.walletGold.add(deltaDelivered);
  if (candidate.walletGold.greaterThan(maximumWallet)) {
    return violation('walletGold', candidate.walletGold.serialize(), maximumWallet.serialize());
  }

  const previousState = withWallet(before.state, previous.walletGold);
  const candidateState = withWallet(after.state, candidate.walletGold);
  const elapsedMs = Math.max(0, input.serverNowMs - input.previousReceivedAtMs);
  const bound = evaluateProgressBound({
    previous: previousState,
    candidate: candidateState,
    elapsedMs,
    intervalStartMs: input.previousReceivedAtMs,
    boostState: previous.boostMineId === activeMineId
      ? input.boostState ?? EMPTY_BOOST_STATE : EMPTY_BOOST_STATE,
    config: getMineBalance(activeMineId),
    previousCatRoster: projectCatRosterToMine(input.previousCatRoster, activeMineId),
    candidateCatRoster: projectCatRosterToMine(input.candidateCatRoster, activeMineId),
  });
  return bound === null ? null : { ...bound, counter: `mines.${activeMineId}.${bound.counter}` };
}

function withWallet(state: Omit<GameState, 'gold'>, walletGold: GameNumber): GameState {
  return { ...state, gold: walletGold };
}

function sameRoster(left: CatRosterState, right: CatRosterState): boolean {
  if (left.assignmentRevision !== right.assignmentRevision ||
    left.collectionRevision !== right.collectionRevision) return false;
  const sortCats = (roster: CatRosterState) => [...roster.cats]
    .sort((a, b) => a.catInstanceId.localeCompare(b.catInstanceId));
  const sortAssignments = (roster: CatRosterState) => [...roster.assignments]
    .sort((a, b) => a.slotKey.localeCompare(b.slotKey));
  return JSON.stringify(sortCats(left)) === JSON.stringify(sortCats(right)) &&
    JSON.stringify(sortAssignments(left)) === JSON.stringify(sortAssignments(right));
}

function violation(counter: string, claimed: string, maximum: string): ProgressBoundViolation {
  return { counter, claimed, maximum };
}

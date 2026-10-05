import { MINE_SITE_IDS } from '../config/mineSites';
import { GameNumber } from '../core/numbers/GameNumber';
import type { ProgressComparison } from './saveConflictPolicy';
import type { PortfolioSaveDocumentV4, SerializedOwnedMine } from './portfolioSaveSchema';

/**
 * Compare account portfolios by fields that cannot normally go backwards.
 * Wallet gold is spendable; Collection ownership is tradable. A changed
 * Collection projection therefore requires an explicit conflict decision.
 */
export function comparePortfolioProgress(
  left: PortfolioSaveDocumentV4,
  right: PortfolioSaveDocumentV4,
): ProgressComparison {
  if (!sameCollection(left, right)) return 'fork';
  let leftAhead = false;
  let rightAhead = false;
  const note = (difference: number): void => {
    if (difference > 0) leftAhead = true;
    if (difference < 0) rightAhead = true;
  };
  for (const mineId of MINE_SITE_IDS) {
    const a = left.mines[mineId];
    const b = right.mines[mineId];
    note(Number(a !== undefined) - Number(b !== undefined));
    if (a === undefined || b === undefined) continue;
    compareMine(a, b, note);
  }
  if (leftAhead && rightAhead) return 'fork';
  if (left.selectedMineId !== right.selectedMineId ||
      left.boostMineId !== right.boostMineId) {
    return 'fork';
  }
  if (leftAhead) return 'left-dominates';
  if (rightAhead) return 'right-dominates';
  return GameNumber.deserialize(left.walletGold).equals(
    GameNumber.deserialize(right.walletGold),
  ) ? 'equal' : 'fork';
}

function compareMine(
  left: SerializedOwnedMine,
  right: SerializedOwnedMine,
  note: (difference: number) => void,
): void {
  note(left.visitCount - right.visitCount);
  note(left.offlineSequence - right.offlineSequence);
  note(left.lastClaimedSequence - right.lastClaimedSequence);
  const a = left.state;
  const b = right.state;
  note(a.elevator.level - b.elevator.level);
  note(a.warehouse.level - b.warehouse.level);
  noteNumber(a.warehouse.totalGoldDelivered, b.warehouse.totalGoldDelivered, note);
  noteNumber(
    a.warehouse.totalOfflineGoldClaimed,
    b.warehouse.totalOfflineGoldClaimed,
    note,
  );
  if (a.floors.length !== b.floors.length) {
    note(a.floors.length - b.floors.length);
    note(b.floors.length - a.floors.length);
    return;
  }
  a.floors.forEach((floor, index) => {
    const other = b.floors[index];
    note(Number(floor.isUnlocked) - Number(other.isUnlocked));
    note(floor.mineShaftLevel - other.mineShaftLevel);
    noteNumber(floor.totalExtracted, other.totalExtracted, note);
    noteNumber(floor.totalTransported, other.totalTransported, note);
  });
}

function noteNumber(left: string, right: string, note: (difference: number) => void): void {
  const a = GameNumber.deserialize(left);
  const b = GameNumber.deserialize(right);
  note(a.equals(b) ? 0 : a.greaterThan(b) ? 1 : -1);
}

function sameCollection(left: PortfolioSaveDocumentV4, right: PortfolioSaveDocumentV4): boolean {
  if (left.assignmentRevision !== right.assignmentRevision ||
      left.collectionRevision !== right.collectionRevision) return false;
  const cats = (document: PortfolioSaveDocumentV4) => [...document.cats]
    .sort((a, b) => a.catInstanceId.localeCompare(b.catInstanceId));
  const assignments = (document: PortfolioSaveDocumentV4) => [...document.assignments]
    .sort((a, b) => a.slotKey.localeCompare(b.slotKey));
  const withoutUpdatedAt = (key: string, value: unknown): unknown =>
    key === 'updatedAt' ? undefined : value;
  return JSON.stringify(cats(left), withoutUpdatedAt) ===
      JSON.stringify(cats(right), withoutUpdatedAt) &&
    JSON.stringify(assignments(left)) === JSON.stringify(assignments(right));
}

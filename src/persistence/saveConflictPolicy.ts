import {
  GameNumber,
  type SerializedGameNumber,
} from '../core/numbers/GameNumber';
import type { SaveDocumentV2 } from './saveSchema';

/**
 * Server-milestone Step 18: the Step 2 conflict policy for divergent saves
 * (`memory-bank/server-save-sync-protocol.md` §7, decision D4). Two devices
 * that played the same account offline both sync, so their documents can
 * differ; something has to decide which one wins without ever throwing away
 * progress the player was not shown.
 *
 * The rule, in player-facing terms:
 *
 * > If one save is ahead of the other in every way that only ever moves
 * > forward — more floors opened, deeper shafts, more material extracted and
 * > transported, a higher elevator or warehouse, more gold ever delivered,
 * > more gold ever claimed offline — we keep that one silently, because
 * > keeping it loses nothing. If neither save is ahead in every way, each one
 * > holds something the other lacks, so we show you both and let you choose.
 * > We never pick one for you in that case, and the save you did not choose is
 * > not destroyed.
 *
 * §7.1 defines the **progress vector** `M(document)` over exactly those
 * monotonic fields:
 *
 * - per floor, all fifteen: `isUnlocked` (false < true), `mineShaftLevel`,
 *   `totalExtracted`, `totalTransported`
 * - `elevator.level`
 * - `warehouse.level`, `warehouse.totalGoldDelivered`,
 *   `warehouse.totalOfflineGoldClaimed`
 *
 * `A` dominates `B` when every component of `M(A)` is greater than or equal to
 * its counterpart in `M(B)`.
 *
 * **Deliberately excluded from `M`:** `gold`, `materialQueue`, `inputQueue`,
 * `carriedMaterial`, every `*Progress` fraction, `roundRobinCursor`,
 * `simulationTick`, and all timestamps. Each of these legitimately falls —
 * `gold` most obviously, when the player spends it — so including any of them
 * would report a fork on a device that had simply bought an upgrade. Step 23
 * makes the same distinction when it bounds cumulative counters rather than
 * current gold.
 *
 * **Why `gold` needs no special-casing here: its sources are all vectored.**
 * `gold = startingGold + totalGoldDelivered + totalOfflineGoldClaimed − spent`,
 * and `spent` is a deterministic function of the levels and unlocks already in
 * `M` (upgrade and unlock costs derive from level alone). With every gold
 * *source* counted, equal `M` implies equal `gold`, and a dominating save has
 * earned at least as much cumulatively, so a silent resolution cannot discard
 * un-shown gold. That is why `src/core/offline-income/claimOfflineIncome.ts`
 * credits `warehouse.totalOfflineGoldClaimed` alongside `gold`, and why the
 * schema is version 2: before that counter existed, an offline reward moved
 * `gold` while touching no vector field, letting a strict-subset save be
 * silently bankrupted by a dominating one. An earlier fix tried to patch that
 * with a `gold`-size heuristic; it was both too broad (forking ordinary
 * purchases and the new-device restore path) and still unsound (the bound was
 * lifetime-cumulative, so it was dead after any spending). Completing the
 * vector is the structural fix, and it deletes all `gold` special-casing.
 *
 * This predicate is pure and belongs beside `saveSchema.ts`, not in
 * `src/core`: the core simulation is not allowed to know that saves exist.
 * It is deliberately independent of `src/platform`, so the eventual Step 19
 * upload path can call it on a `409` without importing any network code.
 *
 * **Constraints this places on future features.** Dominance holds only while
 * those fields are monotonic: a prestige, respec, or reset mechanic would break
 * it and would have to revise this policy in the same change. And any new gold
 * source must join `M` (like `totalOfflineGoldClaimed` did) or the
 * equal-`M`-implies-equal-`gold` argument fails again.
 */

/**
 * The dominance comparison over the §7.1 progress vector.
 *
 * - `equal` — same monotonic progress; §7 says adopt the server revision and
 *   continue (adopting the revision itself is the upload path's concern, not
 *   this predicate's).
 * - `left-dominates` — `M(left)` is at least `M(right)` everywhere; left is a
 *   superset, so taking it loses nothing.
 * - `right-dominates` — the mirror image.
 * - `fork` — each side holds progress the other lacks, or the two documents
 *   are not safely comparable (see below); neither dominates.
 */
export type ProgressComparison =
  | 'equal'
  | 'left-dominates'
  | 'right-dominates'
  | 'fork';

export function compareProgress(
  left: SaveDocumentV2,
  right: SaveDocumentV2,
): ProgressComparison {
  if (left.state.floors.length !== right.state.floors.length) {
    // The schema pins fifteen floors, so a different count means at least one
    // side is not a document this policy can compare. Returning `fork` rather
    // than indexing into the shorter array keeps this specific malformation
    // from throwing. It is not a general "never throws" guarantee: callers
    // must still validate a `409` body first, because e.g. a missing `floors`
    // array or an unserializable `gold` would throw here or in
    // `GameNumber.deserialize`. Callers on the save path do validate.
    return 'fork';
  }

  let leftAhead = false;
  let rightAhead = false;

  const note = (comparison: number): void => {
    if (comparison > 0) {
      leftAhead = true;
    } else if (comparison < 0) {
      rightAhead = true;
    }
  };

  left.state.floors.forEach((floor, index) => {
    const other = right.state.floors[index];

    note(Number(floor.isUnlocked) - Number(other.isUnlocked));
    note(floor.mineShaftLevel - other.mineShaftLevel);
    note(compareGameNumbers(floor.totalExtracted, other.totalExtracted));
    note(compareGameNumbers(floor.totalTransported, other.totalTransported));
  });

  note(left.state.elevator.level - right.state.elevator.level);
  note(left.state.warehouse.level - right.state.warehouse.level);
  note(
    compareGameNumbers(
      left.state.warehouse.totalGoldDelivered,
      right.state.warehouse.totalGoldDelivered,
    ),
  );
  note(
    compareGameNumbers(
      left.state.warehouse.totalOfflineGoldClaimed,
      right.state.warehouse.totalOfflineGoldClaimed,
    ),
  );

  if (leftAhead && rightAhead) {
    return 'fork';
  }
  if (leftAhead) {
    return 'left-dominates';
  }
  if (rightAhead) {
    return 'right-dominates';
  }

  return 'equal';
}

function compareGameNumbers(
  left: SerializedGameNumber,
  right: SerializedGameNumber,
): number {
  const leftValue = GameNumber.deserialize(left);
  const rightValue = GameNumber.deserialize(right);

  if (leftValue.equals(rightValue)) {
    return 0;
  }

  return leftValue.greaterThan(rightValue) ? 1 : -1;
}

/**
 * One candidate save, reduced to the §7.3 fields the player is shown when a
 * genuine fork has to be resolved. `gold` and `totalGoldDelivered` are returned
 * as `GameNumber` values so the display layer formats them through
 * `formatAmount` — this module must stay free of `src/game` so the pure save
 * code keeps its direction of dependency.
 */
export interface SaveConflictCandidate {
  /** The candidate itself, retained so the player's choice can be applied verbatim. */
  readonly document: SaveDocumentV2;
  /** Server candidate: the upload's `receivedAt`. Local candidate: `savedAtTimestampMs`. */
  readonly lastPlayedMs: number;
  readonly gold: GameNumber;
  readonly floorsOpen: number;
  readonly deepestShaftLevel: number;
  readonly totalGoldDelivered: GameNumber;
}

export function describeSaveConflictCandidate(
  document: SaveDocumentV2,
  lastPlayedMs: number,
): SaveConflictCandidate {
  const unlockedFloors = document.state.floors.filter((floor) => floor.isUnlocked);

  return {
    document,
    lastPlayedMs,
    gold: GameNumber.deserialize(document.state.gold),
    floorsOpen: unlockedFloors.length,
    deepestShaftLevel: unlockedFloors.reduce(
      (deepest, floor) => Math.max(deepest, floor.mineShaftLevel),
      0,
    ),
    totalGoldDelivered: GameNumber.deserialize(
      document.state.warehouse.totalGoldDelivered,
    ),
  };
}

/** The remote side of a comparison: §10.2's downloaded document plus the upload's server `receivedAt`. */
export interface SaveConflictRemote {
  readonly document: SaveDocumentV2;
  readonly receivedAtMs: number;
}

export type SaveConflictResolution =
  | { readonly kind: 'same-progress' }
  | { readonly kind: 'local-dominates' }
  | { readonly kind: 'remote-dominates' }
  | {
      readonly kind: 'fork';
      readonly local: SaveConflictCandidate;
      readonly remote: SaveConflictCandidate;
    };

/**
 * The §7 policy applied to the local device document and the account's cloud
 * document. `remote === null` means the account has no cloud save at all — the
 * normal first-sign-in path — so the local document is kept and uploaded at
 * the next trigger.
 *
 * Every silent branch is safe by construction now: the vector counts every
 * monotonic field *and* every gold source, so `equal` implies equal `gold` and
 * a dominating side has earned at least as much. There is no gold special case
 * to get wrong — see the module docstring.
 */
export function resolveSaveConflict(
  local: SaveDocumentV2,
  remote: SaveConflictRemote | null,
): SaveConflictResolution {
  if (remote === null) {
    return { kind: 'local-dominates' };
  }

  const comparison = compareProgress(local, remote.document);

  if (comparison === 'left-dominates') {
    return { kind: 'local-dominates' };
  }
  if (comparison === 'right-dominates') {
    return { kind: 'remote-dominates' };
  }
  if (comparison === 'equal') {
    // Same vector, and — because every gold source is in it — the same gold.
    // §7 says adopt the server revision and continue; the retried-upload case
    // (the server already holds the exact document the client is re-sending)
    // lands exactly here and resolves silently.
    return { kind: 'same-progress' };
  }

  return describeFork(local, remote);
}

function describeFork(
  local: SaveDocumentV2,
  remote: SaveConflictRemote,
): SaveConflictResolution {
  return {
    kind: 'fork',
    local: describeSaveConflictCandidate(local, local.savedAtTimestampMs),
    remote: describeSaveConflictCandidate(remote.document, remote.receivedAtMs),
  };
}

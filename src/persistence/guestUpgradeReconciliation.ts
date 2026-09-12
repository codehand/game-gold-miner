import type { BaseGameBalanceConfig } from '../config';
import { GameNumber } from '../core/numbers/GameNumber';
import type { SaveDocumentV1 } from './saveSchema';

/**
 * Server-milestone Step 13/17: whether `document` holds any of the
 * milestone's "progress vector" fields above their starting value — the same
 * fields `memory-bank/server-save-sync-protocol.md` §7.1 defines for the
 * dominance rule (Step 18), deliberately excluding `gold`, every queue,
 * `carriedMaterial`, and progress fractions. Those legitimately churn from
 * idle play alone — the base floor starts unlocked and producing — so
 * including them would make "no progress" true for only the first instant of
 * a fresh session, defeating the purpose of asking at all.
 *
 * Used to decide whether a guest-upgrade collision (Step 13) or a boot-time
 * cloud restore (Step 17) needs asking the player: nothing to lose on one
 * side means nothing to ask about.
 */
export function hasAnyProgress(
  document: SaveDocumentV1,
  config: BaseGameBalanceConfig,
): boolean {
  const { state } = document;

  const floorHasProgress = state.floors.some((floor, index) => {
    const floorConfig = config.floors[index];

    return (
      floor.isUnlocked !== floorConfig.startingUnlocked ||
      floor.mineShaftLevel !== floorConfig.startingLevel ||
      GameNumber.deserialize(floor.totalExtracted).greaterThan(0) ||
      GameNumber.deserialize(floor.totalTransported).greaterThan(0)
    );
  });

  return (
    floorHasProgress ||
    state.elevator.level !== config.elevator.startingLevel ||
    state.warehouse.level !== config.warehouse.startingLevel ||
    GameNumber.deserialize(state.warehouse.totalGoldDelivered).greaterThan(0)
  );
}

/** One candidate save, reduced to what the player is shown to choose between (§7.3). */
export interface GuestUpgradeCandidate {
  readonly document: SaveDocumentV1;
  /** Server candidate: the upload's `receivedAt`. Local candidate: `document.savedAtTimestampMs`. */
  readonly lastPlayedMs: number;
}

export type GuestUpgradeDecision =
  | { readonly kind: 'adopt-local' }
  | { readonly kind: 'adopt-remote' }
  | {
      readonly kind: 'ask';
      readonly local: GuestUpgradeCandidate;
      readonly remote: GuestUpgradeCandidate;
    };

/**
 * Server-milestone Step 13's three required flows, plus their symmetric
 * counterpart:
 *
 * - Remote has no save at all (`remote === null`) → keep local, nothing to
 *   ask (covers "guest with progress links a fresh identity": the account
 *   never had a save before, so whatever is local just becomes the upload).
 * - Local has no progress → adopt remote silently ("guest with no progress
 *   signing into an existing account is not asked at all"), even when remote
 *   also has none — there is nothing on either side worth asking about.
 * - Remote has no progress but local does → adopt local silently, the
 *   mirror image of the case above.
 * - Both have progress → `ask`, with each candidate's §7.3 display fields.
 *
 * Pure and deliberately independent of Step 18's dominance rule: this is a
 * different scenario (two distinct identities merging, not the same account
 * diverging across devices), and its own test needs no dominance predicate —
 * only "does each side have any progress at all."
 */
export function reconcileGuestUpgrade(
  local: SaveDocumentV1,
  remote: { readonly document: SaveDocumentV1; readonly receivedAtMs: number } | null,
  config: BaseGameBalanceConfig,
): GuestUpgradeDecision {
  if (remote === null) {
    return { kind: 'adopt-local' };
  }

  const localHasProgress = hasAnyProgress(local, config);
  const remoteHasProgress = hasAnyProgress(remote.document, config);

  if (!localHasProgress) {
    return { kind: 'adopt-remote' };
  }
  if (!remoteHasProgress) {
    return { kind: 'adopt-local' };
  }

  return {
    kind: 'ask',
    local: { document: local, lastPlayedMs: local.savedAtTimestampMs },
    remote: { document: remote.document, lastPlayedMs: remote.receivedAtMs },
  };
}

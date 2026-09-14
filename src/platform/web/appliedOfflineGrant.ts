/**
 * Server-milestone Step 22: remembering which server offline grant has already
 * been credited.
 *
 * The server computes the grant from the stored `received_at` to its own now.
 * Normally the client credits a grant and immediately force-uploads the
 * credited state, which advances `received_at`, so the next download grants
 * approximately nothing for the same interval. The one gap is a reload between
 * applying the grant and the upload landing: the credited gold survives in
 * IndexedDB, but the server still holds the old `received_at` and would return
 * the *same* grant again.
 *
 * This store records the `receivedAt` the last grant was applied against, so
 * that repeat is skipped. It is deliberately script-writable storage and
 * best-effort: if it is cleared, the local credit was cleared with it, and
 * re-applying the grant is then correct rather than a double-credit.
 */
import type { KeyValueStorage } from './WebLifecycleSaveJournal';

export const APPLIED_OFFLINE_GRANT_KEY =
  'cat-mine-idle:applied-offline-grant-v1';

export function readAppliedOfflineGrantReceivedAtMs(
  storage: KeyValueStorage | null,
): number | null {
  if (storage === null) {
    return null;
  }

  try {
    const value = Number(storage.getItem(APPLIED_OFFLINE_GRANT_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markOfflineGrantApplied(
  storage: KeyValueStorage | null,
  receivedAtMs: number,
): void {
  if (storage === null || !Number.isSafeInteger(receivedAtMs) || receivedAtMs <= 0) {
    return;
  }

  try {
    storage.setItem(APPLIED_OFFLINE_GRANT_KEY, String(receivedAtMs));
  } catch {
    // Best effort: the credit itself already persisted locally.
  }
}

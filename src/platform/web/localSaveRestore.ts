/**
 * Server-milestone Step 21: what to tell a player whose local save is gone.
 *
 * The seven-day script-writable storage sweep takes the Dexie save; in the same
 * sweep it usually takes the guest session too. When the session *does* survive
 * — a partial eviction, an IndexedDB-only clear, a storage-pressure quota
 * eviction — the client can tell the difference between a genuinely new player
 * and a returning one whose device lost its copy, because a reused session
 * (`isNewSession === false`, Step 21's `ensureGuestSession` addition) paired
 * with no local save is a state a first-time player can never be in.
 *
 * That distinction is only worth acting on when the account also has no cloud
 * save to restore. If it has one, the boot reconcile adopts it (Step 17/18) and
 * the player is restored with nothing to explain; if it has none, the player is
 * about to start over, and they deserve to be told why rather than silently
 * handed a fresh mine.
 *
 * This predicate is pure so the decision is unit-testable without a browser or
 * a stack. `src/main.ts` reports the notice through the existing
 * `SaveDiagnosticBanner`.
 */
import type { CloudSaveReconcileOutcome } from './cloudSaveReconcile';

export const MISSING_LOCAL_SAVE_CODE = 'local-save-missing';
export const MISSING_LOCAL_SAVE_MESSAGE =
  'Your saved game could not be found on this device, and this account has no cloud save to restore. A new mine has been started.';

/**
 * What `loadActiveGame` found, at the granularity this decision needs.
 *
 * `'fresh'` is deliberately split: `'missing'` means there was no local record
 * at all, while `'unreadable'` means a record existed but failed to load
 * (corrupt or an unsupported version). A returning player whose save is corrupt
 * must not be told it "could not be found" — it was found and was unreadable,
 * which `loadActiveGame` already reports with its own `corrupt-save` /
 * `incompatible-save` warning.
 */
export type LocalSaveState = 'saved' | 'missing' | 'unreadable';

export interface MissingLocalSaveContext {
  readonly localSaveState: LocalSaveState;
  /** `ensureGuestSession`'s flag: `false` means the session was reused, not minted this boot. */
  readonly isNewSession: boolean;
  /** The boot reconcile's outcome; only `no-cloud-save` means there is nothing to restore. */
  readonly reconcileOutcome: CloudSaveReconcileOutcome;
}

/**
 * `true` only for the exact state Step 21 names: a returning player (reused
 * session, no local record at all) whose account has no cloud copy either. A
 * brand-new session, a corrupt-but-present save, an unconfigured client, a
 * failed download, or any cloud save at all keeps this `false`, so a genuinely
 * new player is never told their progress was lost, a corrupt-save warning is
 * never overwritten by a false "not found", and a restore is never pre-empted
 * by an explanation.
 */
export function shouldExplainMissingLocalSave(
  context: MissingLocalSaveContext,
): boolean {
  return (
    context.localSaveState === 'missing' &&
    !context.isNewSession &&
    context.reconcileOutcome.kind === 'no-cloud-save'
  );
}

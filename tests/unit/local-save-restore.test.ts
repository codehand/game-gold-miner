import { describe, expect, it } from 'vitest';

import {
  MISSING_LOCAL_SAVE_CODE,
  MISSING_LOCAL_SAVE_MESSAGE,
  shouldExplainMissingLocalSave,
} from '../../src/platform/web';

/**
 * Server-milestone Step 21: the pure decision behind the honest
 * missing-local-save notice. Only a reused guest session with no local record
 * *at all* and no cloud save is a returning player whose device lost its copy;
 * every other combination must stay silent so a genuinely new player is never
 * told their progress was lost — and, critically, so a corrupt-but-present save
 * is never mislabelled "not found".
 */
describe('shouldExplainMissingLocalSave (Step 21)', () => {
  it('explains a reused session with no local record and no cloud save', () => {
    expect(
      shouldExplainMissingLocalSave({
        localSaveState: 'missing',
        isNewSession: false,
        reconcileOutcome: { kind: 'no-cloud-save' },
      }),
    ).toBe(true);
  });

  it('never explains a corrupt-but-present local save — it was found, not missing', () => {
    // `loadActiveGame` reports this with its own `corrupt-save` /
    // `incompatible-save` warning, which this notice must not overwrite.
    expect(
      shouldExplainMissingLocalSave({
        localSaveState: 'unreadable',
        isNewSession: false,
        reconcileOutcome: { kind: 'no-cloud-save' },
      }),
    ).toBe(false);
  });

  it('never explains when a readable local save exists', () => {
    expect(
      shouldExplainMissingLocalSave({
        localSaveState: 'saved',
        isNewSession: false,
        reconcileOutcome: { kind: 'no-cloud-save' },
      }),
    ).toBe(false);
  });

  it('never explains a brand-new session — a first-time player looks identical', () => {
    expect(
      shouldExplainMissingLocalSave({
        localSaveState: 'missing',
        isNewSession: true,
        reconcileOutcome: { kind: 'no-cloud-save' },
      }),
    ).toBe(false);
  });

  it.each(['kept-local', 'same-progress', 'adopted-remote'] as const)(
    'never explains when the cloud had something to reconcile (%s)',
    (kind) => {
      expect(
        shouldExplainMissingLocalSave({
          localSaveState: 'missing',
          isNewSession: false,
          reconcileOutcome: { kind },
        }),
      ).toBe(false);
    },
  );

  it('never explains when the download failed or no session existed', () => {
    for (const reconcileOutcome of [
      { kind: 'error' as const, reason: 'offline' },
      { kind: 'no-session' as const },
    ]) {
      expect(
        shouldExplainMissingLocalSave({
          localSaveState: 'missing',
          isNewSession: false,
          reconcileOutcome,
        }),
      ).toBe(false);
    }
  });

  it('namespaces the notice code so the banner dedupes it per cause', () => {
    expect(MISSING_LOCAL_SAVE_CODE).toBe('local-save-missing');
    expect(MISSING_LOCAL_SAVE_MESSAGE.length).toBeGreaterThan(0);
  });
});

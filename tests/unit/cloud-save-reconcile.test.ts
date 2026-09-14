import { describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import {
  adoptExistingLocalSave,
  downloadCloudSaveViaFetch,
  reconcileCloudSaveAtBoot,
  type CloudSaveDownload,
  type CloudSaveReconcileDeps,
} from '../../src/platform/web';

/**
 * Server-milestone Step 17: `reconcileCloudSaveAtBoot` never touches the
 * network or IndexedDB directly — every collaborator is injected, the same
 * pattern `guestSession.ts`/`googleSignIn.ts` established, so these tests
 * fake the repository, the download call, and `reload`.
 */
const NOW_MS = 1_788_000_000_000;

function freshDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

function progressingDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const level = state.elevator.level + 1;
  const progressed: GameState = {
    ...state,
    elevator: {
      ...state.elevator,
      level,
      capacity: calculateLevelEffect(BASE_GAME_BALANCE.elevator.baseCapacity, level, BASE_GAME_BALANCE.elevator.upgrade),
    },
  };
  return createSaveDocument(progressed, BASE_GAME_BALANCE, NOW_MS);
}

function fakeDeps(overrides: Partial<CloudSaveReconcileDeps> = {}): CloudSaveReconcileDeps {
  return {
    repository: {
      loadActiveSave: async () => null,
      storeActiveSave: async () => {},
    },
    download: async () => null,
    config: BASE_GAME_BALANCE,
    reload: () => {},
    clearLifecycleJournal: () => {},
    ...overrides,
  };
}

describe('reconcileCloudSaveAtBoot', () => {
  it('does nothing when there is no session', async () => {
    const outcome = await reconcileCloudSaveAtBoot(null, NOW_MS, fakeDeps());
    expect(outcome).toEqual({ kind: 'no-session' });
  });

  it('reports the server revision to the Step 19 replica when local keeps its save', async () => {
    const onServerRevision = vi.fn();

    await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: {
          loadActiveSave: async () => progressingDocument(),
          storeActiveSave: async () => {},
        },
        download: async () => ({ document: freshDocument(), receivedAtMs: NOW_MS, revision: 11 }),
        onServerRevision,
      }),
    );

    expect(onServerRevision).toHaveBeenCalledWith(11);
  });

  it('does not arm the replica before a dominating remote is adopted (Step 21)', async () => {
    // Arming first would pump a pending local document against the server's
    // revision and overwrite the very cloud save the adopt restores.
    const onServerRevision = vi.fn();

    await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => null, storeActiveSave: async () => {} },
        download: async () => ({ document: progressingDocument(), receivedAtMs: NOW_MS, revision: 11 }),
        onServerRevision,
      }),
    );

    expect(onServerRevision).not.toHaveBeenCalled();
  });

  it('reports no revision when the account has no cloud save', async () => {
    const onServerRevision = vi.fn();

    await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({ download: async () => null, onServerRevision }),
    );

    expect(onServerRevision).not.toHaveBeenCalled();
  });

  it('treats a device with no local record at all as having no progress, and adopts the cloud save', async () => {
    const stored: CloudSaveDownload = { document: progressingDocument(), receivedAtMs: NOW_MS, revision: 1 };
    let written: SaveDocumentV2 | null = null;
    const reload = vi.fn();
    const clearLifecycleJournal = vi.fn();

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: {
          loadActiveSave: async () => null,
          storeActiveSave: async (document) => {
            written = document;
          },
        },
        download: async () => stored,
        reload,
        clearLifecycleJournal,
      }),
    );

    expect(outcome).toEqual({ kind: 'adopted-remote' });
    expect(written).toEqual(stored.document);
    expect(reload).toHaveBeenCalledOnce();
    // A 2026-09-13 review finding: `storeActiveSave`'s own `clearThrough`
    // compares the adopted document's timestamp — another device's clock —
    // against whatever the journal holds, which can leave a stale local
    // entry behind to win on the next boot. Clearing unconditionally,
    // right before reload, is what actually removes that class of bug.
    expect(clearLifecycleJournal).toHaveBeenCalledOnce();
  });

  it('never clears the lifecycle journal on an outcome that does not adopt', async () => {
    const clearLifecycleJournal = vi.fn();
    const noSession = await reconcileCloudSaveAtBoot(null, NOW_MS, fakeDeps({ clearLifecycleJournal }));
    const noCloudSave = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({ download: async () => null, clearLifecycleJournal }),
    );
    const keptLocal = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => progressingDocument(), storeActiveSave: async () => {} },
        download: async () => ({ document: freshDocument(), receivedAtMs: NOW_MS, revision: 1 }),
        clearLifecycleJournal,
      }),
    );

    expect(noSession).toEqual({ kind: 'no-session' });
    expect(noCloudSave).toEqual({ kind: 'no-cloud-save' });
    expect(keptLocal).toEqual({ kind: 'kept-local' });
    expect(clearLifecycleJournal).not.toHaveBeenCalled();
  });

  it('adopts the cloud save when the local device has a fresh record but no progress', async () => {
    const stored: CloudSaveDownload = { document: progressingDocument(), receivedAtMs: NOW_MS, revision: 1 };
    const reload = vi.fn();

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: {
          loadActiveSave: async () => freshDocument(),
          storeActiveSave: async () => {},
        },
        download: async () => stored,
        reload,
      }),
    );

    expect(outcome).toEqual({ kind: 'adopted-remote' });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps local untouched when local has progress and the cloud save has none', async () => {
    const stored: CloudSaveDownload = { document: freshDocument(), receivedAtMs: NOW_MS, revision: 1 };
    const storeActiveSave = vi.fn(async () => {});
    const reload = vi.fn();

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => progressingDocument(), storeActiveSave },
        download: async () => stored,
        reload,
      }),
    );

    expect(outcome).toEqual({ kind: 'kept-local' });
    expect(storeActiveSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('defers a genuine fork — both sides have progress — writing and reloading nothing, and retains both candidates', async () => {
    const remoteDocument = (() => {
      const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
      return createSaveDocument(
        { ...state, warehouse: { ...state.warehouse, totalGoldDelivered: GameNumber.from(10) } },
        BASE_GAME_BALANCE,
        NOW_MS,
      );
    })();
    const storeActiveSave = vi.fn(async () => {});
    const reload = vi.fn();
    const localDocument = progressingDocument();

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => localDocument, storeActiveSave },
        download: async () => ({ document: remoteDocument, receivedAtMs: NOW_MS, revision: 1 }),
        reload,
      }),
    );

    expect(outcome.kind).toBe('deferred-conflict');
    if (outcome.kind !== 'deferred-conflict') {
      throw new Error('expected a deferred conflict');
    }
    // §7.3: neither candidate is destroyed, and both travel back to the caller
    // so the unchosen one survives the session.
    expect(outcome.local.document).toEqual(localDocument);
    expect(outcome.local.lastPlayedMs).toBe(localDocument.savedAtTimestampMs);
    expect(outcome.remote.document).toEqual(remoteDocument);
    expect(outcome.remote.lastPlayedMs).toBe(NOW_MS);
    expect(storeActiveSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports same progress — vectors equal — without writing over either document', async () => {
    const localDocument = freshDocument();
    const storeActiveSave = vi.fn(async () => {});
    const reload = vi.fn();

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => localDocument, storeActiveSave },
        download: async () => ({ document: freshDocument(), receivedAtMs: NOW_MS, revision: 1 }),
        reload,
      }),
    );

    expect(outcome).toEqual({ kind: 'same-progress' });
    expect(storeActiveSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('adopts local silently when local is a strict superset of the cloud save', async () => {
    const localDocument = progressingDocument();
    const storeActiveSave = vi.fn(async () => {});
    const reload = vi.fn();

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => localDocument, storeActiveSave },
        download: async () => ({ document: freshDocument(), receivedAtMs: NOW_MS, revision: 1 }),
        reload,
      }),
    );

    expect(outcome).toEqual({ kind: 'kept-local' });
    expect(storeActiveSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('falls back to a fresh baseline, rather than failing, when the local document is corrupt', async () => {
    const stored: CloudSaveDownload = { document: progressingDocument(), receivedAtMs: NOW_MS, revision: 1 };

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => ({ not: 'a valid save document' }), storeActiveSave: async () => {} },
        download: async () => stored,
      }),
    );

    expect(outcome).toEqual({ kind: 'adopted-remote' });
  });

  it('resolves a typed error instead of throwing when a collaborator rejects', async () => {
    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        download: async () => {
          throw new Error('network unreachable');
        },
      }),
    );

    expect(outcome).toEqual({ kind: 'error', reason: 'network unreachable' });
  });
});

describe('adoptExistingLocalSave (Step 20)', () => {
  /**
   * A pre-milestone document: valid in every other respect, but schema 1 and
   * with no `warehouse.totalOfflineGoldClaimed` (the field Step 18 added).
   * Defaults to a progressed save, not a fresh one, so a migration that dropped
   * progress would be caught.
   */
  function versionOneDocument(base: SaveDocumentV2 = progressingDocument()): Record<string, unknown> {
    const current = base as unknown as Record<string, unknown> & {
      state: { warehouse: Record<string, unknown> };
    };
    const warehouse = Object.fromEntries(
      Object.entries(current.state.warehouse).filter(
        ([key]) => key !== 'totalOfflineGoldClaimed',
      ),
    );

    return {
      ...current,
      schemaVersion: 1,
      state: { ...current.state, warehouse },
    };
  }

  it('uploads the migrated document for a progressed pre-milestone version-1 local save', async () => {
    const original = progressingDocument();
    const forceUpload = vi.fn();
    const result = await adoptExistingLocalSave({
      repository: { loadActiveSave: async () => versionOneDocument(original) },
      config: BASE_GAME_BALANCE,
      forceUpload,
    });

    expect(result).toEqual({ kind: 'uploaded' });
    expect(forceUpload).toHaveBeenCalledOnce();

    const uploaded = forceUpload.mock.calls[0]?.[0] as SaveDocumentV2;
    expect(uploaded.schemaVersion).toBe(2);
    expect(uploaded.state.warehouse.totalOfflineGoldClaimed).toBe('0');
    // Every other field — including the player's progress — survives exactly.
    expect(uploaded.state.gold).toBe(original.state.gold);
    expect(uploaded.state.elevator).toEqual(original.state.elevator);
    expect(uploaded.state.floors).toEqual(original.state.floors);
    expect(uploaded.savedAtTimestampMs).toBe(original.savedAtTimestampMs);
    expect(uploaded.effectiveProductionRatePerSecond).toBe(
      original.effectiveProductionRatePerSecond,
    );
  });

  it('expands a legacy four-floor version-1 save to the current fifteen-floor shape', async () => {
    const full = progressingDocument();
    const legacy = versionOneDocument(full) as {
      state: { floors: unknown[] };
    } & Record<string, unknown>;
    const fourFloor = {
      ...legacy,
      state: { ...legacy.state, floors: legacy.state.floors.slice(0, 4) },
    };

    const forceUpload = vi.fn();
    const result = await adoptExistingLocalSave({
      repository: { loadActiveSave: async () => fourFloor },
      config: BASE_GAME_BALANCE,
      forceUpload,
    });

    expect(result).toEqual({ kind: 'uploaded' });
    const uploaded = forceUpload.mock.calls[0]?.[0] as SaveDocumentV2;
    expect(uploaded.state.floors).toHaveLength(BASE_GAME_BALANCE.floors.length);
    // The four pre-milestone floors survive; the added ones are locked defaults.
    expect(uploaded.state.floors.slice(0, 4)).toEqual(full.state.floors.slice(0, 4));
    expect(uploaded.state.floors.slice(4).every((floor) => !floor.isUnlocked)).toBe(true);
  });

  it('reports no-local-save and uploads nothing when the device has no record', async () => {
    const forceUpload = vi.fn();
    const result = await adoptExistingLocalSave({
      repository: { loadActiveSave: async () => null },
      config: BASE_GAME_BALANCE,
      forceUpload,
    });

    expect(result).toEqual({ kind: 'no-local-save' });
    expect(forceUpload).not.toHaveBeenCalled();
  });

  it('reports unreadable and uploads nothing when the local document is corrupt', async () => {
    const forceUpload = vi.fn();
    const result = await adoptExistingLocalSave({
      repository: { loadActiveSave: async () => ({ not: 'a save document' }) },
      config: BASE_GAME_BALANCE,
      forceUpload,
    });

    expect(result).toEqual({ kind: 'unreadable' });
    expect(forceUpload).not.toHaveBeenCalled();
  });

  it('reports unreadable rather than throwing when the repository rejects', async () => {
    const result = await adoptExistingLocalSave({
      repository: {
        loadActiveSave: async () => {
          throw new Error('storage unavailable');
        },
      },
      config: BASE_GAME_BALANCE,
      forceUpload: vi.fn(),
    });

    expect(result).toEqual({ kind: 'unreadable' });
  });

  it('reports upload-failed — not unreadable — when the forced upload does', async () => {
    const result = await adoptExistingLocalSave({
      repository: { loadActiveSave: async () => progressingDocument() },
      config: BASE_GAME_BALANCE,
      forceUpload: () => {
        throw new Error('replica unavailable');
      },
    });

    expect(result).toEqual({ kind: 'upload-failed' });
  });
});

describe('downloadCloudSaveViaFetch', () => {
  it('resolves null on 204 without reading a body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadCloudSaveViaFetch('https://example.test/v1/save', 'token');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/v1/save', {
      headers: { authorization: 'Bearer token' },
    });
    vi.unstubAllGlobals();
  });

  it('parses a 200 response into a document and receivedAtMs', async () => {
    const document = freshDocument();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ revision: 3, receivedAt: '2026-01-01T00:00:00.000Z', document }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadCloudSaveViaFetch('https://example.test/v1/save', 'token');

    expect(result).toEqual({
      document,
      receivedAtMs: Date.parse('2026-01-01T00:00:00.000Z'),
      revision: 3,
    });
    vi.unstubAllGlobals();
  });

  it('throws on a non-204, non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: {} }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadCloudSaveViaFetch('https://example.test/v1/save', 'token')).rejects.toThrow(/500/);
    vi.unstubAllGlobals();
  });
});

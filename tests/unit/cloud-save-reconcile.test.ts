import { describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV1 } from '../../src/persistence';
import {
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

function freshDocument(): SaveDocumentV1 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

function progressingDocument(): SaveDocumentV1 {
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
    ...overrides,
  };
}

describe('reconcileCloudSaveAtBoot', () => {
  it('does nothing when there is no session', async () => {
    const outcome = await reconcileCloudSaveAtBoot(null, NOW_MS, fakeDeps());
    expect(outcome).toEqual({ kind: 'no-session' });
  });

  it('does nothing when the account has no cloud save', async () => {
    const outcome = await reconcileCloudSaveAtBoot('token', NOW_MS, fakeDeps({ download: async () => null }));
    expect(outcome).toEqual({ kind: 'no-cloud-save' });
  });

  it('treats a device with no local record at all as having no progress, and adopts the cloud save', async () => {
    const stored: CloudSaveDownload = { document: progressingDocument(), receivedAtMs: NOW_MS };
    let written: SaveDocumentV1 | null = null;
    const reload = vi.fn();

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
      }),
    );

    expect(outcome).toEqual({ kind: 'adopted-remote' });
    expect(written).toEqual(stored.document);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('adopts the cloud save when the local device has a fresh record but no progress', async () => {
    const stored: CloudSaveDownload = { document: progressingDocument(), receivedAtMs: NOW_MS };
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
    const stored: CloudSaveDownload = { document: freshDocument(), receivedAtMs: NOW_MS };
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

  it('defers a genuine fork — both sides have progress — writing and reloading nothing', async () => {
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

    const outcome = await reconcileCloudSaveAtBoot(
      'token',
      NOW_MS,
      fakeDeps({
        repository: { loadActiveSave: async () => progressingDocument(), storeActiveSave },
        download: async () => ({ document: remoteDocument, receivedAtMs: NOW_MS }),
        reload,
      }),
    );

    expect(outcome).toEqual({ kind: 'deferred-conflict' });
    expect(storeActiveSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('falls back to a fresh baseline, rather than failing, when the local document is corrupt', async () => {
    const stored: CloudSaveDownload = { document: progressingDocument(), receivedAtMs: NOW_MS };

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

    expect(result).toEqual({ document, receivedAtMs: Date.parse('2026-01-01T00:00:00.000Z') });
    vi.unstubAllGlobals();
  });

  it('throws on a non-204, non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: {} }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadCloudSaveViaFetch('https://example.test/v1/save', 'token')).rejects.toThrow(/500/);
    vi.unstubAllGlobals();
  });
});

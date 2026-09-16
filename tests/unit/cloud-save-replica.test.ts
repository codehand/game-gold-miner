import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import {
  createSaveDocument,
  CloudSaveReplica,
  describeCloudSaveNotice,
  stateShapeSignature,
  type CloudSaveFailureCode,
  type CloudSaveReplicaEvent,
  type CloudSaveReplicaOptions,
  type CloudSaveUploadResult,
  type SaveDocumentV2,
  type UploadCloudSave,
} from '../../src/persistence';

/**
 * Server-milestone Step 19: the cloud replica's policy half is exercised with
 * every collaborator injected — the upload call, the wall clock, and the
 * timers — so §9's cadence/backoff and §7's `409` handling are provable
 * without a network or an IndexedDB. `src/persistence/cloudSaveReplica.ts` is
 * pure by construction; the one real `fetch` lives in
 * `src/platform/web/cloudSaveUpload.ts` and is tested separately.
 */
const T0 = 1_788_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

function freshDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, T0);
  return createSaveDocument(state, BASE_GAME_BALANCE, T0);
}

/** Elevator one level ahead: a strict superset of `freshDocument`. */
function elevatorProgressDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, T0);
  const level = state.elevator.level + 1;
  const progressed: GameState = {
    ...state,
    elevator: {
      ...state.elevator,
      level,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.elevator.baseCapacity,
        level,
        BASE_GAME_BALANCE.elevator.upgrade,
      ),
    },
  };
  return createSaveDocument(progressed, BASE_GAME_BALANCE, T0);
}

/** Warehouse delivery only: a fork against `elevatorProgressDocument`. */
function warehouseProgressDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, T0);
  const progressed: GameState = {
    ...state,
    warehouse: { ...state.warehouse, totalGoldDelivered: GameNumber.from(10) },
  };
  return createSaveDocument(progressed, BASE_GAME_BALANCE, T0);
}

function accepted(revision: number): CloudSaveUploadResult {
  return { kind: 'accepted', revision };
}

function conflict(document: SaveDocumentV2, serverRevision = 7): CloudSaveUploadResult {
  return { kind: 'conflict', serverRevision, receivedAtMs: T0 + 1_000, document };
}

function retryable(): CloudSaveUploadResult {
  return { kind: 'retryable', code: 'server_error', message: 'boom' };
}

function makeReplica(
  upload: UploadCloudSave,
  extra: Partial<CloudSaveReplicaOptions> = {},
): { replica: CloudSaveReplica; events: CloudSaveReplicaEvent[] } {
  const events: CloudSaveReplicaEvent[] = [];
  const replica = new CloudSaveReplica({
    upload,
    config: BASE_GAME_BALANCE,
    now: () => Date.now(),
    onEvent: (event) => events.push(event),
    ...extra,
  });

  // §11: production only uploads after the boot reconcile has settled. These
  // cadence/backoff tests are not about that gate, so they arm with "no cloud
  // save yet" up front; the gate itself has its own describe below.
  replica.arm(null);

  return { replica, events };
}

describe('CloudSaveReplica upload cadence (§9)', () => {
  it('uploads the first document immediately against a null baseRevision', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => accepted(1));
    const { replica } = makeReplica(upload);
    const document = freshDocument();

    replica.enqueue(document);
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(null, document);
    expect(replica.baseRevision).toBe(1);
  });

  it('holds a second routine upload until 60 s have passed', async () => {
    const upload = vi
      .fn<UploadCloudSave>()
      .mockResolvedValueOnce(accepted(1))
      .mockResolvedValueOnce(accepted(2));
    const { replica } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    vi.setSystemTime(T0 + 59_000);
    replica.enqueue(elevatorProgressDocument());
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(replica.baseRevision).toBe(2);
  });

  it('lets a forced trigger bypass the interval', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => accepted(1));
    const { replica } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    vi.setSystemTime(T0 + 1_000);
    const forced = elevatorProgressDocument();
    replica.enqueue(forced, { force: true });
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(1, forced);
  });

  it('coalesces — only the newest queued document is ever sent', async () => {
    const resolvers: Array<(result: CloudSaveUploadResult) => void> = [];
    const upload = vi
      .fn<UploadCloudSave>()
      .mockImplementationOnce(
        () =>
          new Promise<CloudSaveUploadResult>((resolve) => {
            resolvers.push(resolve);
          }),
      )
      .mockImplementation(async () => accepted(2));
    const { replica } = makeReplica(upload);
    const first = elevatorProgressDocument();
    const newest = warehouseProgressDocument();

    replica.enqueue(freshDocument());
    replica.enqueue(first);
    replica.enqueue(newest);

    expect(resolvers).toHaveLength(1);
    resolvers[0]?.(accepted(1));
    await replica.flush();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(1, newest);
  });

  it('does nothing when unconfigured and stays able to try again later', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({ kind: 'unconfigured' }));
    const { replica, events } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ kind: 'unconfigured' });
    expect(replica.isStopped).toBe(false);
  });
});

describe('CloudSaveReplica retry backoff (§9)', () => {
  it('retries a retryable failure after the first backoff delay', async () => {
    const upload = vi
      .fn<UploadCloudSave>()
      .mockResolvedValueOnce(retryable())
      .mockResolvedValueOnce(accepted(3));
    const { replica, events } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      kind: 'retry-scheduled',
      attempt: 1,
      delayMs: 1_000,
      code: 'server_error',
      message: 'boom',
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(replica.baseRevision).toBe(3);
  });

  it('resets the retry budget when a conflict re-upload starts a fresh trigger', async () => {
    const local = elevatorProgressDocument();
    const upload = vi
      .fn<UploadCloudSave>()
      .mockResolvedValueOnce(retryable())
      .mockResolvedValueOnce(conflict(freshDocument(), 7))
      .mockResolvedValueOnce(retryable());
    const { replica, events } = makeReplica(upload);

    replica.enqueue(local);
    await replica.flush();
    await vi.advanceTimersByTimeAsync(1_000);
    await replica.flush();

    const retries = events.filter((event) => event.kind === 'retry-scheduled');
    expect(retries).toHaveLength(2);
    // The local-dominates re-upload is a new trigger, so its first retry waits
    // 1 s again rather than continuing the previous budget at 2 s.
    expect(retries[0]).toMatchObject({ attempt: 1, delayMs: 1_000 });
    expect(retries[1]).toMatchObject({ attempt: 1, delayMs: 1_000 });
  });

  it('stops cloud sync for the session after the initial attempt and five retries', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => retryable());
    const { replica, events } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(8_000);
    await vi.advanceTimersByTimeAsync(16_000);

    expect(upload).toHaveBeenCalledTimes(6);
    expect(replica.isStopped).toBe(true);
    expect(events).toContainEqual({
      kind: 'retry-scheduled',
      attempt: 5,
      delayMs: 16_000,
      code: 'server_error',
      message: 'boom',
    });
    expect(events).toContainEqual({
      kind: 'sync-stopped',
      code: 'server_error',
      message: 'boom',
    });

    replica.enqueue(freshDocument());
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(6);
  });
});

describe('CloudSaveReplica conflict handling (§7)', () => {
  it('adopts the server revision silently when the two saves have equal progress', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => conflict(freshDocument(), 9));
    const { replica, events } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(replica.baseRevision).toBe(9);
    expect(events).toContainEqual({ kind: 'same-progress', revision: 9 });
  });

  it('re-uploads a dominating local against the server revision', async () => {
    const local = elevatorProgressDocument();
    const upload = vi
      .fn<UploadCloudSave>()
      .mockResolvedValueOnce(conflict(freshDocument(), 7))
      .mockResolvedValueOnce(accepted(8));
    const { replica, events } = makeReplica(upload);

    replica.enqueue(local);
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenNthCalledWith(1, null, local);
    expect(upload).toHaveBeenNthCalledWith(2, 7, local);
    expect(replica.baseRevision).toBe(8);
    expect(events).toContainEqual({ kind: 'local-dominates', revision: 7 });
  });

  it('keeps a newer queued document when a dominating local re-uploads (§9 coalescing)', async () => {
    const local = elevatorProgressDocument();
    const newer = warehouseProgressDocument();
    const resolvers: Array<(result: CloudSaveUploadResult) => void> = [];
    const upload = vi
      .fn<UploadCloudSave>()
      .mockImplementationOnce(
        () =>
          new Promise<CloudSaveUploadResult>((resolve) => {
            resolvers.push(resolve);
          }),
      )
      .mockImplementation(async () => accepted(8));
    const { replica } = makeReplica(upload);

    replica.enqueue(local);
    replica.enqueue(newer);

    expect(resolvers).toHaveLength(1);
    resolvers[0]?.(conflict(freshDocument(), 7));
    await replica.flush();

    expect(upload).toHaveBeenNthCalledWith(2, 7, newer);
  });

  it('hands a dominating remote to the caller to adopt instead of overwriting it', async () => {
    const remote = elevatorProgressDocument();
    const upload = vi.fn<UploadCloudSave>(async () => conflict(remote, 4));
    const adopt = vi.fn();
    const { replica, events } = makeReplica(upload, { onRemoteDominates: adopt });

    replica.enqueue(freshDocument());
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(adopt).toHaveBeenCalledWith(remote, T0 + 1_000);
    expect(events).toContainEqual({ kind: 'remote-dominates' });
  });

  it('retains both candidates on a genuine fork and writes neither', async () => {
    const local = elevatorProgressDocument();
    const remote = warehouseProgressDocument();
    const upload = vi.fn<UploadCloudSave>(async () => conflict(remote, 6));
    const onFork = vi.fn();
    const { replica, events } = makeReplica(upload, { onFork });

    replica.enqueue(local);
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(onFork).toHaveBeenCalledTimes(1);
    const forkEvent = events.find((event) => event.kind === 'fork');
    if (forkEvent?.kind !== 'fork') {
      throw new Error('expected a fork event');
    }
    expect(forkEvent.local.document).toEqual(local);
    expect(forkEvent.remote.document).toEqual(remote);
    expect(replica.baseRevision).toBe(6);
    // §7.3: with no chooser, sync must stop. The client holds the server's
    // revision now, so one more routine save would be accepted and would
    // replace the remote branch the player was never shown.
    expect(replica.isStopped).toBe(true);

    // A later routine save is a no-op — the unshown branch survives.
    vi.setSystemTime(T0 + 60_000);
    replica.enqueue(elevatorProgressDocument(), { force: true });
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('stops sync rather than adjudicating an unvalidated conflict body', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({
      kind: 'conflict',
      serverRevision: 2,
      receivedAtMs: T0,
      document: { not: 'a save document' },
    }));
    const { replica, events } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    expect(replica.isStopped).toBe(true);
    expect(events).toContainEqual({
      kind: 'sync-stopped',
      code: 'malformed_request',
      message: 'Conflict response carried no valid save document.',
    });
  });
});

describe('CloudSaveReplica terminal failures (§4)', () => {
  it.each(['forbidden', 'schema_unsupported', 'payload_too_large'] as const)(
    'stops cloud sync for the session on %s',
    async (code) => {
      const upload = vi.fn<UploadCloudSave>(async () => ({
        kind: 'terminal',
        code,
        message: 'refused',
        keepSyncing: false,
      }));
      const { replica, events } = makeReplica(upload);

      replica.enqueue(freshDocument());
      await replica.flush();

      expect(replica.isStopped).toBe(true);
      expect(events).toContainEqual({ kind: 'sync-stopped', code, message: 'refused' });
    },
  );

  it('emits document-dropped and keeps the session alive on a per-document rejection', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({
      kind: 'terminal',
      code: 'save_invalid',
      message: 'bad',
      keepSyncing: true,
    }));
    const { replica, events } = makeReplica(upload);

    replica.enqueue(freshDocument());
    await replica.flush();

    expect(replica.isStopped).toBe(false);
    expect(events).toContainEqual({ kind: 'document-dropped', code: 'save_invalid', message: 'bad' });
  });

  it('stops re-uploading a rejected save on the routine cadence even as its timestamp moves', async () => {
    const rejected = freshDocument();
    const upload = vi.fn<UploadCloudSave>(async () => ({
      kind: 'terminal',
      code: 'save_invalid',
      message: 'bad',
      keepSyncing: true,
    }));
    const { replica } = makeReplica(upload);

    replica.enqueue(rejected);
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(1);

    // Routine saves carry a fresh `savedAtTimestampMs`; the save's *state* is
    // what the server rejected, so none of these are new attempts — even once
    // the 60 s cadence would have allowed one.
    for (let index = 1; index <= 3; index += 1) {
      vi.setSystemTime(T0 + 120_000 * index);
      replica.enqueue({ ...rejected, savedAtTimestampMs: T0 + index * 1_000 });
      await replica.flush();
    }
    expect(upload).toHaveBeenCalledTimes(1);
    expect(replica.isStopped).toBe(false);
  });

  it('lets a forced trigger retry a rejected save, and clears the suppression when it recovers', async () => {
    const rejected = freshDocument();
    const upload = vi
      .fn<UploadCloudSave>()
      .mockResolvedValueOnce({
        kind: 'terminal',
        code: 'save_invalid',
        message: 'bad',
        keepSyncing: true,
      })
      .mockImplementation(async () => accepted(2));
    const { replica } = makeReplica(upload);

    replica.enqueue(rejected);
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(1);

    // A forced trigger — a lifecycle flush, a claimed reward — is the recovery
    // path for a transient server-side rejection.
    vi.setSystemTime(T0 + 1_000);
    replica.enqueue(rejected, { force: true });
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(2);

    // Recovery cleared the suppression, so the routine cadence resumes.
    vi.setSystemTime(T0 + 120_000);
    replica.enqueue({ ...rejected, savedAtTimestampMs: T0 + 120_000 });
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it('allows a new attempt when the rejected save’s structure actually changes', async () => {
    const rejected = freshDocument();
    const upload = vi.fn<UploadCloudSave>(async () => ({
      kind: 'terminal',
      code: 'save_invalid',
      message: 'bad',
      keepSyncing: true,
    }));
    const { replica } = makeReplica(upload);

    replica.enqueue(rejected);
    await replica.flush();

    const structurallyChanged = {
      ...rejected,
      state: { ...rejected.state, newStructuralField: true },
    } as unknown as SaveDocumentV2;
    vi.setSystemTime(T0 + 120_000);
    replica.enqueue(structurallyChanged);
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(2);
  });
});

describe('CloudSaveReplica arming (§11 boot order)', () => {
  it('holds every upload until the boot reconcile arms it', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => accepted(1));
    const events: CloudSaveReplicaEvent[] = [];
    const replica = new CloudSaveReplica({
      upload,
      config: BASE_GAME_BALANCE,
      now: () => Date.now(),
      onEvent: (event) => events.push(event),
    });

    replica.enqueue(freshDocument());
    await replica.flush();
    expect(upload).not.toHaveBeenCalled();

    // The reconcile downloaded revision 4.
    replica.arm(4);
    await replica.flush();

    expect(upload).toHaveBeenCalledWith(4, freshDocument());
    expect(events).toContainEqual({ kind: 'uploaded', revision: 1 });
  });

  it('lets the first arm win, so a later null cannot overwrite a real revision', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => accepted(1));
    const replica = new CloudSaveReplica({
      upload,
      config: BASE_GAME_BALANCE,
      now: () => Date.now(),
    });

    replica.arm(9);
    replica.arm(null);
    replica.enqueue(freshDocument());
    await replica.flush();

    expect(upload).toHaveBeenCalledWith(9, freshDocument());
  });

  it('never arms after stop, so a fork cannot upload', async () => {
    const upload = vi.fn<UploadCloudSave>();
    const replica = new CloudSaveReplica({
      upload,
      config: BASE_GAME_BALANCE,
      now: () => Date.now(),
    });

    replica.stop();
    replica.arm(3);
    replica.enqueue(freshDocument());
    await replica.flush();

    expect(upload).not.toHaveBeenCalled();
  });
});

describe('describeCloudSaveNotice (§4 player-facing copy)', () => {
  const codes: readonly CloudSaveFailureCode[] = [
    'unauthenticated',
    'forbidden',
    'malformed_request',
    'payload_too_large',
    'save_invalid',
    'schema_unsupported',
    'save_rejected',
    'rate_limited',
    'server_error',
    'service_unavailable',
  ];

  it('namespaces every notice cloud-sync-* and gives every cause its own copy', () => {
    for (const code of codes) {
      expect(describeCloudSaveNotice(code).code).toMatch(/^cloud-sync-[a-z-]+$/);
      expect(describeCloudSaveNotice(code).message.length).toBeGreaterThan(0);
    }
  });

  it("uses §4's exact copy for each distinct consequence", () => {
    expect(describeCloudSaveNotice('save_invalid')).toEqual({
      code: 'cloud-sync-save-invalid',
      message: 'Your progress could not be uploaded. Your game on this device is unchanged.',
    });
    expect(describeCloudSaveNotice('save_rejected').message).toBe(
      'Your progress could not be verified and was not uploaded. Your game on this device is unchanged.',
    );
    expect(describeCloudSaveNotice('schema_unsupported').message).toBe(
      'Cloud sync needs an app update. Your progress is saved on this device.',
    );
    expect(describeCloudSaveNotice('unauthenticated').message).toBe(
      'Cloud sync is signed out. Your progress is saved on this device.',
    );
    for (const code of ['forbidden', 'malformed_request', 'payload_too_large', 'rate_limited', 'server_error', 'service_unavailable'] as const) {
      expect(describeCloudSaveNotice(code).message).toBe(
        'Cloud sync is unavailable. Your progress is saved on this device.',
      );
    }
  });
});

describe('stateShapeSignature', () => {
  it('ignores moving values but detects a structural change', () => {
    const state = freshDocument().state;
    const moved = { ...state, gold: '999999' };

    expect(stateShapeSignature(moved)).toBe(stateShapeSignature(state));
    expect(stateShapeSignature({ ...state, extraField: true })).not.toBe(
      stateShapeSignature(state),
    );
    expect(
      stateShapeSignature({ ...state, floors: state.floors.slice(0, 1) }),
    ).not.toBe(stateShapeSignature(state));
  });
});

describe('CloudSaveReplica construction', () => {
  it('rejects an invalid upload interval', () => {
    expect(() => new CloudSaveReplica({
      upload: async () => accepted(1),
      config: BASE_GAME_BALANCE,
      now: () => Date.now(),
      minIntervalMs: -1,
    })).toThrow(/interval/);
  });
});

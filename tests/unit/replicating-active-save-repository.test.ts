import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import {
  createSaveDocument,
  CloudSaveReplica,
  ReplicatingActiveSaveRepository,
  type ActiveSaveRepository,
  type CloudSaveUploadResult,
  type SaveDocumentV2,
  type UploadCloudSave,
} from '../../src/persistence';

/**
 * Server-milestone Step 19: the composition itself. IndexedDB is primary —
 * `loadActiveSave` never touches the replica, and a local write that throws
 * rejects so `SavePersistenceCoordinator` still reports `save-failed` — while
 * a successful local write offers the same document to the replica without
 * ever awaiting it.
 */
const T0 = 1_788_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

function document(): SaveDocumentV2 {
  return createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, T0),
    BASE_GAME_BALANCE,
    T0,
  );
}

class MemoryPrimary implements ActiveSaveRepository {
  public stored: SaveDocumentV2[] = [];
  public failWrites = false;
  public loaded: unknown | null = null;

  public async loadActiveSave(): Promise<unknown | null> {
    return this.loaded;
  }

  public async storeActiveSave(candidate: SaveDocumentV2): Promise<void> {
    if (this.failWrites) {
      throw new Error('local write failed');
    }
    this.stored.push(candidate);
  }
}

function makeRepository(upload: UploadCloudSave) {
  const primary = new MemoryPrimary();
  const replica = new CloudSaveReplica({
    upload,
    config: BASE_GAME_BALANCE,
    now: () => Date.now(),
  });
  // §11: a real session arms the replica after the boot reconcile; these tests
  // are about the composition, so they arm with "no cloud save yet."
  replica.arm(null);

  return { primary, replica, repository: new ReplicatingActiveSaveRepository(primary, replica) };
}

describe('ReplicatingActiveSaveRepository', () => {
  it('reads through the local store only', async () => {
    const upload = vi.fn<UploadCloudSave>();
    const { primary, repository } = makeRepository(upload);
    primary.loaded = { from: 'primary' };

    await expect(repository.loadActiveSave()).resolves.toEqual({ from: 'primary' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('writes local first, then offers the same document to the replica', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({ kind: 'accepted', revision: 1 }));
    const { primary, replica, repository } = makeRepository(upload);
    const save = document();

    await repository.storeActiveSave(save);
    await replica.flush();

    expect(primary.stored).toEqual([save]);
    expect(upload).toHaveBeenCalledWith(null, save);
  });

  it('rejects when the local write fails, so the coordinator still reports it', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({ kind: 'accepted', revision: 1 }));
    const { primary, repository } = makeRepository(upload);
    primary.failWrites = true;

    await expect(repository.storeActiveSave(document())).rejects.toThrow(/local write failed/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('forces the most recently stored document at a lifecycle boundary', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({ kind: 'accepted', revision: 1 }));
    const { replica, repository } = makeRepository(upload);
    const save = document();

    await repository.storeActiveSave(save);
    await replica.flush();
    expect(upload).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 1_000);
    repository.forceCloudUpload();
    await replica.flush();

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(1, save);
  });

  it('forces an explicitly supplied document without a prior store', async () => {
    const upload = vi.fn<UploadCloudSave>(async () => ({ kind: 'accepted', revision: 1 }));
    const { replica, repository } = makeRepository(upload);
    const save = document();

    repository.forceCloudUpload(save);
    await replica.flush();

    expect(upload).toHaveBeenCalledWith(null, save);
  });

  it('does nothing on a forced call before any document exists', async () => {
    const upload = vi.fn<UploadCloudSave>();
    const { replica, repository } = makeRepository(upload);

    repository.forceCloudUpload();
    await replica.flush();

    expect(upload).not.toHaveBeenCalled();
  });

  it('swallows a replica that resolves an unexpected result without surfacing it', async () => {
    const upload = vi.fn<UploadCloudSave>(
      async (): Promise<CloudSaveUploadResult> => ({ kind: 'unconfigured' }),
    );
    const { primary, replica, repository } = makeRepository(upload);

    await expect(repository.storeActiveSave(document())).resolves.toBeUndefined();
    await replica.flush();

    expect(primary.stored).toHaveLength(1);
  });
});

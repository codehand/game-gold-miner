import { describe, expect, it, vi } from 'vitest';

import {
  requestPersistentStorage,
  UNSUPPORTED_PERSISTENT_STORAGE_STATE,
  type StorageManagerLike,
} from '../../src/platform/web';

/**
 * Server-milestone Step 21: `requestPersistentStorage` records what the browser
 * actually answers — a grant is never treated as a guarantee — and never
 * throws. The `StorageManagerLike` slice is injected so no DOM is involved.
 */
describe('requestPersistentStorage (Step 21)', () => {
  it('reports unsupported when the storage manager is absent', async () => {
    await expect(requestPersistentStorage(null)).resolves.toEqual(
      UNSUPPORTED_PERSISTENT_STORAGE_STATE,
    );
  });

  it('reports supported with the browser’s answers', async () => {
    const manager: StorageManagerLike = {
      persist: async () => true,
      persisted: async () => true,
      estimate: async () => ({ quota: 120_000_000_000, usage: 4_000 }),
    };

    await expect(requestPersistentStorage(manager)).resolves.toEqual({
      supported: true,
      persisted: true,
      quotaBytes: 120_000_000_000,
      usageBytes: 4_000,
    });
  });

  it('lets persisted() re-read override the persist() answer', async () => {
    const manager: StorageManagerLike = {
      persist: async () => true,
      persisted: async () => false,
    };

    await expect(requestPersistentStorage(manager)).resolves.toMatchObject({
      supported: true,
      persisted: false,
    });
  });

  it('reports a denied persist() as false, not null', async () => {
    const manager: StorageManagerLike = { persist: async () => false, persisted: async () => false };

    await expect(requestPersistentStorage(manager)).resolves.toMatchObject({ persisted: false });
  });

  it('never throws when persist() rejects', async () => {
    const manager: StorageManagerLike = {
      persist: vi.fn().mockRejectedValue(new Error('denied')),
      persisted: async () => false,
    };

    await expect(requestPersistentStorage(manager)).resolves.toMatchObject({
      supported: true,
      persisted: false,
    });
  });

  it('reports unknown quota/usage when estimate() rejects or is absent', async () => {
    const throwing: StorageManagerLike = {
      estimate: vi.fn().mockRejectedValue(new Error('unavailable')),
    };
    const empty: StorageManagerLike = {};

    await expect(requestPersistentStorage(throwing)).resolves.toMatchObject({
      quotaBytes: null,
      usageBytes: null,
    });
    await expect(requestPersistentStorage(empty)).resolves.toEqual({
      supported: true,
      persisted: null,
      quotaBytes: null,
      usageBytes: null,
    });
  });
});

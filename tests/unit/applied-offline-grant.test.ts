import { describe, expect, it, vi } from 'vitest';

import {
  APPLIED_OFFLINE_GRANT_KEY,
  markOfflineGrantApplied,
  readAppliedOfflineGrantReceivedAtMs,
} from '../../src/platform/web';

/**
 * Server-milestone Step 22: the applied-grant receipt guard. It is
 * best-effort — a missing or throwing storage must never break boot — and it
 * exists only to stop a reload between crediting a grant and uploading it from
 * crediting the same server receipt twice.
 */
function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('applied offline grant receipt store (Step 22)', () => {
  it('reads null before any grant is applied', () => {
    expect(readAppliedOfflineGrantReceivedAtMs(memoryStorage())).toBeNull();
  });

  it('round-trips the receipt of the applied grant', () => {
    const storage = memoryStorage();

    markOfflineGrantApplied(storage, 1_788_000_000_000);

    expect(readAppliedOfflineGrantReceivedAtMs(storage)).toBe(1_788_000_000_000);
  });

  it('treats a corrupt stored value as no receipt', () => {
    const storage = memoryStorage();
    storage.setItem(APPLIED_OFFLINE_GRANT_KEY, 'not-a-number');

    expect(readAppliedOfflineGrantReceivedAtMs(storage)).toBeNull();
  });

  it('is a silent no-op with no storage', () => {
    expect(readAppliedOfflineGrantReceivedAtMs(null)).toBeNull();
    expect(() => markOfflineGrantApplied(null, 1)).not.toThrow();
  });

  it('never throws when storage rejects', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: vi.fn(),
    };

    expect(readAppliedOfflineGrantReceivedAtMs(storage)).toBeNull();
    expect(() => markOfflineGrantApplied(storage, 1_788_000_000_000)).not.toThrow();
  });

  it('ignores a non-positive receipt', () => {
    const storage = memoryStorage();

    markOfflineGrantApplied(storage, 0);
    markOfflineGrantApplied(storage, -1);

    expect(readAppliedOfflineGrantReceivedAtMs(storage)).toBeNull();
  });
});

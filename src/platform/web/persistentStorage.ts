/**
 * Server-milestone Step 21: ask the browser to make this origin's storage
 * persistent, and report what it actually said.
 *
 * `navigator.storage.persist()` is the only lever a web page has against
 * storage eviction. Whether it is granted is browser- and engagement-dependent,
 * and whether a grant actually exempts the data from iOS Safari's seven-day
 * script-writable-storage sweep is exactly the thing Step 21 measures rather
 * than assumes — so this module requests it, records the browser's real answer,
 * and never treats a grant as a guarantee.
 *
 * Takes a narrow `StorageManagerLike` slice so unit tests inject a fake instead
 * of mocking the DOM, mirroring `GuestAuthClient`/`GoogleAuthClient`. Never
 * throws: a missing API, a denied request, or a rejecting estimate all resolve
 * to a typed, partial state.
 */
export interface PersistentStorageState {
  /** `true` when `navigator.storage` existed at all. */
  readonly supported: boolean;
  /** The browser's answer to `persist()`, then its `persisted()` re-read; `null` when neither exists. */
  readonly persisted: boolean | null;
  readonly quotaBytes: number | null;
  readonly usageBytes: number | null;
}

export interface StorageManagerLike {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ readonly quota?: number; readonly usage?: number }>;
}

export const UNSUPPORTED_PERSISTENT_STORAGE_STATE: PersistentStorageState = {
  supported: false,
  persisted: null,
  quotaBytes: null,
  usageBytes: null,
};

export async function requestPersistentStorage(
  manager: StorageManagerLike | null,
): Promise<PersistentStorageState> {
  if (manager === null) {
    return UNSUPPORTED_PERSISTENT_STORAGE_STATE;
  }

  let persisted: boolean | null = null;

  try {
    persisted = (await manager.persist?.()) ?? null;
  } catch {
    // `persist()` may reject; the `null` default already covers that case.
  }

  try {
    if (manager.persisted) {
      persisted = await manager.persisted();
    }
  } catch {
    // Keep whatever `persist()` reported.
  }

  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;

  try {
    const estimate = await manager.estimate?.();
    quotaBytes = estimate?.quota ?? null;
    usageBytes = estimate?.usage ?? null;
  } catch {
    // An unavailable estimate is reported as unknown, not as zero.
  }

  return { supported: true, persisted, quotaBytes, usageBytes };
}

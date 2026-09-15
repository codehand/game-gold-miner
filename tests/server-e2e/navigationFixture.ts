/**
 * Server-milestone Step 21/22: these specs poll IndexedDB through raw
 * `page.evaluate`, and the flows they drive can navigate underneath that call.
 * A reload is part of the behaviour under test — `page.reload()` seeds the
 * eviction and offline-grant cases, and §7's adopt reloads the page a second
 * time when a dominating remote is taken mid-session (Step 19 finding M4), as
 * `local-save-eviction.spec.ts`'s own comment on the sibling test records.
 *
 * A Playwright locator retries across a navigation on its own; `page.evaluate`
 * does not — it rejects with "Execution context was destroyed". `expect.poll`
 * does not swallow an exception from its callback, so that rejection failed
 * the test outright instead of being retried, which is how
 * `local-save-eviction.spec.ts:229` went red in CI on a run where every
 * assertion it makes was still true.
 *
 * This treats only the transient navigation signatures as "not readable yet"
 * and rethrows everything else, so a genuine bug in a read still fails loudly
 * rather than quietly polling until its own timeout.
 */

/** Playwright's messages for "the context you evaluated in has gone away mid-navigation". */
const NAVIGATION_SIGNATURES = [
  'Execution context was destroyed',
  'Cannot find context with specified id',
  'frame was detached',
  'Frame was detached',
];

function isNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return NAVIGATION_SIGNATURES.some((signature) => message.includes(signature));
}

/**
 * Runs a page read, returning `null` when a navigation destroyed the execution
 * context so the surrounding `expect.poll` retries on the new document instead
 * of failing. A page that is *closed* is deliberately not tolerated: it never
 * recovers, so retrying would only trade a clear error for a poll timeout.
 */
export async function tolerateNavigation<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isNavigationError(error)) {
      return null;
    }
    throw error;
  }
}

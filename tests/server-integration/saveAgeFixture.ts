import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 23: move a stored row's `received_at` into the past.
 *
 * The upper-bound check measures elapsed time from `received_at`, so a fixture
 * that uploads fabricated progress as a *linear descendant* of the stored row
 * must represent the interval that progress stands for, or the bound correctly
 * rejects it as impossible over the few milliseconds between two test calls.
 * Ageing the row is how the fixture says "this save is the account's old one".
 *
 * It is deliberately **not** used to fake a divergent branch into the linear
 * bound. A branch that resolved a §7 conflict diverged from an older common
 * ancestor, and Step 23 accepts it through the row's own `previous_*` ancestor
 * (`save-sync`'s two-anchor check) — see the conflict suite, whose re-upload
 * needs no ageing for exactly that reason. `saves` denies every client write,
 * so this adjustment goes through the service-role fixture.
 */
export async function ageStoredSave(
  apiUrl: string,
  userId: string,
  secondsAgo: number,
): Promise<void> {
  const admin = createServiceRoleClient(apiUrl);
  const { error } = await admin
    .from('saves')
    .update({ received_at: new Date(Date.now() - secondsAgo * 1_000).toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`ageing the stored save failed: ${error.message}`);
  }
}

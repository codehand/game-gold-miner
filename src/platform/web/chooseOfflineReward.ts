import type { PendingOfflineReward } from '../../core';

/**
 * Server-milestone Step 22 review fix: the one decision that picks which
 * offline reward the player is credited, extracted from `src/main.ts` so the
 * ordering, the bound, and the fallback are unit-testable. Keeping it here also
 * keeps the four ordering flags in `main.ts` from encoding policy.
 *
 * Two rules, both from the Step 22 review:
 *
 * 1. **The server figure is a ceiling, and the client projection bounds it.**
 *    The stored `received_at` is the last *successful upload*, not the moment
 *    the player stopped, so the server grant can include up to a cadence window
 *    (or hours, when sync lagged) of time the open tab already produced at full
 *    rate. Crediting `min(serverGrant, localProjection)` restores "only a
 *    closed interval reaches the grant." It is cheat-safe because it is a
 *    minimum: a manipulated clock can only make the local projection larger
 *    (in which case the server grant wins) or smaller (in which case the player
 *    under-credits themselves). It never awards more than either source.
 *
 *    A **null or zero projection is a zero closed interval, not "no bound"**: a
 *    projection is zero exactly when the local save is at least as recent as
 *    the grant's receipt (the tab flushed before reloading, or uploads lagged),
 *    so there is nothing the server grant may credit. Treating it as unbounded
 *    is the H2 gap — the two-hour cap credited on top of the open tab's own
 *    production. (When there is no local document at all, the reconcile adopts
 *    the remote and reloads, so no grant is reported on that boot.)
 *
 * 2. **The local projection is credited only where no server figure can
 *    exist** — an unconfigured build, a sign-in that produced no session, or a
 *    `204` (the account has no cloud save). A *failed download* — and a
 *    *failed sign-in against a configured backend* — are not that: the server
 *    figure exists and was simply not reached, so nothing is credited and the
 *    interval settles on the next boot that reaches the server. Without this
 *    rule an attacker could reopen the device-clock cheat by dropping one
 *    request.
 */
export interface OfflineRewardChoiceParams {
  /** The server-computed grant, or `null` when none arrived or it was zero/already credited. */
  readonly serverGrant: PendingOfflineReward | null;
  /** The client's own clock-derived projection, or `null` when it is zero/absent. */
  readonly localProjection: PendingOfflineReward | null;
  /** Whether the local projection may be credited at all (unconfigured, no session, or `no-cloud-save`). */
  readonly fallbackAllowed: boolean;
}

export function chooseOfflineReward(
  params: OfflineRewardChoiceParams,
): PendingOfflineReward | null {
  const { serverGrant, localProjection, fallbackAllowed } = params;

  if (serverGrant !== null && serverGrant.reward.greaterThan(0)) {
    // A null or zero projection is a zero closed interval, not an absent bound.
    if (localProjection === null || !localProjection.reward.greaterThan(0)) {
      return null;
    }

    return localProjection.reward.lessThan(serverGrant.reward)
      ? localProjection
      : serverGrant;
  }

  if (
    fallbackAllowed &&
    localProjection !== null &&
    localProjection.reward.greaterThan(0)
  ) {
    return localProjection;
  }

  return null;
}

import { describe, expect, it } from 'vitest';

import { GameNumber } from '../../src/core';
import { chooseOfflineReward } from '../../src/platform/web';

/**
 * Server-milestone Step 22 review fix: the pure decision that picks the
 * credited offline reward from the server grant and the client projection.
 *
 * The bound (`min`) is what stops the server grant crediting an interval the
 * open tab already produced at full rate; the fallback rule is what stops a
 * dropped request from handing the device-clock cheat back.
 */
function candidate(reward: string, creditedDurationMs = 3_600_000) {
  return { creditedDurationMs, reward: GameNumber.deserialize(reward) };
}

describe('chooseOfflineReward (Step 22)', () => {
  it('credits nothing when the projection is null — a zero closed interval, not an absent bound', () => {
    // The H2 gap: a tab that flushed at reload has a zero projection, so the
    // server grant must not be credited unbounded on top of open-tab production.
    expect(
      chooseOfflineReward({
        serverGrant: candidate('1000'),
        localProjection: null,
        fallbackAllowed: false,
      }),
    ).toBeNull();
  });

  it('credits nothing when the projection is zero (present but not positive)', () => {
    expect(
      chooseOfflineReward({
        serverGrant: candidate('1000'),
        localProjection: candidate('0'),
        fallbackAllowed: false,
      }),
    ).toBeNull();
  });

  it('bounds the server grant by a smaller local projection, restoring "only a closed interval"', () => {
    const local = candidate('400');
    expect(
      chooseOfflineReward({
        serverGrant: candidate('1000'),
        localProjection: local,
        fallbackAllowed: false,
      }),
    ).toBe(local);
  });

  it('keeps the server grant when the local projection is larger (a slow clock cannot inflate the reward)', () => {
    const server = candidate('1000');
    expect(
      chooseOfflineReward({
        serverGrant: server,
        localProjection: candidate('5000'),
        fallbackAllowed: false,
      }),
    ).toBe(server);
  });

  it('falls back to the local projection only when no server figure can exist', () => {
    const local = candidate('750');
    expect(
      chooseOfflineReward({ serverGrant: null, localProjection: local, fallbackAllowed: true }),
    ).toBe(local);
  });

  it('credits nothing when the download failed (fallback not allowed)', () => {
    expect(
      chooseOfflineReward({
        serverGrant: null,
        localProjection: candidate('750'),
        fallbackAllowed: false,
      }),
    ).toBeNull();
  });

  it('credits nothing when neither source has a positive reward', () => {
    expect(
      chooseOfflineReward({ serverGrant: null, localProjection: null, fallbackAllowed: true }),
    ).toBeNull();
    expect(
      chooseOfflineReward({
        serverGrant: candidate('0'),
        localProjection: candidate('0'),
        fallbackAllowed: true,
      }),
    ).toBeNull();
  });

  it('never credits more than the larger of the two candidates', () => {
    const choice = chooseOfflineReward({
      serverGrant: candidate('1000'),
      localProjection: candidate('400'),
      fallbackAllowed: true,
    });

    expect(choice).not.toBeNull();
    expect(choice!.reward.lessThanOrEqualTo(GameNumber.deserialize('1000'))).toBe(true);
  });
});

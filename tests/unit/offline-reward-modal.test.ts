import { describe, expect, it } from 'vitest';

import { GameNumber } from '../../src/core';
import { formatOfflineRewardAmount } from '../../src/ui';

describe('offline reward amount formatting', () => {
  it('removes serialized decimal tails while keeping two useful decimals', () => {
    expect(formatOfflineRewardAmount(GameNumber.from('287.5333333333333'))).toBe(
      '287.53',
    );
  });

  it('uses the shared lowercase unit tiers', () => {
    expect(formatOfflineRewardAmount(GameNumber.from('1213120'))).toBe(
      '1.21m',
    );
    expect(formatOfflineRewardAmount(GameNumber.from('18000'))).toBe('18k');
    expect(formatOfflineRewardAmount(GameNumber.from('1e15'))).toBe('1qa');
    expect(formatOfflineRewardAmount(GameNumber.from('1e36'))).toBe('1aa');
  });
});

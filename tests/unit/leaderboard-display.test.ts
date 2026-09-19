import { describe, expect, it } from 'vitest';

import { formatLeaderboardMetric } from '../../src/ui/LeaderboardModal';

describe('leaderboard display formatting (Step 29)', () => {
  it('formats the stored exact metric through the shared amount formatter at every magnitude tier', () => {
    const cases = [
      ['123.45', '123.45'],
      ['1e3', '1.00k'],
      ['1e6', '1.00m'],
      ['1e15', '1.00qa'],
      ['1e36', '1.00aa'],
      ['1e308', '100.00dm'],
      ['1e400', '10.00er'],
      ['1e1000', '10.00mj'],
    ] as const;

    for (const [exact, expected] of cases) {
      expect(formatLeaderboardMetric(exact), exact).toBe(expected);
    }
  });

  it('keeps exact serialization separate from the abbreviated label', () => {
    expect(formatLeaderboardMetric('1e+1000')).toBe('10.00mj');
    expect(formatLeaderboardMetric('999999')).toBe('999.99k');
  });
});

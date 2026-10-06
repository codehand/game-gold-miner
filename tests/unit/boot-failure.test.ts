import { describe, expect, it } from 'vitest';

import {
  BOOT_FAILURE_MESSAGE,
  reportBootFailure,
  type BootStatusTarget,
} from '../../src/platform/web';

describe('reportBootFailure', () => {
  // Regression: a throw inside the fire-and-forget boot left "Đang tải game..."
  // on screen forever, which inside Telegram looks exactly like a stalled load.
  it('replaces the loading text with a visible failure and its reason', () => {
    const status: BootStatusTarget = { textContent: 'Đang tải game...' };

    const message = reportBootFailure(status, new Error('IndexedDB unavailable'));

    expect(message).toBe(`${BOOT_FAILURE_MESSAGE} (IndexedDB unavailable)`);
    expect(status.textContent).toBe(message);
  });

  it('describes non-Error rejections too', () => {
    const status: BootStatusTarget = { textContent: 'Đang tải game...' };

    reportBootFailure(status, 'chunk load failed');

    expect(status.textContent).toBe(`${BOOT_FAILURE_MESSAGE} (chunk load failed)`);
  });

  it('leaves an already-booted game alone once the loading shell is gone', () => {
    expect(reportBootFailure(null, new Error('late failure'))).toBeNull();
  });
});

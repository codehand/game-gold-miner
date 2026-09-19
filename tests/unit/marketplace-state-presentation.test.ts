import { describe, expect, it } from 'vitest';

import {
  getMarketplaceStatePresentation,
  hasMarketplaceStateIcon,
  type MarketplaceAvailabilityState,
} from '../../src/ui/marketplaceStatePresentation';

const STATES: readonly MarketplaceAvailabilityState[] = [
  'Idle',
  'Assigned',
  'Listed',
  'Rented',
  'Expired',
  'Locked',
];

describe('Marketplace state presentation', () => {
  it('maps every lifecycle state to an approved icon and a non-authoritative label', () => {
    for (const state of STATES) {
      const presentation = getMarketplaceStatePresentation(state);
      expect(presentation.state).toBe(state);
      expect(presentation.iconId).toMatch(/^state-/);
      expect(presentation.label).toBeTruthy();
      expect(presentation.description).toBeTruthy();
      expect(presentation.isAuthoritative).toBe(false);
      expect(hasMarketplaceStateIcon(state)).toBe(true);
    }
  });

  it('prevents conflicting actions for assigned, listed, rented, and locked cats', () => {
    for (const state of ['Assigned', 'Listed', 'Rented', 'Locked'] as const) {
      const presentation = getMarketplaceStatePresentation(state);
      expect(presentation.canAssign, state).toBe(false);
      expect(presentation.canList, state).toBe(false);
      expect(presentation.canRent, state).toBe(false);
    }
  });

  it('returns expired rentals to the idle action surface', () => {
    expect(getMarketplaceStatePresentation('Expired')).toEqual(expect.objectContaining({
      iconId: 'state-rental-expiring',
      canAssign: true,
      canList: true,
      canRent: false,
    }));
  });
});

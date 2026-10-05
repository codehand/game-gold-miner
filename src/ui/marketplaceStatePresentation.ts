import { getMarketplaceIcon } from './marketplaceIconRegistry';

export type MarketplaceAvailabilityState =
  | 'Idle'
  | 'Assigned'
  | 'Listed'
  | 'Rented'
  | 'Expired'
  | 'Locked';

export interface MarketplaceStatePresentation {
  readonly state: MarketplaceAvailabilityState;
  readonly iconId: string;
  readonly label: string;
  readonly description: string;
  readonly canAssign: boolean;
  readonly canList: boolean;
  readonly canRent: boolean;
  readonly isAuthoritative: false;
}

const STATE_PRESENTATIONS: Readonly<Record<MarketplaceAvailabilityState, MarketplaceStatePresentation>> = {
  Idle: {
    state: 'Idle',
    iconId: 'state-idle',
    label: 'Idle',
    description: 'Available for assignment or a new listing.',
    canAssign: true,
    canList: true,
    canRent: false,
    isAuthoritative: false,
  },
  Assigned: {
    state: 'Assigned',
    iconId: 'state-assigned',
    label: 'Assigned',
    description: 'Working in a mine; listing actions are unavailable.',
    canAssign: false,
    canList: false,
    canRent: false,
    isAuthoritative: false,
  },
  Listed: {
    state: 'Listed',
    iconId: 'state-listed',
    label: 'Listed',
    description: 'Held by an active sale or rental listing.',
    canAssign: false,
    canList: false,
    canRent: false,
    isAuthoritative: false,
  },
  Rented: {
    state: 'Rented',
    iconId: 'state-rented',
    label: 'Rented',
    description: 'Usage rights are with a renter until the rental expires.',
    canAssign: false,
    canList: false,
    canRent: false,
    isAuthoritative: false,
  },
  Expired: {
    state: 'Expired',
    iconId: 'state-rental-expiring',
    label: 'Expired',
    description: 'Rental ended; the cat returns to the owner as idle.',
    canAssign: true,
    canList: true,
    canRent: false,
    isAuthoritative: false,
  },
  Locked: {
    state: 'Locked',
    iconId: 'state-locked',
    label: 'Locked',
    description: 'A role or account rule currently blocks this action.',
    canAssign: false,
    canList: false,
    canRent: false,
    isAuthoritative: false,
  },
};

const MARKETPLACE_STATE_BY_NAME = new Map<MarketplaceAvailabilityState, MarketplaceStatePresentation>(
  Object.entries(STATE_PRESENTATIONS) as Array<[
    MarketplaceAvailabilityState,
    MarketplaceStatePresentation,
  ]>,
);

/** Returns a UI-only state description; the server remains authoritative. */
export function getMarketplaceStatePresentation(
  state: MarketplaceAvailabilityState,
): MarketplaceStatePresentation {
  return MARKETPLACE_STATE_BY_NAME.get(state)!;
}

/** Fails closed when a state icon is missing from the approved icon registry. */
export function hasMarketplaceStateIcon(state: MarketplaceAvailabilityState): boolean {
  return getMarketplaceIcon(getMarketplaceStatePresentation(state).iconId) !== null;
}

import { describe, expect, it, vi } from 'vitest';

import {
  buyMarketplaceListingViaFetch,
  createMarketplaceListingViaFetch,
  loadMarketplaceListingsViaFetch,
  rentMarketplaceListingViaFetch,
  type CatCollectionAuthClient,
  type CatCollectionFetch,
} from '../../src/platform/web';

const CAT = {
  catInstanceId: 'cat-1',
  ownerUserId: 'seller-1',
  assetId: 'miner:SSR:forge:idle',
  displayName: 'Forge',
  roleId: 'miner',
  rarityTier: 'SSR',
  level: 12,
  attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
  calculationVersion: 1,
  availabilityState: 'Listed',
  assignedSlotKey: null,
  updatedAt: '2026-09-20T08:00:00.000Z',
};

const LISTING = {
  listingId: 'listing-1',
  sellerUserId: 'seller-1',
  sellerDisplayName: 'Seller',
  cat: CAT,
  listingType: 'rent',
  priceExact: '250',
  status: 'Active',
  buyerUserId: null,
  renterUserId: null,
  durationHours: null,
  expiresAt: null,
  createdAt: '2026-09-20T08:00:00.000Z',
  completedAt: null,
};

const PROJECTION = {
  cats: [CAT],
  assignments: [],
  assignmentRevision: 0,
  collectionRevision: 1,
  listings: [LISTING],
  listingId: 'listing-1',
  walletGold: '99750',
  saveRevision: 2,
};

function auth(): CatCollectionAuthClient {
  return {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-1' } }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'token-2' } }, error: null })),
  };
}

describe('marketplace web adapter', () => {
  it('loads typed active listings with type and scope query parameters', async () => {
    const fetcher = vi.fn<CatCollectionFetch>(async () => new Response(JSON.stringify({ listings: [LISTING] }), { status: 200 }));
    const result = await loadMarketplaceListingsViaFetch('/cat-collection', auth(), 'rent', false, fetcher);

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.listings[0]).toMatchObject({ listingId: 'listing-1', priceExact: '250' });
      expect(result.listings[0].cat.updatedAt).toBe(Date.parse(CAT.updatedAt));
    }
    expect(String(fetcher.mock.calls[0]?.[0] ?? '')).toContain('/v1/listings?type=rent');
  });

  it('forwards seller listing data while hiding attacker-controlled fields', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        catInstanceId: 'cat-1',
        listingType: 'sale',
        priceExact: '10000',
        idempotencyKey: 'create-0001',
      });
      return new Response(JSON.stringify({ ...PROJECTION, listings: [{ ...LISTING, listingType: 'sale', priceExact: '10000' }] }), { status: 200 });
    });

    const result = await createMarketplaceListingViaFetch('/cat-collection', auth(), {
      catInstanceId: 'cat-1',
      listingType: 'sale',
      priceExact: '10000',
      idempotencyKey: 'create-0001',
    }, fetcher);

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.listingId).toBe('listing-1');
      expect(result.walletGold).toBe('99750');
    }
  });

  it('parses rent command projections and maps server rejection codes', async () => {
    const rejected = await buyMarketplaceListingViaFetch(
      '/cat-collection',
      auth(),
      'listing-1',
      'buy-0001',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'listing_unavailable' } }), { status: 409 })),
    );
    expect(rejected).toEqual({ kind: 'rejected', code: 'listing_unavailable' });

    const applied = await rentMarketplaceListingViaFetch(
      '/cat-collection',
      auth(),
      'listing-1',
      2,
      'rent-0001',
      vi.fn(async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ durationHours: 2, idempotencyKey: 'rent-0001' });
        return new Response(JSON.stringify(PROJECTION), { status: 200 });
      }),
    );
    expect(applied.kind).toBe('applied');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  loadCatCollectionViaFetch,
  purchaseCatViaFetch,
  replaceCatAssignmentViaFetch,
  type CatCollectionAuthClient,
} from '../../src/platform/web';

const CAT = {
  catInstanceId: 'cat-1',
  ownerUserId: 'user-1',
  assetId: 'miner:SSR:forge:idle',
  displayName: 'Forge',
  roleId: 'miner',
  rarityTier: 'SSR',
  level: 1,
  attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
  calculationVersion: 1,
  availabilityState: 'Assigned',
  assignedSlotKey: 'miner:floor-1',
  updatedAt: '2026-09-19T08:00:00.000Z',
};

const ROSTER = {
  cats: [CAT],
  assignments: [{ slotKey: 'miner:floor-1', catInstanceId: 'cat-1' }],
  assignmentRevision: 3,
  collectionRevision: 4,
};

function auth(overrides: Partial<CatCollectionAuthClient> = {}): CatCollectionAuthClient {
  return {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-1' } }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'token-2' } }, error: null })),
    ...overrides,
  };
}

describe('cat collection web adapter', () => {
  it('does not call the network when Supabase is unconfigured', async () => {
    const fetcher = vi.fn();

    const result = await loadCatCollectionViaFetch('/cat-collection', null, fetcher);

    expect(result).toEqual({ kind: 'unavailable', reason: 'unconfigured' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('parses and validates a caller-scoped roster projection', async () => {
    const result = await loadCatCollectionViaFetch(
      '/cat-collection/v1/collection',
      auth(),
      vi.fn(async () => new Response(JSON.stringify(ROSTER), { status: 200 })),
    );

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.roster.collectionRevision).toBe(4);
      expect(result.roster.cats[0].updatedAt).toBe(Date.parse(CAT.updatedAt));
    }
  });

  it('refreshes once after a 401 and forwards only mutation data', async () => {
    const client = auth();
    const responses = [
      new Response('', { status: 401 }),
      new Response(JSON.stringify(ROSTER), { status: 200 }),
    ];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe(
        responses.length === 2 ? 'Bearer token-1' : 'Bearer token-2',
      );
      return responses.shift()!;
    });

    const result = await purchaseCatViaFetch(
      '/cat-collection',
      client,
      'miner:SSR:forge:idle',
      'purchase-0001',
      fetcher,
    );

    expect(result.kind).toBe('applied');
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetcher.mock.calls[0][1]?.body ?? '') as string) as Record<string, unknown>;
    expect(body).toEqual({ assetId: 'miner:SSR:forge:idle', idempotencyKey: 'purchase-0001' });
  });

  it('rejects a malformed server projection instead of hydrating unsafe state', async () => {
    const result = await replaceCatAssignmentViaFetch(
      '/cat-collection',
      auth(),
      { catInstanceId: 'cat-1', slotKey: 'miner:floor-1', expectedAssignmentRevision: 3 },
      vi.fn(async () => new Response(JSON.stringify({ cats: [] }), { status: 200 })),
    );

    expect(result).toEqual({ kind: 'unavailable', reason: 'invalid-response' });
  });
});

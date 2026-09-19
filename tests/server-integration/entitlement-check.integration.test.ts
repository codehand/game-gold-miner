import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createClient } from '@supabase/supabase-js';

import {
  FIXTURE_USER_ID,
  LOCAL_ANON_KEY,
  mintFixtureUserToken,
} from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

const API_URL = 'http://127.0.0.1:54321';
const ENTITLEMENT_URL = `${API_URL}/functions/v1/entitlement-check`;
const ENTITLEMENT_KEY = 'cosmetic.supporter_badge';

async function callEntitlementCheck(token?: string): Promise<Response> {
  return fetch(ENTITLEMENT_URL, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
}

describe('entitlement-check (server-milestone Step 31)', () => {
  const admin = createServiceRoleClient(API_URL);

  beforeAll(async () => {
    const { error } = await admin
      .from('entitlements')
      .delete()
      .eq('user_id', FIXTURE_USER_ID)
      .eq('entitlement_key', ENTITLEMENT_KEY);
    expect(error).toBeNull();
  });

  afterAll(async () => {
    const { error } = await admin
      .from('entitlements')
      .delete()
      .eq('user_id', FIXTURE_USER_ID)
      .eq('entitlement_key', ENTITLEMENT_KEY);
    expect(error).toBeNull();
  });

  it('rejects an unauthenticated entitlement check', async () => {
    const response = await callEntitlementCheck();

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthenticated');
  });

  it('returns no effect when the server has granted no entitlement', async () => {
    const response = await callEntitlementCheck(mintFixtureUserToken());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entitlements: [],
      effects: { supporterBadge: false },
    });
  });

  it('does not let an authenticated client insert an entitlement through PostgREST', async () => {
    const client = createClient(API_URL, LOCAL_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${mintFixtureUserToken()}` } },
      auth: { persistSession: false },
    });

    const { error } = await client.from('entitlements').insert({
      user_id: FIXTURE_USER_ID,
      entitlement_key: ENTITLEMENT_KEY,
      granted_by: 'client',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('exposes and enforces the effect only after a service-role grant', async () => {
    const { error: grantError } = await admin.from('entitlements').insert({
      user_id: FIXTURE_USER_ID,
      entitlement_key: ENTITLEMENT_KEY,
      granted_by: 'step-31-test',
      source: 'server-test',
    });
    expect(grantError).toBeNull();

    const grantedResponse = await callEntitlementCheck(mintFixtureUserToken());
    expect(grantedResponse.status).toBe(200);
    expect(await grantedResponse.json()).toEqual({
      entitlements: [
        {
          key: ENTITLEMENT_KEY,
          grantedAt: expect.any(String),
          source: 'server-test',
        },
      ],
      effects: { supporterBadge: true },
    });

    const { error: revokeError } = await admin
      .from('entitlements')
      .update({ revoked_at: '2026-09-19T00:00:00.000Z' })
      .eq('user_id', FIXTURE_USER_ID)
      .eq('entitlement_key', ENTITLEMENT_KEY);
    expect(revokeError).toBeNull();

    const revokedResponse = await callEntitlementCheck(mintFixtureUserToken());
    expect(revokedResponse.status).toBe(200);
    expect(await revokedResponse.json()).toEqual({
      entitlements: [],
      effects: { supporterBadge: false },
    });
  });
});

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createInitialPortfolio } from '../../src/core';
import { createPortfolioSaveDocument } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

const API_URL = 'http://127.0.0.1:54321';
const BOOST_URL = `${API_URL}/functions/v1/boost`;

describe('Mine Overdrive server authority', () => {
  it('allows one revision winner when two mine-bound activation requests race', async () => {
    const client = createClient(API_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInAnonymously();
    expect(error).toBeNull();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    if (!token) return;
    const headers = {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    const save = createPortfolioSaveDocument(createInitialPortfolio(0), Date.now());
    const uploaded = await fetch(`${API_URL}/functions/v1/save-sync/v1/save`, {
      method: 'PUT', headers,
      body: JSON.stringify({ baseRevision: null, document: save }),
    });
    expect(uploaded.status).toBe(200);
    const responses = await Promise.all([
      fetch(`${BOOST_URL}/v1/activate`, {
        method: 'POST', headers,
        body: JSON.stringify({
          mineId: 'gold', baseRevision: 1,
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      fetch(`${BOOST_URL}/v1/activate`, {
        method: 'POST', headers,
        body: JSON.stringify({
          mineId: 'gold', baseRevision: 1,
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
        }),
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    const winner = bodies.find((body) => body.kind === 'activated');
    expect(winner?.boostMineId).toBe('gold');
    expect(winner?.saveRevision).toBe(2);
    expect(bodies.find((body) => body.error)?.error.code).toBe('revision_conflict');
  });

  it('mints one activation per account and denies direct table reads', async () => {
    const client = createClient(API_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInAnonymously();
    expect(error).toBeNull();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    if (!token) return;

    const headers = { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${token}` };
    const status = await fetch(`${BOOST_URL}/v1/status`, { headers });
    expect(status.status, status.status === 200 ? '' : await status.clone().text()).toBe(200);
    expect((await status.json()).boost.lastActivatedAtMs).toBeNull();

    const save = createPortfolioSaveDocument(createInitialPortfolio(0), Date.now());
    const uploaded = await fetch(`${API_URL}/functions/v1/save-sync/v1/save`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: null, document: save }),
    });
    expect(uploaded.status).toBe(200);

    const first = await fetch(`${BOOST_URL}/v1/activate`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        mineId: 'gold', baseRevision: 1,
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.kind).toBe('activated');
    expect(Number.isSafeInteger(firstBody.boost.lastActivatedAtMs)).toBe(true);
    expect(firstBody.boostMineId).toBe('gold');
    expect(firstBody.saveRevision).toBe(2);

    const second = await fetch(`${BOOST_URL}/v1/activate`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        mineId: 'gold', baseRevision: 2,
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      }),
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.kind).toBe('cooldown');
    expect(secondBody.boost.lastActivatedAtMs).toBe(firstBody.boost.lastActivatedAtMs);
    expect(secondBody.boostMineId).toBe('gold');
    expect(secondBody.saveRevision).toBe(2);

    const downloaded = await fetch(`${API_URL}/functions/v1/save-sync/v1/save`, { headers });
    expect(downloaded.status).toBe(200);
    const downloadBody = await downloaded.json();
    expect(downloadBody.boost.lastActivatedAtMs).toBe(firstBody.boost.lastActivatedAtMs);
    expect(downloadBody.document.boostMineId).toBe('gold');
    expect(Number.isSafeInteger(downloadBody.serverNowMs)).toBe(true);

    const direct = await client.from('mine_boosts').select('last_activated_at, mine_id');
    expect(direct.error).not.toBeNull();
  });
});

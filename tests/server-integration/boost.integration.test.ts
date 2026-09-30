import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

const API_URL = 'http://127.0.0.1:54321';
const BOOST_URL = `${API_URL}/functions/v1/boost`;

describe('Mine Overdrive server authority', () => {
  it('allows only one winner when two activation requests race', async () => {
    const client = createClient(API_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInAnonymously();
    expect(error).toBeNull();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    if (!token) return;
    const headers = { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${token}` };
    const responses = await Promise.all([
      fetch(`${BOOST_URL}/v1/activate`, { method: 'POST', headers }),
      fetch(`${BOOST_URL}/v1/activate`, { method: 'POST', headers }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.map((body) => body.kind).sort()).toEqual(['activated', 'cooldown']);
    expect(bodies[0].boost.lastActivatedAtMs).toBe(bodies[1].boost.lastActivatedAtMs);
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

    const first = await fetch(`${BOOST_URL}/v1/activate`, { method: 'POST', headers });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.kind).toBe('activated');
    expect(Number.isSafeInteger(firstBody.boost.lastActivatedAtMs)).toBe(true);

    const second = await fetch(`${BOOST_URL}/v1/activate`, { method: 'POST', headers });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.kind).toBe('cooldown');
    expect(secondBody.boost.lastActivatedAtMs).toBe(firstBody.boost.lastActivatedAtMs);

    const save = createSaveDocument(
      createInitialGameState(BASE_GAME_BALANCE, Date.now()),
      BASE_GAME_BALANCE,
      Date.now(),
    );
    const uploaded = await fetch(`${API_URL}/functions/v1/save-sync/v1/save`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: null, document: save }),
    });
    expect(uploaded.status).toBe(200);
    const downloaded = await fetch(`${API_URL}/functions/v1/save-sync/v1/save`, { headers });
    expect(downloaded.status).toBe(200);
    const downloadBody = await downloaded.json();
    expect(downloadBody.boost.lastActivatedAtMs).toBe(firstBody.boost.lastActivatedAtMs);
    expect(Number.isSafeInteger(downloadBody.serverNowMs)).toBe(true);

    const direct = await client.from('mine_boosts').select('last_activated_at');
    expect(direct.error).not.toBeNull();
  });
});

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState, GameNumber, LIFETIME_GOLD_BOARD_KEY, toLeaderboardMagnitude } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 28: leaderboard writes, against the live stack.
 *
 * Step 27 built `public.leaderboard_entries` and the pure metric/magnitude
 * conversion (`src/core/leaderboard/leaderboardMetric.ts`); nothing there
 * writes a row. Step 28's own instructions: "Publish an entry only from a
 * save that passed Step 23. A rejected or unvalidated save must never reach
 * the board." This suite proves that against the real `save-sync` Edge
 * Function and the real table — the Deno unit tests in
 * `supabase/functions/save-sync/index.test.ts` already cover every branch of
 * `handleSaveUpload`'s publish call with a faked `SaveSyncDeps`; this proves
 * the real service-role writer reaches Postgres and that a rejected upload
 * really does leave the board untouched.
 */
const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const NOW_MS = 1_757_000_000_000;

interface GuestIdentity {
  readonly userId: string;
  readonly accessToken: string;
}

async function createGuestIdentity(): Promise<GuestIdentity> {
  const client = createClient(API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

/** A valid document whose warehouse carries the given lifetime-gold totals, everything else at `createInitialGameState`'s defaults. */
function documentWithLifetimeGold(delivered: string, offlineClaimed = '0'): SaveDocumentV2 {
  const base = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const state = {
    ...base,
    warehouse: {
      ...base.warehouse,
      totalGoldDelivered: GameNumber.from(delivered),
      totalOfflineGoldClaimed: GameNumber.from(offlineClaimed),
    },
  };
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

function freshDocument(): SaveDocumentV2 {
  return createSaveDocument(createInitialGameState(BASE_GAME_BALANCE, NOW_MS), BASE_GAME_BALANCE, NOW_MS);
}

function putSave(accessToken: string, body: unknown): Promise<Response> {
  return fetch(SAVE_URL, {
    method: 'PUT',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

async function setDisplayName(userId: string, accessToken: string, displayName: string): Promise<void> {
  const response = await fetch(`${API_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({ display_name: displayName }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`setting display_name failed: ${response.status} ${await response.text()}`);
  }
}

interface LeaderboardRow {
  readonly display_name: string | null;
  readonly metric_exact: string;
  readonly metric_log10: number;
  readonly source_revision: number;
}

async function leaderboardRowsFor(userId: string): Promise<LeaderboardRow[]> {
  const { data, error } = await createServiceRoleClient(API_URL)
    .from('leaderboard_entries')
    .select('display_name, metric_exact, metric_log10, source_revision')
    .eq('board_key', LIFETIME_GOLD_BOARD_KEY)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`reading leaderboard_entries failed: ${error.message}`);
  }
  return (data ?? []) as LeaderboardRow[];
}

describe('leaderboard writes (server-milestone Step 28)', () => {
  it('publishes exactly one row on the lifetime-gold board from an accepted save, carrying the caller\'s display name', async () => {
    const guest = await createGuestIdentity();
    await setDisplayName(guest.userId, guest.accessToken, 'Prospector');

    const response = await putSave(guest.accessToken, {
      baseRevision: null,
      document: documentWithLifetimeGold('12345'),
    });
    expect(response.status).toBe(200);

    const rows = await leaderboardRowsFor(guest.userId);
    expect(rows).toHaveLength(1);
    const expected = toLeaderboardMagnitude(GameNumber.from('12345'));
    expect(rows[0].display_name).toBe('Prospector');
    expect(rows[0].metric_exact).toBe(expected.exact);
    expect(rows[0].source_revision).toBe(1);
    expect(rows[0].metric_log10).toBeCloseTo(expected.log10, 9);
  });

  it('never publishes an entry from a save Step 23 rejects, leaving the prior accepted entry untouched', async () => {
    const guest = await createGuestIdentity();

    const accepted = await putSave(guest.accessToken, {
      baseRevision: null,
      document: documentWithLifetimeGold('1000'),
    });
    expect(accepted.status).toBe(200);

    // The same inflated-by-a-trillion candidate `save-audit.integration.test.ts`
    // already proves Step 23 rejects for an identical accepted baseline.
    const rejected = await putSave(guest.accessToken, {
      baseRevision: 1,
      document: documentWithLifetimeGold('1000000000000'),
    });
    expect(rejected.status).toBe(422);
    expect((await rejected.json()).error.code).toBe('save_rejected');

    const rows = await leaderboardRowsFor(guest.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].metric_exact).toBe(toLeaderboardMagnitude(GameNumber.from('1000')).exact);
    expect(rows[0].source_revision).toBe(1);
  });

  it('upserts on a repeat accepted upload from the same user rather than duplicating the row', async () => {
    const guest = await createGuestIdentity();

    const first = await putSave(guest.accessToken, {
      baseRevision: null,
      document: documentWithLifetimeGold('500'),
    });
    expect(first.status).toBe(200);

    // A smaller candidate is never rejected by Step 23 (it only bounds an
    // increase), so this stays about the upsert rather than the bound.
    const second = await putSave(guest.accessToken, {
      baseRevision: 1,
      document: documentWithLifetimeGold('300'),
    });
    expect(second.status).toBe(200);

    const rows = await leaderboardRowsFor(guest.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].metric_exact).toBe(toLeaderboardMagnitude(GameNumber.from('300')).exact);
    expect(rows[0].source_revision).toBe(2);
  });

  it('publishes nothing yet for a fresh account with zero lifetime gold earned', async () => {
    const guest = await createGuestIdentity();

    const response = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(response.status).toBe(200);

    const rows = await leaderboardRowsFor(guest.userId);
    expect(rows).toHaveLength(0);
  });
});

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 22: the server clock is the only clock.
 *
 * Proves, against the live stack, that the `offlineGrant` a download carries is
 * derived from the server's own `received_at` → `now()` and is unaffected by
 * the timestamps inside the uploaded document. A client whose own clock is
 * hours ahead, hours behind, or moving backwards receives exactly the same
 * grant an honest client receives for the same real absence — and never more
 * than the two-hour cap.
 *
 * `saves` denies every client write, so the stored row (with a chosen
 * `received_at`) is seeded through the service-role fixture, the same pattern
 * `saves-rls.integration.test.ts` established.
 */
const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const HOUR_MS = 60 * 60 * 1_000;

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

/** A valid document whose only variable is the player's own clock. */
function documentAtClientClock(clientClockMs: number): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, clientClockMs);
  return createSaveDocument(state, BASE_GAME_BALANCE, clientClockMs);
}

async function seedStoredRow(
  admin: SupabaseClient,
  userId: string,
  documentJson: string,
  receivedAtIso: string,
): Promise<void> {
  const { error } = await admin.from('saves').insert({
    user_id: userId,
    revision: 1,
    schema_version: 2,
    document_json: documentJson,
    received_at: receivedAtIso,
  });

  if (error) {
    throw new Error(`seeding saves row failed: ${error.message}`);
  }
}

async function readOfflineGrant(accessToken: string): Promise<{
  readonly elapsedDurationMs: number;
  readonly creditedDurationMs: number;
  readonly reward: string;
}> {
  const response = await fetch(SAVE_URL, {
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });

  expect(response.status).toBe(200);
  return (await response.json()).offlineGrant;
}

describe('server-computed offlineGrant (server-milestone Step 22)', () => {
  it('is identical for an honest, an hours-ahead, and an hours-behind document at the same receipt', async () => {
    const admin = createServiceRoleClient(API_URL);
    const guest = await createGuestIdentity();
    const receivedAt = new Date(Date.now() - 10 * HOUR_MS).toISOString();

    const clientClocks = [
      Date.now(), // honest
      Date.now() + 5 * HOUR_MS, // clock jumped hours ahead
      Date.now() - 100 * HOUR_MS, // clock stuck hours behind
    ];
    const grants = [];

    for (const clientClockMs of clientClocks) {
      await admin.from('saves').delete().eq('user_id', guest.userId);
      await seedStoredRow(
        admin,
        guest.userId,
        JSON.stringify(documentAtClientClock(clientClockMs)),
        receivedAt,
      );
      grants.push(await readOfflineGrant(guest.accessToken));
    }

    // Same real absence, same receipt → the same credited amount and reward,
    // regardless of the player's clock. (`elapsedDurationMs` can differ by the
    // milliseconds between the two requests; the credited amount cannot, because
    // a 10-hour absence is capped at two hours for both.)
    expect(grants[1].creditedDurationMs).toBe(grants[0].creditedDurationMs);
    expect(grants[1].reward).toBe(grants[0].reward);
    expect(grants[2].creditedDurationMs).toBe(grants[0].creditedDurationMs);
    expect(grants[2].reward).toBe(grants[0].reward);
    expect(grants[0].creditedDurationMs).toBe(BASE_GAME_BALANCE.offlineIncome.capDurationMs);
    expect(grants[0].creditedDurationMs).toBe(7_200_000);
  });

  it('never exceeds the cap, whatever the document claims', async () => {
    const admin = createServiceRoleClient(API_URL);
    const guest = await createGuestIdentity();
    const receivedAt = new Date(Date.now() - 30 * 24 * HOUR_MS).toISOString();

    await seedStoredRow(
      admin,
      guest.userId,
      JSON.stringify(documentAtClientClock(Date.now() + 1000 * HOUR_MS)),
      receivedAt,
    );

    const grant = await readOfflineGrant(guest.accessToken);

    expect(grant.creditedDurationMs).toBeLessThanOrEqual(
      BASE_GAME_BALANCE.offlineIncome.capDurationMs,
    );
    expect(typeof grant.reward).toBe('string');
  });

  it('credits a short absence against the server clock, not the document clock', async () => {
    const admin = createServiceRoleClient(API_URL);
    const guest = await createGuestIdentity();
    const receivedAt = new Date(Date.now() - 90_000).toISOString();

    // A wildly future document timestamp must not turn a 90-second absence
    // into a reward; a wildly past one must not either.
    for (const clientClockMs of [Date.now() + 100 * HOUR_MS, Date.now() - 100 * HOUR_MS]) {
      await admin.from('saves').delete().eq('user_id', guest.userId);
      await seedStoredRow(
        admin,
        guest.userId,
        JSON.stringify(documentAtClientClock(clientClockMs)),
        receivedAt,
      );

      const grant = await readOfflineGrant(guest.accessToken);

      expect(grant.creditedDurationMs).toBeGreaterThanOrEqual(89_000);
      expect(grant.creditedDurationMs).toBeLessThanOrEqual(92_000);
    }
  });
});

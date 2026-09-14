import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber } from '../../src/core';
import {
  createSaveDocument,
  resolveSaveConflict,
  type SaveDocumentV2,
  type SaveConflictRemote,
} from '../../src/persistence';
import { downloadCloudSaveViaFetch } from '../../src/platform/web';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 18's own required test, against the live stack: "Two
 * devices play the same account offline and both sync. The documented policy
 * is applied, the outcome is deterministic, and no accepted branch loses
 * progress the player was not shown."
 *
 * "Two devices" is reproduced with the real §5 optimistic-concurrency flow: a
 * single authenticated account holds one server-side `revision`, and two
 * genuinely divergent local documents are pushed through the real
 * `PUT /v1/save`. The second writer's upload is refused with `409
 * revision_conflict` carrying the winner's document, and the pure §7 policy
 * (`resolveSaveConflict`) is applied to that exact `(local, server)` pair —
 * the same predicate the client's boot reconcile now runs and the one Step 19
 * will run on an upload conflict.
 *
 * Each branch then asserts the rule the threat model makes absolute: no
 * accepted branch destroys progress the player was not shown.
 */
const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const NOW_MS = 1_759_000_000_000;

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

/** A valid document with the given elevator/warehouse upgrades above their starting levels, an optional gold balance, and an optional lifetime offline-claim counter. */
function progressDocument(
  elevatorBump: number,
  warehouseBump: number,
  gold: number = BASE_GAME_BALANCE.startingGold,
  offlineClaimed = 0,
): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const elevatorLevel = state.elevator.level + elevatorBump;
  const warehouseLevel = state.warehouse.level + warehouseBump;

  return createSaveDocument(
    {
      ...state,
      gold: GameNumber.from(gold),
      elevator: {
        ...state.elevator,
        level: elevatorLevel,
        capacity: calculateLevelEffect(BASE_GAME_BALANCE.elevator.baseCapacity, elevatorLevel, BASE_GAME_BALANCE.elevator.upgrade),
      },
      warehouse: {
        ...state.warehouse,
        level: warehouseLevel,
        capacity: calculateLevelEffect(BASE_GAME_BALANCE.warehouse.baseCapacity, warehouseLevel, BASE_GAME_BALANCE.warehouse.upgrade),
        totalOfflineGoldClaimed: GameNumber.from(offlineClaimed),
      },
    },
    BASE_GAME_BALANCE,
    NOW_MS,
  );
}

interface ConflictDetail {
  readonly serverRevision: number;
  readonly receivedAt: string;
  readonly document: SaveDocumentV2;
}

/**
 * Runs the §5 flow to its `409` and returns the server's own conflict detail:
 * device A commits `deviceADocument` at revision 2, device B's stale
 * `baseRevision: 1` upload of `deviceBDocument` is refused against it.
 */
async function uploadUntilConflict(
  accessToken: string,
  deviceADocument: SaveDocumentV2,
  deviceBDocument: SaveDocumentV2,
): Promise<ConflictDetail> {
  const seed = await putSave(accessToken, { baseRevision: null, document: progressDocument(1, 1) });
  expect(seed.status).toBe(200);

  const deviceAUpload = await putSave(accessToken, { baseRevision: 1, document: deviceADocument });
  expect(deviceAUpload.status).toBe(200);
  expect((await deviceAUpload.json()).revision).toBe(2);

  const deviceBUpload = await putSave(accessToken, { baseRevision: 1, document: deviceBDocument });
  expect(deviceBUpload.status).toBe(409);

  const body = await deviceBUpload.json();
  expect(body.error.code).toBe('revision_conflict');
  return body.error.detail as ConflictDetail;
}

describe('save conflict resolution across two devices (server-milestone Step 18)', () => {
  it('adopts the ahead device silently when its save is a strict superset, and uploading it loses nothing', async () => {
    const account = await createGuestIdentity();
    const deviceA = progressDocument(2, 2);
    const deviceB = progressDocument(1, 1);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);

    const decision = resolveSaveConflict(deviceB, {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    });
    expect(decision).toEqual({ kind: 'remote-dominates' });

    // Device B adopts the account's save rather than overwriting it — the
    // account's superset save is intact and nothing was destroyed.
    const after = await downloadCloudSaveViaFetch(SAVE_URL, account.accessToken);
    expect(after?.document).toEqual(deviceA);
  });

  it('keeps the ahead device\'s own save when it dominates the account\'s, and a re-upload with the fresh revision succeeds', async () => {
    const account = await createGuestIdentity();
    const deviceA = progressDocument(1, 1);
    const deviceB = progressDocument(3, 3);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);

    const decision = resolveSaveConflict(deviceB, {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    });
    expect(decision).toEqual({ kind: 'local-dominates' });

    // Taking the ahead device's save loses nothing: it is a strict superset of
    // what the account held. Uploading it against the fresh revision succeeds.
    const reupload = await putSave(account.accessToken, {
      baseRevision: conflict.serverRevision,
      document: deviceB,
    });
    expect(reupload.status).toBe(200);
    expect((await reupload.json()).revision).toBe(3);

    const after = await downloadCloudSaveViaFetch(SAVE_URL, account.accessToken);
    expect(after?.document).toEqual(deviceB);
  });

  it('reports same progress deterministically and leaves the account\'s save as the server revision, with no third write', async () => {
    const account = await createGuestIdentity();
    const deviceA = progressDocument(2, 1);
    const deviceB = progressDocument(2, 1);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);

    const decision = resolveSaveConflict(deviceB, {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    });
    expect(decision).toEqual({ kind: 'same-progress' });

    // The client adopts the server revision and continues; the stored row is
    // unchanged and still the server's own revision 2, not a third write.
    const after = await downloadCloudSaveViaFetch(SAVE_URL, account.accessToken);
    expect(after?.document).toEqual(deviceA);

    // Deterministic: the mirror direction reports the same case.
    expect(
      resolveSaveConflict(deviceA, { document: deviceB, receivedAtMs: NOW_MS }),
    ).toEqual({ kind: 'same-progress' });
  });

  it('is a genuine fork when each device holds progress the other lacks, and neither save is destroyed', async () => {
    const account = await createGuestIdentity();
    const deviceA = progressDocument(1, 3);
    const deviceB = progressDocument(3, 1);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);
    const remote: SaveConflictRemote = {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    };

    const decision = resolveSaveConflict(deviceB, remote);
    expect(decision.kind).toBe('fork');
    if (decision.kind !== 'fork') {
      throw new Error('expected a fork');
    }

    // Neither candidate is destroyed. The account still holds device A's save
    // at revision 2 — device B uploaded nothing — and device B's own document
    // is carried back to the caller verbatim for the chooser.
    const after = await downloadCloudSaveViaFetch(SAVE_URL, account.accessToken);
    expect(after?.document).toEqual(deviceA);
    expect(decision.local.document).toEqual(deviceB);
    expect(decision.remote.document).toEqual(deviceA);

    // The chooser is shown progress each side actually holds, so the player is
    // never asked to choose blind: the fork only exists because each candidate
    // has a field the other does not.
    expect(decision.local.floorsOpen).toBeGreaterThanOrEqual(1);
    expect(decision.remote.floorsOpen).toBeGreaterThanOrEqual(1);
  });

  it('forks rather than silently adopting when the discarded device holds a claimed offline reward (2026-09-13 review, HIGH)', async () => {
    const account = await createGuestIdentity();
    // Device A played actively and is ahead on the floors/elevator/warehouse
    // vector, but never claimed offline income. Device B is behind on those
    // axis yet holds a claimed offline reward: `claimOfflineReward` credits
    // `warehouse.totalOfflineGoldClaimed`, which is now a vector field, so
    // neither save dominates and the reward cannot be silently discarded.
    const offlineReward = 1_000_000;
    const deviceA = progressDocument(2, 2);
    const deviceB = progressDocument(1, 1, BASE_GAME_BALANCE.startingGold + offlineReward, offlineReward);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);
    const decision = resolveSaveConflict(deviceB, {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    });

    // Before the counter joined the vector this was `remote-dominates`; the
    // boot reconcile would have stored device A over device B and reloaded,
    // destroying the claimed gold with nothing shown.
    expect(decision.kind).toBe('fork');

    // Neither save is destroyed: the account still holds device A at revision
    // 2, and device B's claimed reward survives in the retained candidate.
    const after = await downloadCloudSaveViaFetch(SAVE_URL, account.accessToken);
    expect(after?.document).toEqual(deviceA);
    if (decision.kind !== 'fork') {
      throw new Error('expected a fork');
    }
    expect(
      GameNumber.deserialize(
        decision.local.document.state.warehouse.totalOfflineGoldClaimed,
      ).serialize(),
    ).toBe(GameNumber.from(offlineReward).serialize());
  });

  it('adopts a dominating cloud save that spent below startingGold — the new-device restore path (2026-09-13 review)', async () => {
    const account = await createGuestIdentity();
    // Device A is ahead but spent down to 37; device B (a fresh device) holds
    // the synthesized baseline of 100 with no progress. A naive "the discarded
    // side has more gold, so fork" rule would refuse to restore here — this is
    // the regression the bound check fixes.
    const deviceA = progressDocument(2, 2, 37);
    const deviceB = progressDocument(1, 1);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);
    const decision = resolveSaveConflict(deviceB, {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    });

    expect(decision).toEqual({ kind: 'remote-dominates' });
  });

  it('keeps local silently when it dominates but spent below the stale remote\'s gold (2026-09-13 review)', async () => {
    const account = await createGuestIdentity();
    // The solo-device post-purchase case: device B is ahead but spent to 37;
    // device A is the stale pre-purchase save at 100. Must resolve silently,
    // or Step 19 could never upload after a purchase.
    const deviceA = progressDocument(1, 1);
    const deviceB = progressDocument(3, 3, 37);

    const conflict = await uploadUntilConflict(account.accessToken, deviceA, deviceB);
    const decision = resolveSaveConflict(deviceB, {
      document: conflict.document,
      receivedAtMs: Date.parse(conflict.receivedAt),
    });

    expect(decision).toEqual({ kind: 'local-dominates' });
  });
});

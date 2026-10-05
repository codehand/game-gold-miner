import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createInitialPortfolio, GameNumber } from '../../src/core';
import { createPortfolioSaveDocument, createSaveDocument, validatePortfolioSaveDocument } from '../../src/persistence';
import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const COMMAND_URL = `${API_URL}/functions/v1/save-sync/v1/portfolio/command`;
const COLLECTION_URL = `${API_URL}/functions/v1/cat-collection`;
const FIXTURE_TIME_MS = 1_757_000_000_000;

async function guestIdentity(): Promise<{ token: string; userId: string }> {
  const client = createClient(API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) throw new Error(`Anonymous sign-in failed: ${error?.message}`);
  return { token: data.session.access_token, userId: data.user.id };
}

async function guestToken(): Promise<string> {
  return (await guestIdentity()).token;
}

function request(token: string, url: string, method: 'GET' | 'PUT' | 'POST', body?: unknown) {
  return fetch(url, {
    method,
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

function affordablePortfolioDocument() {
  const base = createInitialPortfolio(FIXTURE_TIME_MS);
  const gold = base.mines.gold!;
  return createPortfolioSaveDocument({
    ...base,
    walletGold: GameNumber.from('2000000000'),
    mines: {
      gold: {
        ...gold,
        state: {
          ...gold.state,
          floors: gold.state.floors.map((floor, index) =>
            index < 5
              ? { ...floor, isUnlocked: true, mineShaftLevel: index < 4 ? 10 : 1 }
              : floor,
          ),
        },
      },
    },
  }, FIXTURE_TIME_MS);
}

describe('portfolio command transaction', () => {
  it('claims a stale foreground mine as offline time instead of full-rate play', async () => {
    const guest = await guestIdentity();
    const adopted = await request(guest.token, SAVE_URL, 'PUT', {
      baseRevision: null, document: createPortfolioSaveDocument(createInitialPortfolio(Date.now()), Date.now()),
    });
    expect(adopted.status, await adopted.clone().text()).toBe(200);
    const receiptMs = Date.now() - 10 * 60_000;
    const pastDocument = createPortfolioSaveDocument(createInitialPortfolio(receiptMs), receiptMs);
    const admin = createServiceRoleClient(API_URL);
    const seeded = await admin.from('saves').update({
      document_json: JSON.stringify(pastDocument),
      received_at: new Date(receiptMs).toISOString(),
    }).eq('user_id', guest.userId);
    expect(seeded.error).toBeNull();

    const preview = await request(guest.token, SAVE_URL, 'GET');
    expect(preview.status, await preview.clone().text()).toBe(200);
    const pending = await preview.json();
    expect(pending.document.activeMineId).toBe('gold');
    expect(pending.offlineGrants.gold.creditedDurationMs).toBeGreaterThanOrEqual(10 * 60_000);
    expect(GameNumber.from(pending.offlineGrants.gold.reward).greaterThan(0)).toBe(true);

    const entered = await request(guest.token, COMMAND_URL, 'POST', {
      type: 'enter', mineId: 'gold', baseRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(entered.status, await entered.clone().text()).toBe(200);
    const result = await entered.json();
    expect(result.result.claimedSequence).toBe(1);
    expect(result.result.grant.creditedDurationMs).toBeGreaterThanOrEqual(10 * 60_000);
    expect(GameNumber.from(result.result.grant.reward).greaterThan(0)).toBe(true);
    expect(result.document.walletGold)
      .toBe(GameNumber.from(pastDocument.walletGold).add(result.result.grant.reward).serialize());
  });

  it('trades a cat between V4 accounts without reverting either wallet or roster', async () => {
    const seller = await guestToken();
    const buyer = await guestToken();
    for (const token of [seller, buyer]) {
      const adopted = await request(token, SAVE_URL, 'PUT', {
        baseRevision: null, document: affordablePortfolioDocument(),
      });
      expect(adopted.status).toBe(200);
    }
    const boughtCat = await request(seller, `${COLLECTION_URL}/v1/purchase`, 'POST', {
      assetId: 'miner:SSR:forge:idle', idempotencyKey: crypto.randomUUID(),
    });
    expect(boughtCat.status, await boughtCat.clone().text()).toBe(200);
    const catId = (await boughtCat.json()).cats[0].catInstanceId as string;
    const listed = await request(seller, `${COLLECTION_URL}/v1/listings`, 'POST', {
      catInstanceId: catId, listingType: 'sale', priceExact: '10000',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(listed.status, await listed.clone().text()).toBe(200);
    const listingId = (await listed.json()).listingId as string;
    const sold = await request(buyer, `${COLLECTION_URL}/v1/listings/${listingId}/buy`, 'POST', {
      idempotencyKey: crypto.randomUUID(),
    });
    expect(sold.status, await sold.clone().text()).toBe(200);
    for (const [token, ownsCat, expectedGold] of [
      [seller, false, '1999974000'],
      [buyer, true, '1999990000'],
    ] as const) {
      const save = await request(token, SAVE_URL, 'GET');
      expect(save.status).toBe(200);
      const document = (await save.json()).document;
      expect(document.schemaVersion).toBe(4);
      expect(document.walletGold).toBe(expectedGold);
      expect(document.cats.some((cat: { catInstanceId: string }) => cat.catInstanceId === catId))
        .toBe(ownsCat);
      validatePortfolioSaveDocument(document);
    }
  });

  it('keeps the V4 wallet and mine-scoped cat roster authoritative across Collection commands', async () => {
    const token = await guestToken();
    const adopted = await request(token, SAVE_URL, 'PUT', {
      baseRevision: null, document: affordablePortfolioDocument(),
    });
    expect(adopted.status).toBe(200);
    const boughtMine = await request(token, COMMAND_URL, 'POST', {
      type: 'purchase', mineId: 'amethyst', baseRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(boughtMine.status).toBe(200);
    const afterMinePurchase = (await boughtMine.json()).document.walletGold as string;

    const buyCat = async () => {
      const response = await request(token, `${COLLECTION_URL}/v1/purchase`, 'POST', {
        assetId: 'miner:SSR:forge:idle', idempotencyKey: crypto.randomUUID(),
      });
      expect(response.status, await response.clone().text()).toBe(200);
      return await response.json();
    };
    const first = await buyCat();
    const second = await buyCat();
    expect(first.walletGold).toBe(String(BigInt(afterMinePurchase) - 36_000n));
    expect(second.walletGold).toBe(String(BigInt(afterMinePurchase) - 72_000n));
    const firstCatId = first.cats[0].catInstanceId as string;
    const secondCatId = second.cats.find(
      (cat: { catInstanceId: string }) => cat.catInstanceId !== firstCatId,
    ).catInstanceId as string;
    const assign = (catInstanceId: string, slotKey: string, revision: number) =>
      request(token, `${COLLECTION_URL}/v1/assignment`, 'POST', {
        catInstanceId, slotKey, expectedAssignmentRevision: revision,
      });
    const gold = await assign(firstCatId, 'mine:gold:miner:floor-1', 0);
    expect(gold.status, await gold.clone().text()).toBe(200);
    const reuse = await assign(firstCatId, 'mine:amethyst:miner:floor-1', 1);
    expect(reuse.status).toBe(409);
    const amethyst = await assign(secondCatId, 'mine:amethyst:miner:floor-1', 1);
    expect(amethyst.status, await amethyst.clone().text()).toBe(200);

    const saved = await request(token, SAVE_URL, 'GET');
    expect(saved.status).toBe(200);
    const snapshot = await saved.json();
    expect(snapshot.document.schemaVersion).toBe(4);
    expect(snapshot.document.walletGold).toBe(second.walletGold);
    expect(snapshot.document.assignments).toEqual([
      { slotKey: 'mine:amethyst:miner:floor-1', catInstanceId: secondCatId },
      { slotKey: 'mine:gold:miner:floor-1', catInstanceId: firstCatId },
    ]);
    expect(validatePortfolioSaveDocument(snapshot.document).cats).toHaveLength(2);
    const routine = await request(token, SAVE_URL, 'PUT', {
      baseRevision: snapshot.revision, document: snapshot.document,
    });
    expect(routine.status, await routine.clone().text()).toBe(200);
  });

  it('does not expose the atomic writer RPC to a signed-in browser', async () => {
    const token = await guestToken();
    const response = await fetch(`${API_URL}/rest/v1/rpc/apply_portfolio_command`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: crypto.randomUUID(),
        p_idempotency_key: crypto.randomUUID(),
        p_fingerprint: 'a'.repeat(64),
        p_base_revision: 1,
        p_document_json: '{}',
        p_received_at: new Date().toISOString(),
        p_result_json: {},
      }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('42501');
    const rosterWriter = await fetch(`${API_URL}/rest/v1/rpc/sync_portfolio_cat_roster`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: crypto.randomUUID(), p_bump_revision: true }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(rosterWriter.status).toBe(403);
    expect((await rosterWriter.json()).code).toBe('42501');
  });

  it('serializes duplicate and competing commands from two requests', async () => {
    const token = await guestToken();
    const adopted = await request(token, SAVE_URL, 'PUT', {
      baseRevision: null, document: affordablePortfolioDocument(),
    });
    expect(adopted.status).toBe(200);
    const purchase = {
      type: 'purchase', mineId: 'amethyst', baseRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    const duplicates = await Promise.all([
      request(token, COMMAND_URL, 'POST', purchase),
      request(token, COMMAND_URL, 'POST', purchase),
    ]);
    expect(duplicates.map((response) => response.status)).toEqual([200, 200]);
    const bodies = await Promise.all(duplicates.map((response) => response.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0].revision).toBe(2);

    const competing = await Promise.all([
      request(token, COMMAND_URL, 'POST', {
        type: 'enter', mineId: 'amethyst', baseRevision: 2,
        idempotencyKey: crypto.randomUUID(),
      }),
      request(token, COMMAND_URL, 'POST', {
        type: 'suspend', baseRevision: 2,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([200, 409]);
    const saved = await request(token, SAVE_URL, 'GET');
    expect((await saved.json()).revision).toBe(3);
  });

  it('buys once, replays once, rejects a stale revision, and enters mines once', async () => {
    const token = await guestToken();
    const adopted = await request(token, SAVE_URL, 'PUT', {
      baseRevision: null,
      document: affordablePortfolioDocument(),
    });
    expect(adopted.status).toBe(200);
    expect((await adopted.json()).revision).toBe(1);

    const key = crypto.randomUUID();
    const purchase = { type: 'purchase', mineId: 'amethyst', baseRevision: 1, idempotencyKey: key };
    const first = await request(token, COMMAND_URL, 'POST', purchase);
    expect(first.status).toBe(200);
    const accepted = await first.json();
    expect(accepted.revision).toBe(2);
    expect(accepted.document.mines.amethyst.visitCount).toBe(0);
    expect(GameNumber.from(accepted.document.walletGold).lessThan('2000000000')).toBe(true);

    const replay = await request(token, COMMAND_URL, 'POST', purchase);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(accepted);
    const changedKey = await request(token, COMMAND_URL, 'POST', {
      ...purchase, mineId: 'ruby',
    });
    expect(changedKey.status).toBe(409);
    const stale = await request(token, COMMAND_URL, 'POST', {
      ...purchase, idempotencyKey: crypto.randomUUID(),
    });
    expect(stale.status).toBe(409);

    const enterAmethyst = await request(token, COMMAND_URL, 'POST', {
      type: 'enter', mineId: 'amethyst', baseRevision: 2,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(enterAmethyst.status).toBe(200);
    const inAmethyst = await enterAmethyst.json();
    expect(inAmethyst.revision).toBe(3);
    expect(inAmethyst.document.activeMineId).toBe('amethyst');
    expect(inAmethyst.document.mines.gold.offline.sequence).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const enterGold = {
      type: 'enter', mineId: 'gold', baseRevision: 3,
      idempotencyKey: crypto.randomUUID(),
    };
    const back = await request(token, COMMAND_URL, 'POST', enterGold);
    expect(back.status).toBe(200);
    const inGold = await back.json();
    expect(inGold.revision).toBe(4);
    expect(inGold.document.activeMineId).toBe('gold');
    expect(inGold.result.claimedSequence).toBe(1);
    expect(GameNumber.from(inGold.result.grant.reward).greaterThan(0)).toBe(true);
    expect(inGold.document.mines.gold.state.warehouse.totalOfflineGoldClaimed)
      .toBe(inGold.result.grant.reward);
    const backReplay = await request(token, COMMAND_URL, 'POST', enterGold);
    expect(backReplay.status).toBe(200);
    expect(await backReplay.json()).toEqual(inGold);
    const saved = await request(token, SAVE_URL, 'GET');
    expect(saved.status).toBe(200);
    const row = await saved.json();
    expect(row.revision).toBe(4);
    expect(row.document.walletGold).toBe(inGold.document.walletGold);
    const routine = await request(token, SAVE_URL, 'PUT', {
      baseRevision: 4, document: row.document,
    });
    expect(routine.status).toBe(200);
    expect((await routine.json()).revision).toBe(5);
  });

  it('migrates a V3 Gold save from its server receipt and replays the migration', async () => {
    const token = await guestToken();
    const state = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIME_MS);
    const uploaded = await request(token, SAVE_URL, 'PUT', {
      baseRevision: null,
      document: createSaveDocument(state, BASE_GAME_BALANCE, FIXTURE_TIME_MS),
    });
    expect(uploaded.status).toBe(200);
    const original = await uploaded.json();
    const migration = {
      type: 'migrate', baseRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    const first = await request(token, COMMAND_URL, 'POST', migration);
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.revision).toBe(2);
    expect(result.document.schemaVersion).toBe(4);
    expect(result.document.mines.gold.offline.startedAtMs).toBe(Date.parse(original.receivedAt));
    const replay = await request(token, COMMAND_URL, 'POST', migration);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
  });
});

/**
 * Server-milestone Step 26 — the adversarial suite, pure-guard half.
 *
 * Attacks 1–4 (and 9's pure half) exercise guards that live entirely in
 * `src/core` / `supabase/functions` logic, so constraint 4 puts them here:
 * "Pure-logic guards (the Step 23 bound, `initData` verification, `baseRevision`
 * validation) belong in `deno test`/Vitest unit tests, which run without
 * Docker." Nothing below needs a database, a permission flag, or a live stack
 * — every collaborator is injected, the same harness Step 7 established.
 *
 * ## Why the attacks are separated from `index.test.ts`
 *
 * `index.test.ts` already covers each of these behaviours as a *feature*
 * ("answers 422 save_rejected for a document claiming more than the elapsed
 * time allows"). Step 26's deliverable is a suite whose entries are named for
 * the **attack** they refuse, each independently failing when its one guard is
 * removed (constraint 1 and 2). Keeping them in their own files is what makes
 * "run the adversarial suite alone and list all nine" (AC6) one command rather
 * than a `-t` filter over the entire unit suite.
 *
 * `npm run test:server-unit` runs this file; there is no separate script.
 *
 * ## The mutation each attack is written against
 *
 * Every test below names, in its own comment, the single guard whose removal
 * must make *that* test red. The recorded per-attack proof is in the task's
 * hand-off comment and in the Memory Bank.
 */
import assert from 'node:assert/strict';

import {
  BASE_GAME_BALANCE,
  createInitialGameState,
  createSaveDocument,
  evaluateProgressBound,
  GameNumber,
} from '../_shared/generated/core-bundle.js';
import {
  handleRequest,
  type SaveAuditEntry,
  type SaveSyncDeps,
  type StoredSaveRow,
} from './index.ts';

const FIXTURE_USER_ID = '11111111-1111-1111-1111-111111111111';
const NOW_MS = 1_757_000_000_000;
const HOUR_MS = 60 * 60 * 1_000;

function validSaveDocument(): Record<string, unknown> {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS) as unknown as Record<string, unknown>;
}

/** A stored row one minute old, i.e. one whose elapsed allowance is small. */
function storedRowOneMinuteOld(
  columnValues: Readonly<Record<string, unknown>> = {},
): StoredSaveRow {
  const document = validSaveDocument();
  return {
    revision: 1,
    documentJson: JSON.stringify({ ...document, ...columnValues }),
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
}

/**
 * A stored row two hours old. Used as attack 4's **control**: the same claim
 * the clock tests upload is admitted once the server's own measured interval is
 * genuinely long enough for it, which is what keeps those tests from being a
 * blanket refusal that would pass with the clock rule deleted.
 */
function storedRowTwoHoursOld(): StoredSaveRow {
  return {
    revision: 1,
    documentJson: JSON.stringify(validSaveDocument()),
    receivedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
}

/** A valid document whose warehouse claims `delivered` total gold. */
function documentClaimingDelivery(delivered: string): Record<string, unknown> {
  const document = validSaveDocument();
  const state = document.state as { warehouse: Record<string, unknown> };
  return {
    ...document,
    state: {
      ...state,
      warehouse: { ...state.warehouse, totalGoldDelivered: delivered },
    },
  };
}

/** A stored row whose document claims the given delivery. */
function storedRowClaimingDelivery(delivered: string): StoredSaveRow {
  return {
    revision: 1,
    documentJson: JSON.stringify(documentClaimingDelivery(delivered)),
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
}

interface UploadOutcome {
  readonly status: number;
  readonly code: string | null;
  readonly detail: Record<string, unknown> | null;
  readonly audits: readonly SaveAuditEntry[];
  readonly writes: readonly string[];
  /** True when the handler never read or parsed the body. */
  readonly bodyRead: boolean;
  readonly serverRevisionInBody: unknown;
}

/**
 * Drives one `PUT /v1/save` through the real handler with every collaborator
 * injected, capturing what the request did to the world (audit rows, writes,
 * whether the body was read) rather than only its HTTP answer — AC9 needs the
 * audit count, and AC8 needs the specific status/code/detail rather than "not
 * 200".
 */
async function upload(
  body: unknown,
  overrides: Partial<SaveSyncDeps> = {},
): Promise<UploadOutcome> {
  const audits: SaveAuditEntry[] = [];
  const writes: string[] = [];
  let bodyRead = false;

  const deps: SaveSyncDeps = {
    resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
    readCurrentSave: async () => null,
    writeSaveRow: async (userId) => {
      writes.push(userId);
      return true;
    },
    writeSaveAudit: async (entry) => {
      audits.push(entry);
    },
    // Step 28: no attack here is about the leaderboard, so a permissive no-op
    // keeps every existing case focused on its own guard.
    writeLeaderboardEntry: async () => {},
    readDisplayName: async () => null,
    rateLimit: {
      uploadByAddress: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      uploadByUser: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      downloadByAddress: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      downloadByUser: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
    },
    readSaveBody: async (request) => {
      bodyRead = true;
      return await request.text();
    },
    parseSaveBody: (rawBody) => JSON.parse(rawBody),
    ...overrides,
  };

  const response = await handleRequest(
    new Request('http://localhost/v1/save', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: 'Bearer a-valid-token' },
      body: JSON.stringify(body),
    }),
    deps,
  );

  const parsed = (await response.json()) as {
    error?: { code?: string; detail?: Record<string, unknown> };
    revision?: number;
  };

  return {
    status: response.status,
    code: parsed.error?.code ?? null,
    detail: parsed.error?.detail ?? null,
    audits,
    writes,
    bodyRead,
    serverRevisionInBody: parsed.error?.detail?.serverRevision,
  };
}

// ---------------------------------------------------------------------------
// Attack 1 — forged gold
// ---------------------------------------------------------------------------

/**
 * Guard: Step 23's `evaluateProgressBound`, run by `handleSaveUpload` after the
 * concurrency check and before the write.
 * Mutation: skipping [the bound block] must make this red.
 */
Deno.test('attack 1 (forged gold): an upload claiming more gold than the elapsed time allows is refused with 422 save_rejected', async () => {
  const outcome = await upload(
    { baseRevision: 1, document: documentClaimingDelivery('1000000000000') },
    { readCurrentSave: async () => storedRowOneMinuteOld() },
  );

  // AC8: the specific refusal — status, §4 code, and the `detail` shape — not
  // merely "not 200". A 500 would pass a looser assertion and never would here.
  assert.equal(outcome.status, 422);
  assert.equal(outcome.code, 'save_rejected');
  assert.equal(outcome.detail?.counter, 'state.warehouse.totalGoldDelivered');
  assert.equal(outcome.detail?.claimed, '1000000000000');
  assert.equal(typeof outcome.detail?.maximum, 'string');

  // The forged document never reaches the row.
  assert.equal(outcome.writes.length, 0);
  // AC9: exactly one audit row, recording the refusal.
  assert.equal(outcome.audits.length, 1);
  assert.equal(outcome.audits[0].outcome, 'rejected');
  assert.equal(outcome.audits[0].errorCode, 'save_rejected');
  assert.equal(outcome.audits[0].resultingRevision, null);
});

Deno.test('attack 1 (forged gold): an honest document within the elapsed bound is still accepted, so the guard is not a blanket refusal', async () => {
  const outcome = await upload(
    { baseRevision: 1, document: validSaveDocument() },
    { readCurrentSave: async () => storedRowOneMinuteOld() },
  );

  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.writes, [FIXTURE_USER_ID]);
  assert.equal(outcome.audits.length, 1);
  assert.equal(outcome.audits[0].outcome, 'accepted');
});

// ---------------------------------------------------------------------------
// Attack 2 — replayed documents
// ---------------------------------------------------------------------------

/**
 * Guard: §5 optimistic concurrency on `baseRevision`.
 * Mutation: returning `true` unconditionally from [the baseRevision !== storedRevision branch]
 * must make this red.
 */
Deno.test("attack 2 (replayed documents): re-uploading an already-accepted document with its now-stale baseRevision is refused with 409", async () => {
  // The exact request the server already accepted at revision 1, replayed
  // after that acceptance moved the server to revision 2. §5's token is what
  // makes the second copy distinguishable from a new save.
  const storedAtRevisionTwo: StoredSaveRow = {
    ...storedRowOneMinuteOld(),
    revision: 2,
  };

  const outcome = await upload(
    { baseRevision: 1, document: validSaveDocument() },
    { readCurrentSave: async () => storedAtRevisionTwo },
  );

  assert.equal(outcome.status, 409);
  assert.equal(outcome.code, 'revision_conflict');
  assert.equal(outcome.serverRevisionInBody, 2);
  assert.equal(outcome.writes.length, 0);
  // AC9: the replay attempt is still exactly one audit row.
  assert.equal(outcome.audits.length, 1);
  assert.equal(outcome.audits[0].errorCode, 'revision_conflict');
});

Deno.test('attack 2 (replayed documents): replaying against an account the server has no row for is refused, not treated as a first upload', async () => {
  // The mirror of the first-upload exemption: a client asserting a prior sync
  // that never happened cannot have its document seeded as though it were new.
  const outcome = await upload(
    { baseRevision: 7, document: validSaveDocument() },
    { readCurrentSave: async () => null },
  );

  assert.equal(outcome.status, 409);
  assert.equal(outcome.code, 'revision_conflict');
  assert.equal(outcome.writes.length, 0);
});

Deno.test('attack 2 (replayed documents): a stale document whose content itself is out of date is refused by the bound, so a replay cannot smuggle an old branch forward', async () => {
  // A replay whose `baseRevision` happens to match (the account really is at
  // revision 1) still cannot be accepted if the document claims more than the
  // elapsed time allows — the §5 token and the Step 23 bound are independent,
  // and this is the one the token alone would miss.
  const outcome = await upload(
    { baseRevision: 1, document: documentClaimingDelivery('999999999999999') },
    { readCurrentSave: async () => storedRowClaimingDelivery('0') },
  );

  assert.equal(outcome.status, 422);
  assert.equal(outcome.code, 'save_rejected');
  assert.equal(outcome.writes.length, 0);
});

// ---------------------------------------------------------------------------
// Attack 3 — rolled-back concurrency tokens
// ---------------------------------------------------------------------------

/**
 * Guard: the `409` path for a lower-than-current revision.
 * Mutation: replacing the `baseRevision !== storedRevision` comparison with
 * `false` must make this red.
 */
Deno.test("attack 3 (rolled-back concurrency tokens): a baseRevision lower than the server's current revision is refused with 409 and writes nothing", async () => {
  const storedAtRevisionFive: StoredSaveRow = { ...storedRowOneMinuteOld(), revision: 5 };

  const outcome = await upload(
    { baseRevision: 3, document: validSaveDocument() },
    { readCurrentSave: async () => storedAtRevisionFive },
  );

  assert.equal(outcome.status, 409);
  assert.equal(outcome.code, 'revision_conflict');
  assert.equal(outcome.serverRevisionInBody, 5);
  assert.equal(outcome.writes.length, 0);
  // The rollback is visible in the audit, which is what makes it tellable from
  // an honest conflict after the fact.
  assert.equal(outcome.audits.length, 1);
  assert.equal(outcome.audits[0].baseRevision, 3);
});

/**
 * Guard: Step 24's H2 `isValidBaseRevision` check, before the value is ever
 * assigned to the audit's typed `base_revision` column.
 * Mutation: making `isValidBaseRevision` return `true` unconditionally must
 * make every case below red.
 */
Deno.test('attack 3 (rolled-back concurrency tokens): a fractional, out-of-int8, negative, or non-numeric baseRevision is refused with 400 malformed_request, each writing exactly one audit row', async () => {
  const malformed: readonly (readonly [string, unknown])[] = [
    ['fractional', 1.5],
    ['out-of-int8', 1e300],
    ['negative', -1],
    ['non-numeric', '1'],
    ['zero', 0],
  ];

  for (const [label, value] of malformed) {
    const outcome = await upload(
      { baseRevision: value, document: validSaveDocument() },
      { readCurrentSave: async () => storedRowOneMinuteOld() },
    );

    assert.equal(outcome.status, 400, `${label}: expected 400`);
    assert.equal(outcome.code, 'malformed_request', `${label}: expected malformed_request`);
    assert.equal(outcome.writes.length, 0, `${label}: no write`);
    // H2's whole point: an unrepresentable value must not abort the insert and
    // erase the attempt's trace.
    assert.equal(outcome.audits.length, 1, `${label}: exactly one audit row`);
    assert.equal(outcome.audits[0].outcome, 'rejected', `${label}: rejected`);
    assert.equal(outcome.audits[0].errorCode, 'malformed_request', `${label}: code recorded`);
    assert.equal(outcome.audits[0].baseRevision, null, `${label}: coerced to null`);
  }
});

// ---------------------------------------------------------------------------
// Attack 4 — clock manipulation in both directions
// ---------------------------------------------------------------------------

/**
 * The largest `totalGoldDelivered` the Step 23 bound admits over a given
 * elapsed interval, **read out of the bound itself** rather than hard-coded.
 *
 * The two clock tests below only mean something if the document they upload
 * claims an amount that is *inside* one interval's allowance and *outside*
 * another's. A claim of `1e12` — the value the other attacks use, where the
 * bound is the whole point — is refused even when the server wrongly grants a
 * hundred hours, because the mine cannot produce a trillion gold in a hundred
 * hours either; the assertion would hold with the clock rule intact or broken
 * alike. An obviously-forged claim makes `evaluateProgressBound` return the
 * maximum it computed, so this number is the bound's own and follows the
 * balance config instead of drifting from it.
 */
function maximumDeliveryFor(elapsedMs: number): string {
  const previous = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const candidate = {
    ...previous,
    warehouse: { ...previous.warehouse, totalGoldDelivered: GameNumber.from('1e30') },
  };

  const violation = evaluateProgressBound({
    previous,
    candidate,
    elapsedMs,
    config: BASE_GAME_BALANCE,
  });

  if (violation === null || violation.counter !== 'state.warehouse.totalGoldDelivered') {
    throw new Error('the clock probe was not bounded on state.warehouse.totalGoldDelivered');
  }

  return violation.maximum;
}

/**
 * Two hours of the mine's own production: refused by the sixty seconds the
 * server actually measured, admitted by the hundred (or the five) hours the
 * document claims. That gap is what makes each direction's assertion sensitive
 * to the clock *origin*, which is the guard attack 4 exists to prove.
 */
function twoHoursOfDelivery(): string {
  return maximumDeliveryFor(2 * HOUR_MS);
}

/**
 * A document whose own clock claims `skewMs` relative to real now, carrying
 * `delivered` gold.
 *
 * Both `savedAtTimestampMs` **and** the state's own `lastUpdateTimestampMs`
 * move together: `saveSchema.ts` rejects a document whose save time precedes
 * its own last update, so skewing only the former would answer
 * `422 save_invalid` before the bound was ever consulted — a red test that
 * proves nothing about the clock rule. The skew is taken from `Date.now()`
 * rather than the fixed `NOW_MS` for the same class of reason: the handler's
 * stored row is stamped from the real clock, so a document dated against a
 * symbolic one is "ahead" or "behind" only relative to itself.
 */
function documentWithSkewedClock(skewMs: number, delivered: string): Record<string, unknown> {
  const clientClockMs = Date.now() + skewMs;
  const document = createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, clientClockMs),
    BASE_GAME_BALANCE,
    clientClockMs,
  ) as unknown as Record<string, unknown>;
  const state = document.state as Record<string, unknown>;

  return {
    ...document,
    state: {
      ...state,
      warehouse: {
        ...(state.warehouse as Record<string, unknown>),
        totalGoldDelivered: delivered,
      },
    },
  };
}

/**
 * Guard: Step 22's rule that the server clock is the only clock — the allowance
 * is measured from the stored `received_at` to the server's `now()`, and the
 * document's own timestamps can move neither.
 * Mutation: using the document's `savedAtTimestampMs` in place of the server's
 * `now()` in [the bound's elapsed computation] (`nowMs - savedAtTimestampMs`)
 * must make this test red.
 */
Deno.test('attack 4 (clock manipulation): a document whose client clock is hours behind cannot buy extra allowance against the server elapsed time', async () => {
  const outcome = await upload(
    {
      baseRevision: 1,
      document: documentWithSkewedClock(-100 * HOUR_MS, twoHoursOfDelivery()),
    },
    { readCurrentSave: async () => storedRowOneMinuteOld() },
  );

  assert.equal(outcome.status, 422);
  assert.equal(outcome.code, 'save_rejected');
  assert.equal(outcome.detail?.counter, 'state.warehouse.totalGoldDelivered');
  assert.equal(outcome.writes.length, 0);
});

/**
 * Guard: the same server-clock rule, from the other side.
 * Mutation: treating the document's claimed instant as the *end* of the
 * interval (`savedAtTimestampMs - receivedAt`) must make this test red. It is
 * a different mutation from the behind-direction one: a five-hour-early clock
 * cannot be exposed by a mutation that only removes the server's `now()` as
 * the origin, and vice versa, so each direction names its own.
 */
Deno.test('attack 4 (clock manipulation): a document whose client clock is hours ahead cannot buy extra allowance either', async () => {
  const outcome = await upload(
    {
      baseRevision: 1,
      document: documentWithSkewedClock(5 * HOUR_MS, twoHoursOfDelivery()),
    },
    { readCurrentSave: async () => storedRowOneMinuteOld() },
  );

  assert.equal(outcome.status, 422);
  assert.equal(outcome.code, 'save_rejected');
  assert.equal(outcome.detail?.counter, 'state.warehouse.totalGoldDelivered');
  assert.equal(outcome.writes.length, 0);
});

/**
 * The control: the same two hours of delivery is **admitted** when the server's
 * measured interval is genuinely long enough for it, so the two tests above
 * are not a blanket refusal of a two-hour claim.
 */
Deno.test('attack 4 (clock manipulation): the same two-hour claim is admitted against a two-hour server interval, so the clock tests are not a blanket refusal', async () => {
  const outcome = await upload(
    {
      baseRevision: 1,
      document: documentWithSkewedClock(0, twoHoursOfDelivery()),
    },
    { readCurrentSave: async () => storedRowTwoHoursOld() },
  );

  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.writes, [FIXTURE_USER_ID]);
});

/**
 * Guard: `readClientClock` records the client's own claim **verbatim** and
 * never lets it decide anything — the audit's `client_reported_at` is evidence
 * of divergence, not an input.
 * Mutation: feeding `clientReportedAt` into any decision, or dropping it from
 * the audit entry, must make this red.
 */
Deno.test('attack 4 (clock manipulation): the client clock is recorded verbatim in the audit and never changes the outcome', async () => {
  const skewedMs = NOW_MS + 5 * HOUR_MS;
  const outcome = await upload(
    { baseRevision: 1, document: { ...validSaveDocument(), savedAtTimestampMs: skewedMs } },
    { readCurrentSave: async () => storedRowOneMinuteOld() },
  );

  assert.equal(outcome.status, 200);
  assert.equal(outcome.audits.length, 1);
  // The honest outcome is unchanged by the skew…
  assert.equal(outcome.audits[0].outcome, 'accepted');
  // …while the divergent claim is preserved for the comparison that makes a
  // device-clock attack visible after the fact (Step 24's `client_reported_at`).
  assert.equal(outcome.audits[0].clientReportedAt, new Date(skewedMs).toISOString());
});

Deno.test('attack 4 (clock manipulation): an unrepresentable client clock is still recorded — as an out-of-range note — rather than aborting the audit row', async () => {
  const year10000Ms = 253_402_300_800_000 + 1;
  const outcome = await upload(
    { baseRevision: 1, document: { ...validSaveDocument(), savedAtTimestampMs: year10000Ms } },
    { readCurrentSave: async () => storedRowOneMinuteOld() },
  );

  assert.equal(outcome.status, 200);
  assert.equal(outcome.audits.length, 1);
  assert.equal(outcome.audits[0].clientReportedAt, null);
  assert.equal(outcome.audits[0].detail?.clientReportedAtOutOfRangeMs, year10000Ms);
});

// ---------------------------------------------------------------------------
// Shared sanity — attack 9's "no session, no row" half (AC9)
// ---------------------------------------------------------------------------

Deno.test('AC9 (audit invariant under attack): an unauthenticated attack attempt leaves no save_audit row at all', async () => {
  const audits: SaveAuditEntry[] = [];

  const response = await handleRequest(
    new Request('http://localhost/v1/save', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: null, document: validSaveDocument() }),
    }),
    {
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => null,
      writeSaveRow: async () => true,
      writeSaveAudit: async (entry) => {
        audits.push(entry);
      },
      rateLimit: {
        uploadByAddress: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
        uploadByUser: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
        downloadByAddress: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
        downloadByUser: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      },
      readSaveBody: async (request) => await request.text(),
      parseSaveBody: (rawBody) => JSON.parse(rawBody),
    },
  );

  assert.equal(response.status, 401);
  // `save_audit.user_id` is `not null`; there is no caller to attribute a row
  // to, which is why an unauthenticated attempt leaves none.
  assert.equal(audits.length, 0);
});

// `GameNumber` is imported so a future edit to the inflated-document helpers
// above cannot silently start emitting a plain number where the wire format
// requires a serialized `GameNumber` — a compile-time reminder rather than a
// runtime surprise.
void (GameNumber.from(0) satisfies unknown);

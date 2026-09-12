/**
 * `save-sync` Edge Function — Cat Mine Idle server milestone.
 *
 * This function is the single HTTP surface for the save-sync contract in
 * `memory-bank/server-save-sync-protocol.md`. Step 4 landed §10.1
 * `GET /v1/health`; Step 16 added §10.3 `PUT /v1/save` (upload); Step 17
 * adds §10.2 `GET /v1/save` (download) below, reusing the router, the error
 * envelope, and the error vocabulary established here rather than inventing
 * a second contract.
 *
 * Deployed path: `/functions/v1/save-sync/v1/health`. The leading
 * `/functions/v1/save-sync` is platform routing; everything after it is this
 * function's own versioned path.
 *
 * Two properties this file must keep:
 *
 * 1. The health path never reads the service-role key. `/v1/save` is
 *    different: Step 15 makes the service role the only writer of `saves`,
 *    so upload's accept path legitimately needs it — `tests/unit/server-stack.test.ts`'s
 *    "never reads the service-role key" blanket check has its own
 *    `save-sync` exception for exactly this reason, mirroring the one it
 *    already carries for `telegram-sign-in`.
 * 2. Failures use the §4 envelope with a code from the §4 vocabulary. That
 *    vocabulary has no `not_found` and no `method_not_allowed`, so a request
 *    for a path or method the contract does not define is a client bug and is
 *    answered `malformed_request` / 400.
 *
 * Server-milestone Step 7 added `index.test.ts`, unit-testing
 * `resolveFunctionRoute` and `handleRequest` by importing them directly — the
 * pure-handler half of the harness Step 7 establishes; see
 * `whoami-check/index.ts` for the fuller pattern with an injected
 * authentication collaborator. The response envelope moved to
 * `../_shared/http.ts` for reuse rather than being redefined per function.
 *
 * Step 16's `handleRequest` takes an optional `SaveSyncDeps` — real
 * collaborators by default (`Deno.serve` below never passes an override),
 * fakes in `index.test.ts` — the same injected-collaborator split
 * `telegram-sign-in/index.ts`'s `handleTelegramSignIn` established. Existing
 * calls to `handleRequest(request)` for `/v1/health` and unknown routes never
 * touch `deps` at all, so they are unaffected by this addition.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  BASE_GAME_BALANCE,
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveDocumentError,
  validateSaveDocument,
} from '../_shared/generated/core-bundle.js';
import { corsHeaders, corsPreflightResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

const FUNCTION_ROUTE_PREFIX = '/save-sync';
const PLATFORM_ROUTE_PREFIX = '/functions/v1';
const HEALTH_ROUTE = '/v1/health';
const SAVE_ROUTE = '/v1/save';
/** §3 of the protocol: capped before parsing, not to constrain a real save (~3–4 KB) but to refuse an oversized body cheaply. */
const MAX_SAVE_BODY_BYTES = 65_536;

/** A liveness probe must not hang a request behind an unreachable database. */
const DATABASE_PROBE_TIMEOUT_MS = 2_000;
/**
 * `Retry-After` for a retryable failure. §4 pairs the header with `429` and
 * `503` — the client is told to wait for it, so the response has to carry it.
 */
const RETRY_AFTER_SECONDS = 5;

/**
 * Reduces a request URL to this function's own route, so the handler matches
 * the paths written in the protocol document rather than the deployed prefix.
 */
export function resolveFunctionRoute(requestUrl: string): string {
  let path = new URL(requestUrl).pathname;

  if (path.startsWith(PLATFORM_ROUTE_PREFIX)) {
    path = path.slice(PLATFORM_ROUTE_PREFIX.length);
  }
  if (path.startsWith(FUNCTION_ROUTE_PREFIX)) {
    path = path.slice(FUNCTION_ROUTE_PREFIX.length);
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path === '' ? '/' : path;
}

/**
 * Proves the database is reachable through the same pooled path a save read
 * would take. PostgREST holds the connection pool and answers 503 when the
 * database is down, so its root document is a real round trip rather than a
 * self-report. The anon key is used deliberately: see the file header.
 *
 * Step 16 replaces this with a query against `saves` once that table exists;
 * until then no table does, so no narrower probe is available.
 */
type DatabaseProbeResult = 'ok' | 'unreachable' | 'misconfigured';

async function probeDatabase(): Promise<DatabaseProbeResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.error('save-sync health: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
    return 'misconfigured';
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: anonKey, accept: 'application/json' },
      signal: AbortSignal.timeout(DATABASE_PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.ok ? 'ok' : 'unreachable';
  } catch (error) {
    console.error('save-sync health: database probe failed.', error);
    return 'unreachable';
  }
}

async function handleHealth(): Promise<Response> {
  const probe = await probeDatabase();

  // A missing environment variable is deliberately not `service_unavailable`.
  // That code means "this will work again, keep retrying"; a function deployed
  // without its configuration never will, so answering it would have every
  // client back off forever against a database that is perfectly healthy.
  if (probe === 'misconfigured') {
    return errorResponse(500, 'server_error', 'Function is not configured.');
  }

  if (probe === 'unreachable') {
    return errorResponse(503, 'service_unavailable', 'Database unreachable.', {
      retryAfterSeconds: RETRY_AFTER_SECONDS,
    });
  }

  return jsonResponse(200, {
    status: 'ok',
    serverTime: new Date().toISOString(),
  });
}

/** Extracts the token from `Authorization: Bearer <token>` — identical to `whoami-check/index.ts`'s helper; each Edge Function owns this small a piece rather than sharing it, matching that file's own precedent. */
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

export interface AuthenticatedCaller {
  readonly userId: string;
}

export type ResolveCaller = (bearerToken: string) => Promise<AuthenticatedCaller | null>;

/** One stored row of `saves`, as read back for the concurrency check (§5) and the previous-generation shift. */
export interface StoredSaveRow {
  readonly revision: number;
  readonly documentJson: string;
  readonly receivedAt: string;
}

export type ReadCurrentSave = (userId: string, bearerToken: string) => Promise<StoredSaveRow | null>;

export interface SaveRowToWrite {
  readonly revision: number;
  readonly schemaVersion: number;
  readonly documentJson: string;
  readonly receivedAt: string;
  readonly previousRevision: number | null;
  readonly previousDocumentJson: string | null;
  readonly previousReceivedAt: string | null;
}

/**
 * Applies `row` as a compare-and-swap against whatever the caller's prior
 * read observed (`row.previousRevision`), not a blind write: resolves
 * `true` when it actually took effect and `false` when a concurrent upload
 * already moved the row out from under it. See the real implementation,
 * `writeSaveRowViaServiceRole`, for why a read-check-write here (an earlier,
 * fixed defect) is not atomic and this must be.
 */
export type WriteSaveRow = (userId: string, row: SaveRowToWrite) => Promise<boolean>;

export interface SaveSyncDeps {
  readonly resolveCaller: ResolveCaller;
  readonly readCurrentSave: ReadCurrentSave;
  readonly writeSaveRow: WriteSaveRow;
}

/**
 * §10.3 `PUT /v1/save`. Every wire shape, error code, and HTTP status below
 * is taken literally from `memory-bank/server-save-sync-protocol.md` §3–§5
 * and §10.3 — this function invents none of it.
 */
async function handleSaveUpload(request: Request, deps: SaveSyncDeps, origin: string | null): Promise<Response> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  // Cheap first: a truthful `Content-Length` refuses an oversized body
  // before buffering it at all. Not authoritative on its own — chunked
  // transfer encoding omits the header entirely, and nothing stops a client
  // from lying about it — so the post-read check below still runs
  // regardless of what this one finds.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SAVE_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_SAVE_BODY_BYTES} bytes.`, { origin });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_SAVE_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_SAVE_BODY_BYTES} bytes.`, { origin });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'malformed_request', 'Body is not valid JSON.', { origin });
  }

  if (
    typeof parsedBody !== 'object' ||
    parsedBody === null ||
    !('document' in parsedBody) ||
    !('baseRevision' in parsedBody)
  ) {
    return errorResponse(400, 'malformed_request', 'Body is not an object with document and baseRevision.', {
      origin,
    });
  }

  const { document, baseRevision } = parsedBody as { document: unknown; baseRevision: unknown };
  if (baseRevision !== null && typeof baseRevision !== 'number') {
    return errorResponse(400, 'malformed_request', 'baseRevision must be a number or null.', { origin });
  }

  const schemaVersion =
    typeof document === 'object' && document !== null && 'schemaVersion' in document
      ? (document as { schemaVersion: unknown }).schemaVersion
      : undefined;
  if (schemaVersion !== CURRENT_SAVE_SCHEMA_VERSION) {
    return errorResponse(422, 'schema_unsupported', `Unsupported schemaVersion ${String(schemaVersion)}.`, {
      detail: { supported: [CURRENT_SAVE_SCHEMA_VERSION] },
      origin,
    });
  }

  let validatedDocumentJson: string;
  try {
    const validated = validateSaveDocument(document, BASE_GAME_BALANCE);
    validatedDocumentJson = JSON.stringify(validated);
  } catch (error) {
    if (error instanceof SaveDocumentError) {
      return errorResponse(422, 'save_invalid', 'Document failed validation.', {
        detail: { reason: error.message },
        origin,
      });
    }
    throw error;
  }

  const current = await deps.readCurrentSave(caller.userId, token);
  const storedRevision = current?.revision ?? null;

  if (baseRevision !== storedRevision) {
    return revisionConflictResponse(current, origin);
  }

  const receivedAt = new Date().toISOString();
  const revision = (current?.revision ?? 0) + 1;

  const applied = await deps.writeSaveRow(caller.userId, {
    revision,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    documentJson: validatedDocumentJson,
    receivedAt,
    previousRevision: current?.revision ?? null,
    previousDocumentJson: current?.documentJson ?? null,
    previousReceivedAt: current?.receivedAt ?? null,
  });

  if (!applied) {
    // Lost a race against a concurrent upload that wrote between the read
    // above and this write — re-read so the conflict carries the actual
    // winner's document, not the snapshot this request lost against.
    const afterRace = await deps.readCurrentSave(caller.userId, token);
    return revisionConflictResponse(afterRace, origin);
  }

  return jsonResponse(200, { revision, receivedAt }, origin);
}

function revisionConflictResponse(current: StoredSaveRow | null, origin: string | null): Response {
  return errorResponse(409, 'revision_conflict', 'Save was updated elsewhere.', {
    detail: {
      serverRevision: current?.revision,
      receivedAt: current?.receivedAt,
      document: current ? JSON.parse(current.documentJson) : undefined,
    },
    origin,
  });
}

/**
 * §10.2 `GET /v1/save`. `200` with the stored document when one exists,
 * `204` with no body when it does not — "the normal first-sign-in path, not
 * an error," per the protocol. The read goes through the caller's own token
 * (`saves_select_own`), so it needs no elevated privilege.
 */
async function handleSaveDownload(request: Request, deps: SaveSyncDeps, origin: string | null): Promise<Response> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  const current = await deps.readCurrentSave(caller.userId, token);
  if (current === null) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  return jsonResponse(
    200,
    {
      revision: current.revision,
      receivedAt: current.receivedAt,
      document: JSON.parse(current.documentJson),
    },
    origin,
  );
}

/**
 * The real `resolveCaller`: verifies the bearer token against Supabase Auth,
 * the identical shape `whoami-check/index.ts`'s `resolveCallerViaSupabaseAuth`
 * uses (anon-key client scoped to the caller's own token, `auth.getUser`).
 * Throws on missing configuration rather than returning `null` — a broken
 * deployment is not the caller's fault and must not look like a bad token.
 */
async function resolveCallerViaSupabaseAuth(bearerToken: string): Promise<AuthenticatedCaller | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.getUser(bearerToken);
  if (error || !data.user) {
    return null;
  }

  return { userId: data.user.id };
}

/**
 * Reads the caller's own row through `saves_select_own` — the anon-key
 * client scoped to the caller's own token, exactly as authentication above
 * uses, so this needs no elevated privilege at all.
 */
async function readCurrentSaveRow(userId: string, bearerToken: string): Promise<StoredSaveRow | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client
    .from('saves')
    .select('revision, document_json, received_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`save-sync: reading saves row failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return { revision: data.revision, documentJson: data.document_json, receivedAt: data.received_at };
}

/**
 * The only writer of `saves` (Step 15's RLS denies every client write), so
 * this is the one place in this function that legitimately needs
 * `SUPABASE_SERVICE_ROLE_KEY` — `tests/unit/server-stack.test.ts` carries a
 * named exception for `save-sync` for exactly this line.
 *
 * A blind `upsert` here was a 2026-09-12 review finding: `handleSaveUpload`
 * reads the current revision, compares it to `baseRevision`, and only then
 * calls this function — three separate round trips with no atomicity
 * between them. Two overlapping uploads can both read revision 1, both pass
 * the check, and both `upsert` revision 2, silently discarding whichever one
 * lost, with §5's "server holds one monotonic revision" guarantee broken in
 * the same stroke. Not reachable by a real player yet (Step 19's client
 * upload path is unbuilt, so only tests call this today), but the endpoint
 * is live and exactly what Step 19 will make two devices race against.
 *
 * The fix is a compare-and-swap, split by whether a row already existed at
 * read time (`row.previousRevision === null` iff it did not):
 * - **First write**: a plain `insert`. `user_id` is the primary key, so a
 *   concurrent first upload racing this one fails `23505` (unique
 *   violation) instead of silently overwriting — caught below and reported
 *   as a lost race, not a server error.
 * - **Subsequent write**: `update ... where user_id = ? and revision = ?`
 *   — atomic in Postgres — matching only the exact row this request read.
 *   A concurrent writer that already moved the revision leaves zero rows
 *   matched, detected via `.select()`'s returned count rather than assumed
 *   from the (missing) error.
 *
 * Returns whether the write actually applied, so `handleSaveUpload` can turn
 * a lost race into the `409 revision_conflict` it already knows how to
 * build, rather than the `200` a blind write would have returned to both
 * racers.
 */
async function writeSaveRowViaServiceRole(userId: string, row: SaveRowToWrite): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const columns = {
    revision: row.revision,
    schema_version: row.schemaVersion,
    document_json: row.documentJson,
    received_at: row.receivedAt,
    previous_revision: row.previousRevision,
    previous_document_json: row.previousDocumentJson,
    previous_received_at: row.previousReceivedAt,
  };

  if (row.previousRevision === null) {
    const { error } = await admin.from('saves').insert({ user_id: userId, ...columns });

    if (error) {
      if (error.code === '23505') {
        return false;
      }
      throw new Error(`save-sync: writing saves row failed: ${error.message}`);
    }

    return true;
  }

  const { data, error } = await admin
    .from('saves')
    .update(columns)
    .eq('user_id', userId)
    .eq('revision', row.previousRevision)
    .select('user_id');

  if (error) {
    throw new Error(`save-sync: writing saves row failed: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

const defaultSaveSyncDeps: SaveSyncDeps = {
  resolveCaller: resolveCallerViaSupabaseAuth,
  readCurrentSave: readCurrentSaveRow,
  writeSaveRow: writeSaveRowViaServiceRole,
};

export async function handleRequest(
  request: Request,
  deps: SaveSyncDeps = defaultSaveSyncDeps,
): Promise<Response> {
  const route = resolveFunctionRoute(request.url);
  const origin = request.headers.get('origin');

  if (route === HEALTH_ROUTE) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
        detail: { method: request.method, route },
      });
    }
    return await handleHealth();
  }

  if (route === SAVE_ROUTE) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request, 'GET, PUT, OPTIONS');
    }
    if (request.method === 'PUT') {
      return await handleSaveUpload(request, deps, origin);
    }
    if (request.method === 'GET') {
      return await handleSaveDownload(request, deps, origin);
    }
    return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
      detail: { method: request.method, route },
      origin,
    });
  }

  return errorResponse(400, 'malformed_request', 'Unknown route.', { detail: { route } });
}

// Guarded so importing this module — as `index.test.ts` does, to unit-test
// `resolveFunctionRoute` and `handleRequest` in isolation — does not also
// start a live listener. `import.meta.main` is true only when the edge
// runtime runs this file directly to serve real requests.
if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleRequest(request);
    } catch (error) {
      console.error('save-sync: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.');
    }
  });
}

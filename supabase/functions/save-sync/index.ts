/**
 * `save-sync` Edge Function — Cat Mine Idle server milestone.
 *
 * This function is the single HTTP surface for the save-sync contract in
 * `memory-bank/server-save-sync-protocol.md`. Step 4 lands only §10.1
 * `GET /v1/health`; §10.2 (download) and §10.3 (upload) arrive in Steps 16 and
 * 17 and must reuse the router, the error envelope, and the error vocabulary
 * established here rather than inventing a second contract.
 *
 * Deployed path: `/functions/v1/save-sync/v1/health`. The leading
 * `/functions/v1/save-sync` is platform routing; everything after it is this
 * function's own versioned path.
 *
 * Two properties this file must keep:
 *
 * 1. It never reads the service-role key on the health path. Step 15 makes the
 *    service role the only writer of `saves`, and a liveness probe is the one
 *    route that answers unauthenticated callers — so it must not hold, and must
 *    not be able to leak, the credential that bypasses row-level security.
 * 2. Failures use the §4 envelope with a code from the §4 vocabulary. That
 *    vocabulary has no `not_found` and no `method_not_allowed`, so a request
 *    for a path or method the contract does not define is a client bug and is
 *    answered `malformed_request` / 400.
 */

const FUNCTION_ROUTE_PREFIX = '/save-sync';
const PLATFORM_ROUTE_PREFIX = '/functions/v1';
const HEALTH_ROUTE = '/v1/health';

/** A liveness probe must not hang a request behind an unreachable database. */
const DATABASE_PROBE_TIMEOUT_MS = 2_000;
/**
 * `Retry-After` for a retryable failure. §4 pairs the header with `429` and
 * `503` — the client is told to wait for it, so the response has to carry it.
 */
const RETRY_AFTER_SECONDS = 5;

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly detail?: Readonly<Record<string, unknown>>;
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

interface ErrorOptions {
  readonly detail?: Readonly<Record<string, unknown>>;
  /** Seconds to wait before retrying. Set it on every code §4 marks retryable. */
  readonly retryAfterSeconds?: number;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  options: ErrorOptions = {},
): Response {
  const { detail, retryAfterSeconds } = options;
  const body: ErrorBody = { error: detail ? { code, message, detail } : { code, message } };
  const headers =
    retryAfterSeconds === undefined
      ? JSON_HEADERS
      : { ...JSON_HEADERS, 'retry-after': String(retryAfterSeconds) };
  return new Response(JSON.stringify(body), { status, headers });
}

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

export async function handleRequest(request: Request): Promise<Response> {
  const route = resolveFunctionRoute(request.url);

  if (route === HEALTH_ROUTE) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
        detail: { method: request.method, route },
      });
    }
    return await handleHealth();
  }

  return errorResponse(400, 'malformed_request', 'Unknown route.', { detail: { route } });
}

Deno.serve(async (request: Request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error('save-sync: unhandled error.', error);
    return errorResponse(500, 'server_error', 'Unhandled error.');
  }
});

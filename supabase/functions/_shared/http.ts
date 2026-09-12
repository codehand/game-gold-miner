/**
 * Shared HTTP response helpers for Cat Mine Idle Edge Functions.
 *
 * Extracted at server-milestone Step 7 from `save-sync/index.ts`, which had
 * the only copy until `whoami-check` needed the identical envelope. Every
 * function answers through this shape — the §4 envelope in
 * `memory-bank/server-save-sync-protocol.md`, generalized to functions
 * outside that protocol too — so a client (or a test) never has to branch on
 * which function it called.
 *
 * Server-milestone Step 12 adds the CORS helpers below. Finding F11
 * (`memory-bank/server-threat-model.md`) named the trigger for this
 * explicitly: no function before `telegram-sign-in` was ever called
 * directly from a browser (Steps 8–10 go through the Supabase Auth client
 * SDK or server-side tests only), so no preflight `OPTIONS` request has
 * existed until now. The policy — allowed origins, headers, an `OPTIONS`
 * handler answering before any route/method check — is defined once here,
 * per F11's own instruction to record it "in the protocol document rather
 * than each function inventing its own"; see
 * `memory-bank/server-save-sync-protocol.md`'s CORS section.
 */

export const JSON_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

/**
 * Origins the game itself is ever served from today. No deployed origin
 * exists yet (`memory-bank/server-threat-model.md` §7.5) — add the real one
 * here when it does, rather than widening this to a wildcard, which would
 * let any site call an authentication-minting endpoint on a visitor's
 * behalf.
 *
 * Server-milestone Step 17: `4173`/`4175`/`4176` are this repository's own
 * Playwright preview ports (E2E, production-bundle smoke, server-e2e — see
 * `playwright*.config.ts`), not a third-party origin — the same dev-server
 * reasoning that already lists `5173` twice (`127.0.0.1` and `localhost`).
 * Needed once `main.ts`'s cloud-save reconcile started making the first
 * `fetch()` this milestone ever makes from outside the `5173` dev server:
 * without it, `production-smoke.spec.ts`'s bundle (served on `4175`) had its
 * `GET /v1/save` silently blocked by this same allow-list, the exact
 * "unrecognized origin gets no `Access-Control-Allow-Origin`" behavior this
 * function's own doc comment describes below. All three are loopback-only
 * and carry no real exposure, but they are test-only origins, not production
 * ones: drop them from this list once a real deployed origin is added above,
 * rather than letting them linger as harmless-looking cruft in a shipped
 * allow-list.
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4175',
  'http://127.0.0.1:4176',
]);

/**
 * CORS response headers for `origin`, or none at all when it is missing or
 * not allow-listed — an unrecognized origin gets a same response body but
 * no `Access-Control-Allow-Origin`, so the browser (not this server) blocks
 * the calling page from reading it.
 */
export function corsHeaders(origin: string | null): Readonly<Record<string, string>> {
  if (origin === null || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

/**
 * Answers a CORS preflight `OPTIONS` request. Callers check
 * `request.method === 'OPTIONS'` and return this **before** any route or
 * body parsing, per F11 — a preflight carries no body and no
 * `Authorization` header, so treating it like an ordinary request would
 * fail it as malformed instead of letting the real request through.
 */
export function corsPreflightResponse(request: Request, allowedMethods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request.headers.get('origin')),
      'access-control-allow-methods': allowedMethods,
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });
}

export function jsonResponse(status: number, body: unknown, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly detail?: Readonly<Record<string, unknown>>;
  };
}

export interface ErrorOptions {
  readonly detail?: Readonly<Record<string, unknown>>;
  /** Seconds to wait before retrying. Set it on every code §4 marks retryable. */
  readonly retryAfterSeconds?: number;
  /** Set from `request.headers.get('origin')` on a route CORS applies to. */
  readonly origin?: string | null;
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  options: ErrorOptions = {},
): Response {
  const { detail, retryAfterSeconds, origin = null } = options;
  const body: ErrorBody = { error: detail ? { code, message, detail } : { code, message } };
  const headers = {
    ...JSON_HEADERS,
    ...corsHeaders(origin),
    ...(retryAfterSeconds === undefined ? {} : { 'retry-after': String(retryAfterSeconds) }),
  };
  return new Response(JSON.stringify(body), { status, headers });
}

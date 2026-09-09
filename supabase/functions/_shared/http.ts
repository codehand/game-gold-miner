/**
 * Shared HTTP response helpers for Cat Mine Idle Edge Functions.
 *
 * Extracted at server-milestone Step 7 from `save-sync/index.ts`, which had
 * the only copy until `whoami-check` needed the identical envelope. Every
 * function answers through this shape — the §4 envelope in
 * `memory-bank/server-save-sync-protocol.md`, generalized to functions
 * outside that protocol too — so a client (or a test) never has to branch on
 * which function it called.
 */

export const JSON_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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
}

export function errorResponse(
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

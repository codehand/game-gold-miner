/**
 * Server-milestone Step 15: a service-role client for integration tests that
 * must set up state no client token can write — `saves` denies every client
 * write outright (`saves_select_own` is the only policy), so proving "user A
 * cannot see user B's row" needs a seeded row for B before any client-facing
 * write path exists.
 *
 * The key itself is deliberately never a literal in any tracked file:
 * `tests/unit/server-stack.test.ts`'s "no privileged credential in any
 * tracked file" scan flags a service-role JWT with no exceptions, and
 * `tests/server-integration/authFixture.ts`'s own comment records exactly
 * that reasoning for why it carries no such key. This reads it at run time
 * from `supabase status --output json` instead — the same call
 * `scripts/verify-server-stack.mjs` already makes for `ANON_KEY` — so the
 * value never touches disk as text this repository stores.
 */
import { execFileSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedServiceRoleKey: string | null = null;

/** Mirrors `scripts/verify-server-stack.mjs`'s `parseCliJson`: the CLI's JSON may follow progress text on the same stream. */
function parseCliJson(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf('{');
  if (start === -1) {
    return null;
  }
  try {
    return JSON.parse(stdout.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readServiceRoleKeyFromCli(): string {
  if (cachedServiceRoleKey !== null) {
    return cachedServiceRoleKey;
  }

  const stdout = execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], {
    encoding: 'utf8',
  });
  const parsed = parseCliJson(stdout);
  const key = parsed?.SERVICE_ROLE_KEY;

  if (typeof key !== 'string' || key === '') {
    throw new Error(
      "serviceRoleFixture: 'supabase status --output json' did not expose SERVICE_ROLE_KEY — is the local stack running?",
    );
  }

  cachedServiceRoleKey = key;
  return key;
}

/** A service-role client, scoped to bypass row-level security entirely. Test setup only — never call this from application code. */
export function createServiceRoleClient(apiUrl: string): SupabaseClient {
  return createClient(apiUrl, readServiceRoleKeyFromCli(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

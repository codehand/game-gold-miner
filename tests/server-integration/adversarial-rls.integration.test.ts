import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY } from './authFixture';
import {
  buildRlsMatrix,
  CLIENT_ROLES,
  LEADERBOARD_ALLOWED_COLUMNS,
  LEADERBOARD_WITHHELD_COLUMN,
  readGeneratedIdentityColumns,
  readPlatformTables,
  refusedStatusFor,
  rlsCellExpectation,
  rlsMatrixRequest,
  rlsMatrixUpdateBody,
  type ClientRole,
  type PlatformTable,
} from './rlsMatrixFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 26, **attack 6: direct PostgREST writes to every
 * table**.
 *
 * The existing `saves-rls` and `profiles-rls` suites are partial coverage —
 * two tables, and hand-written cases. This suite makes the matrix
 * **exhaustive and derived** (AC7): six tables × four verbs × two client
 * roles, with the table list, the probe column per table, and the expected
 * outcome of every cell all computed from the migrations by
 * `rlsMatrixFixture.ts`. Nothing in this file names a table, a verb, or a
 * column by hand, which is what stops a seventh table from being silently
 * uncovered.
 *
 * ## Why this must run against the real stack (constraint 4)
 *
 * "An RLS attack is not proven by a unit test with a stubbed client; it needs a
 * real PostgREST request with a real `anon`/`authenticated` token." Every
 * request below goes through the live gateway to real PostgREST, and the
 * caller is either the real `anon` role (the apikey alone) or a real guest
 * session's bearer token.
 *
 * ## What is *not* claimed
 *
 * The matrix asserts the RLS/grant outcome of a direct PostgREST call. It is
 * not a claim that the tables are otherwise safe: `leaderboard_entries` is
 * world-readable by design (its column control is asserted separately below),
 * and the service role bypasses all of this — it is the only writer anywhere
 * in the schema, which is the point.
 */
const API_URL = 'http://127.0.0.1:54321';
const REST_URL = `${API_URL}/rest/v1`;

/** A fresh 64-hex-char value — `recovery_codes.code_hash` is globally unique, so a fixed literal would collide with a prior run's row. */
function randomHexHash(): string {
  return randomBytes(32).toString('hex');
}

interface AuthenticatedGuest {
  readonly userId: string;
  readonly accessToken: string;
}

async function createGuestIdentity(): Promise<AuthenticatedGuest> {
  const client = createClient(API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

/**
 * A concrete, constraint-satisfying row per table, seeded through the service
 * role — the only writer any table in this schema grants — so every probe has
 * a real value to filter on and no cell is refused for the wrong reason
 * (a missing foreign key, a check constraint, or a type error on the filter).
 */
function seededRowFor(table: string, userId: string, randomHex: string): Record<string, unknown> {
  switch (table) {
    case 'profiles':
      // Never inserted — `profiles` has no INSERT policy for any client role,
      // so this body is only ever sent as a probe. It carries the guest's own
      // **real** id (FK-satisfying against `auth.users`, and already present,
      // which is harmless): RLS's `WITH CHECK` is evaluated before the primary
      // key is, so the refusal is the policy's `42501` and not a conflict. If
      // the policy were ever removed the answer would stop being `42501` —
      // which is exactly the mutation this cell has to catch.
      return { id: userId, display_name: 'Rls Probe' };
    case 'saves':
      return { user_id: userId, revision: 1, schema_version: 2, document_json: '{"rlsProbe":true}' };
    case 'save_audit':
      // `outcome: 'rejected'` requires a non-null `error_code` and permits a
      // null `resulting_revision` — the combination the table's own check
      // constraints demand, so the seed is valid for reasons unrelated to RLS.
      return { user_id: userId, outcome: 'rejected', error_code: 'malformed_request', document_bytes: 0 };
    case 'recovery_codes':
      return { user_id: userId, code_hash: randomHex };
    case 'leaderboard_entries':
      return {
        board_key: `rls-probe-${randomHex.slice(0, 8)}`,
        user_id: userId,
        metric_exact: '1',
        metric_log10: 0,
        source_revision: 1,
      };
    case 'entitlements':
      return { user_id: userId, entitlement_key: 'cosmetic.supporter_badge', granted_by: 'rls-probe' };
    default:
      throw new Error(
        `adversarial-rls: no seed defined for public.${table}. A new table needs one here, or its matrix cells would be probed with no valid filter value.`,
      );
  }
}

function postgrest(
  role: ClientRole,
  table: string,
  query: string,
  init: RequestInit,
  accessToken: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: LOCAL_ANON_KEY,
    'content-type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (role === 'authenticated') {
    if (accessToken === null) {
      throw new Error('an authenticated probe needs a token');
    }
    headers.authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${REST_URL}/${table}${query}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
}

describe('attack 6 (direct PostgREST writes to every table): the derived RLS matrix', () => {
  let tables: readonly PlatformTable[];
  let guest: AuthenticatedGuest;
  /**
   * Each table's seeded row, read back whole rather than assumed. The probe
   * value for a filter and the no-op body for a PATCH are both taken from it,
   * so every request the matrix sends is well-typed for its column and no cell
   * is refused for a type reason instead of the control under test.
   */
  const seededRows = new Map<string, Record<string, unknown>>();
  /** From the migrations, so the no-op PATCH never assigns an identity column. */
  let identityColumns: ReadonlySet<string>;

  beforeAll(async () => {
    tables = readPlatformTables();
    identityColumns = readGeneratedIdentityColumns();
    guest = await createGuestIdentity();
    const admin = createServiceRoleClient(API_URL);

    for (const table of tables) {
      if (table.name === 'profiles') {
        // Already exists, created by the Step 9 sign-up trigger — inserting a
        // second one would violate the primary key. Its row is the guest's own.
        const { data, error } = await admin
          .from(table.name)
          .select('*')
          .eq('id', guest.userId)
          .single();
        if (error || data === null) {
          throw new Error(
            `reading the sign-up-triggered public.${table.name} row failed: ${error?.message ?? 'no row'}`,
          );
        }
        seededRows.set(table.name, data as Record<string, unknown>);
        continue;
      }

      const row = seededRowFor(table.name, guest.userId, randomHexHash());
      const { data, error } = await admin.from(table.name).insert(row).select('*');
      if (error) {
        throw new Error(`seeding public.${table.name} failed: ${error.message}`);
      }
      // The seeded row is read back rather than assumed (a table defaulting
      // its own primary key would otherwise leave the filter pointing at
      // nothing, and the PATCH body would carry a value the column rejects).
      const seeded = (data as unknown as Record<string, unknown>[] | null)?.[0];
      if (seeded === undefined || seeded === null) {
        throw new Error(`seeding public.${table.name} returned no row to read back`);
      }
      seededRows.set(table.name, seeded);
    }
  }, 60_000);

  function seededRowForName(tableName: string): Record<string, unknown> {
    const row = seededRows.get(tableName);
    if (row === undefined) {
      throw new Error(
        `adversarial-rls: no seeded row for public.${tableName} — the matrix would probe it with no valid filter value.`,
      );
    }
    return row;
  }

  /**
   * A regression guard for the derivation itself, not a substitute for it.
   *
   * The matrix below is built from the migrations, so a seventh table is
   * covered automatically rather than missed. This asserts the reader still
   * sees the six tables the schema defines today, so a migration that renames
   * or drops one — or a parser gap that silently starts returning fewer
   * tables — goes red instead of shrinking the matrix without a word.
   */
  it('the derived table list still holds the six tables the schema defines', () => {
    expect(tables.map((table) => table.name).sort()).toEqual([
      'entitlements',
      'leaderboard_entries',
      'profiles',
      'recovery_codes',
      'save_audit',
      'saves',
    ]);
  });

  it('the matrix is exhaustive: every table × verb × client role has a cell', () => {
    const matrix = buildRlsMatrix(tables);

    expect(matrix).toHaveLength(tables.length * 4 * CLIENT_ROLES.length);
    expect(new Set(matrix.map((cell) => `${cell.table}|${cell.verb}|${cell.role}`)).size).toBe(
      tables.length * 4 * CLIENT_ROLES.length,
    );
    // Nothing may be trivially "admitted" by an empty policy set: an
    // accidental empty migrations read would make every cell look refused.
    expect(matrix.some((cell) => cell.covered)).toBe(true);
  });

  // One named test per verb, each iterating every table and both roles, so a
  // failing cell names itself in the assertion message.
  for (const verb of ['select', 'insert', 'update', 'delete'] as const) {
    it(`refuses or filters the ${verb} verb on every table for both client roles, per the derived matrix`, async () => {
      const matrix = buildRlsMatrix(tables).filter((cell) => cell.verb === verb);

      for (const cell of matrix) {
        const table = tables.find((candidate) => candidate.name === cell.table)!;
        const expectation = rlsCellExpectation(cell);
        const seededRow = seededRowForName(table.name);
        const request = rlsMatrixRequest(table, cell, seededRow);

        const init: RequestInit = {
          method: request.method,
          headers: { prefer: 'return=representation' },
        };
        if (verb === 'insert') {
          init.body = JSON.stringify(seededRowFor(cell.table, guest.userId, 'a'.repeat(64)));
        }
        if (verb === 'update') {
          init.body = JSON.stringify(rlsMatrixUpdateBody(table, seededRow, identityColumns));
        }

        const response = await postgrest(cell.role, cell.table, request.query, init, guest.accessToken);
        const refusedBy = expectation.kind === 'refused' ? ` — refused by ${expectation.reason}` : '';
        const label = `${cell.role}/${cell.table}/${cell.verb} (covered by ${cell.policies.join(', ') || 'no policy'}${refusedBy})`;

        if (expectation.kind === 'refused') {
          // AC8: the specific refusal — the §4 status for this role and the
          // `42501` code, never "not 200" and never a `500`.
          expect(response.status, label).toBe(refusedStatusFor(cell.role));
          expect((await response.json()).code, label).toBe(expectation.code);
        } else if (expectation.kind === 'filtered') {
          // No permissive policy: Postgres filters every row, raising nothing.
          expect(response.status, label).toBe(expectation.status);
          expect(await response.json(), label).toEqual([]);
        } else {
          // A policy covers this cell, so PostgREST does not refuse it. Zero
          // rows is a normal answer for a policy whose USING clause excludes
          // them (every own-row policy does for a stranger).
          expect(response.status, label).toBe(200);
        }
      }
    });
  }

  /**
   * AC7's explicit call-out: `leaderboard_entries_select_all` admits every
   * *row*, so the row policy is not the control — the column grant is. This
   * asserts the column-level rule the migration records.
   */
  it('withholds leaderboard_entries.user_id at the grant layer even though the row policy admits every row', async () => {
    const attempts = [...CLIENT_ROLES].map(async (role) => {
      const request = (query: string) =>
        postgrest(role, 'leaderboard_entries', query, { method: 'GET' }, guest.accessToken);

      const withheld = await request(`?select=${LEADERBOARD_WITHHELD_COLUMN}`);
      const wildcard = await request('?select=*');
      const allowed = await request(`?select=${LEADERBOARD_ALLOWED_COLUMNS.join(',')}`);

      return { role, withheld, wildcard, allowed };
    });

    for (const { role, withheld, wildcard, allowed } of await Promise.all(attempts)) {
      // The policy admits the row; the grant does not admit this column.
      // AC8: the specific refusal for this role, with the `42501` code.
      expect(withheld.status, `${role}: select=user_id`).toBe(refusedStatusFor(role));
      expect((await withheld.json()).code, `${role}: select=user_id`).toBe('42501');

      // `*` expands to every column, including the withheld one — so it is
      // refused too, which means a board query must name its columns.
      expect(wildcard.status, `${role}: select=*`).toBe(refusedStatusFor(role));
      expect((await wildcard.json()).code, `${role}: select=*`).toBe('42501');

      // Naming only the granted columns succeeds — the board really is
      // world-readable for everything except the id.
      expect(allowed.status, `${role}: named columns`).toBe(200);
    }
  });

  /**
   * The two tables the Step 3 matrix gives no policy at all — asserted by name
   * so the derived matrix above cannot pass merely by having no cells for
   * them.
   */
  it('leaves save_audit and recovery_codes with no client access beyond a filtered empty read', async () => {
    for (const table of ['save_audit', 'recovery_codes']) {
      for (const role of CLIENT_ROLES) {
        const response = await postgrest(
          role,
          table,
          '?select=*&limit=1',
          { method: 'GET' },
          guest.accessToken,
        );

        // A `select=*` on a table with no policy is still a filtered read:
        // PostgREST does not refuse the column list, it returns no rows.
        expect(response.status, `${role}/${table}`).toBe(200);
        expect(await response.json(), `${role}/${table}`).toEqual([]);
      }
    }
  });
});

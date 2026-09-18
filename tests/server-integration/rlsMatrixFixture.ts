/**
 * Server-milestone Step 26, attack 6: the row-level-security matrix, read from
 * the migrations rather than hand-listed.
 *
 * AC7 requires the matrix be **derived**, not enumerated: "the six tables ×
 * four verbs × two client roles, with the table list read from the migrations
 * (the same read-from-disk rule `readExpectedMigrations` and TASK-002's
 * warm-up list follow), so adding a seventh table fails the suite until it is
 * covered."
 *
 * The failure mode that rule exists to prevent is a hand-kept list: someone
 * adds a table with RLS on and no policy (which is the default and therefore
 * easy to do), the list is not updated, and the suite keeps reporting PASS
 * while never asking about the new table at all. Everything here therefore
 * comes from `supabase/migrations/*.sql`:
 *
 * - the table list, from every `create table public.<name>`;
 * - the probe column per table, from that table's own first column, so a new
 *   table with an unusual primary key still gets a valid `select=` target;
 * - which (role, verb, table) cells a `create policy` grants, so the expected
 *   outcome of every cell is computed rather than asserted from memory.
 *
 * ## The observable outcome differs by verb, and that is not an accident
 *
 * Postgres row-level security is not a single "denied" shape. An INSERT that a
 * policy does not admit raises `42501`; a SELECT/UPDATE/DELETE that no policy
 * admits is *filtered* — zero rows are visible or affected, no error is raised
 * — and PostgREST answers `200` with `[]`. The existing `saves-rls` and
 * `profiles-rls` suites pin exactly that pair of shapes, and a matrix that
 * asserted `403` everywhere would be asserting a contract this database does
 * not have.
 *
 * **A refusal's status depends on the role, and the matrix says so.** Measured
 * against the live stack on 2026-09-18: an `anon` request that PostgREST
 * refuses with `42501` is answered **`401`**, while the identical refusal for
 * an `authenticated` request is **`403`** — the gateway treats the anonymous
 * role as an unauthenticated caller. Both carry `code: "42501"`, which is what
 * is asserted for both; only the status differs, so it is derived by
 * `refusedStatusFor(role)` rather than written twice.
 *
 * **A third refusal shape exists, and it is not row-level security.**
 * `leaderboard_entries` has had its *table-level* SELECT revoked
 * (`revoke select on public.leaderboard_entries from anon, authenticated`), so
 * PostgREST cannot read back the `RETURNING` representation any mutation on it
 * would need. Every INSERT/UPDATE/DELETE there is answered `401`/`403` with
 * `42501` *before* any policy is consulted, whatever the `USING`/`WITH CHECK`
 * clauses say. That is derived (`PlatformTable.tableSelectRevoked`) rather than
 * special-cased, and the column-grant rule it comes from keeps its own named
 * test in the suite.
 *
 * So a denied cell's expectation is per-verb and per-grant, and a granted cell
 * is "admitted" (any non-`42501` answer). `rlsCellExpectation` below is the
 * single place that mapping lives.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

export type ClientRole = 'anon' | 'authenticated';
export type TableVerb = 'select' | 'insert' | 'update' | 'delete';

/**
 * The four verbs a PostgREST client can express directly. `upsert` is
 * deliberately absent: it is an INSERT with `Prefer: resolution=merge-duplicates`
 * at the wire level, which the `saves-rls` suite already notes is "refused the
 * identical way a plain insert is".
 */
export const CLIENT_VERBS: readonly TableVerb[] = ['select', 'insert', 'update', 'delete'];
export const CLIENT_ROLES: readonly ClientRole[] = ['anon', 'authenticated'];

export interface PlatformTable {
  readonly name: string;
  /** The table's own first column, used as the `select=` probe. Derived, so a new table needs no edit here. */
  readonly probeColumn: string;
  /**
   * True when the migrations revoke this table's *table-level* SELECT from the
   * client roles. PostgREST needs that privilege to return a `RETURNING`
   * representation, so every mutation against such a table is refused at the
   * grant layer regardless of its policies — see this file's header.
   */
  readonly tableSelectRevoked: boolean;
}

interface SqlSource {
  readonly file: string;
  readonly sql: string;
}

function readMigrationSql(directory: string): SqlSource[] {
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(directory, file), 'utf8') }));
}

/**
 * Every `create table public.<name>` across the migrations, in first-seen
 * order, with that table's first column. A migration that creates the table
 * without listing a column first is a parse gap this surfaces loudly rather
 * than silently skipping — the same "a zero-length list would make the
 * comparison vacuously true" rule `scripts/verify-server-stack.mjs` applies to
 * `readExpectedMigrations`.
 */
export function readPlatformTables(directory = MIGRATIONS_DIRECTORY): PlatformTable[] {
  const tables: PlatformTable[] = [];
  // `[^;]*?` up to `)\s*;` is enough: a `create table` body never contains a
  // semicolon (constraints are comma-separated) and always ends `);`.
  const tablePattern =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s*\(([^;]*?)\)\s*;/gi;
  // A *table-level* revoke only: `revoke select (a, b) on public.t from …` is a
  // column revoke and must not match, because it leaves the table privilege
  // intact and so does not refuse a `RETURNING` readback.
  const tableSelectRevokePattern =
    /revoke\s+select\s+on\s+public\.([a-z_][a-z0-9_]*)\s+from\s+[^;]+;/gi;

  const revokedSelectTables = new Set<string>();
  for (const { sql } of readMigrationSql(directory)) {
    let revoke: RegExpExecArray | null;
    while ((revoke = tableSelectRevokePattern.exec(sql)) !== null) {
      revokedSelectTables.add(revoke[1]);
    }
  }

  for (const { sql } of readMigrationSql(directory)) {
    let match: RegExpExecArray | null;
    while ((match = tablePattern.exec(sql)) !== null) {
      const [, name, body] = match;
      if (tables.some((table) => table.name === name)) {
        continue;
      }
      const firstColumn = /^\s*([a-z_][a-z0-9_]*)\s/.exec(body);
      if (firstColumn === null) {
        throw new Error(
          `rlsMatrixFixture: could not read a first column for public.${name} — the derived matrix would have no probe column for it.`,
        );
      }
      tables.push({
        name,
        probeColumn: firstColumn[1],
        tableSelectRevoked: revokedSelectTables.has(name),
      });
    }
  }

  return tables;
}

/**
 * Every column the migrations declare `generated always as identity`, keyed
 * `table.column`.
 *
 * The matrix's UPDATE probe has to send a body that names at least one column
 * (PostgREST answers `400` to an empty patch), and Postgres answers
 * `428C9`/`400` — not an RLS refusal — to a patch that assigns an identity
 * column ("column \"id\" can only be updated to DEFAULT"). That would make an
 * uncovered cell look refused for a reason unrelated to the control under test,
 * so the identity columns are read from the migrations and left out of the
 * no-op body rather than discovered by a red test.
 */
export function readGeneratedIdentityColumns(directory = MIGRATIONS_DIRECTORY): Set<string> {
  const identityColumns = new Set<string>();
  const tablePattern =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s*\(([^;]*?)\)\s*;/gi;
  const identityColumnPattern = /\b([a-z_][a-z0-9_]*)\s+[^,()]*\bgenerated\s+always\s+as\s+identity\b/gi;

  for (const { sql } of readMigrationSql(directory)) {
    let table: RegExpExecArray | null;
    while ((table = tablePattern.exec(sql)) !== null) {
      const [, tableName, body] = table;
      let column: RegExpExecArray | null;
      while ((column = identityColumnPattern.exec(body)) !== null) {
        identityColumns.add(`${tableName}.${column[1]}`);
      }
      identityColumnPattern.lastIndex = 0;
    }
  }

  return identityColumns;
}

export interface RlsPolicy {
  readonly name: string;
  readonly table: string;
  /** Expanded from `for all` to every verb. */
  readonly verbs: readonly TableVerb[];
  /** Expanded from a missing/`public` `to` clause to both client roles. Never a service-role or owner role — neither is a PostgREST client role. */
  readonly roles: readonly ClientRole[];
}

/**
 * Every `create policy` across the migrations, with its roles resolved the way
 * Postgres resolves them: an absent or `public` `to` clause means *every*
 * role, which for this matrix means both client roles. Policies naming only
 * non-client roles (none exist today) would resolve to an empty role list and
 * therefore grant no cell.
 */
export function readRlsPolicies(directory = MIGRATIONS_DIRECTORY): RlsPolicy[] {
  const policies: RlsPolicy[] = [];
  const policyPattern =
    /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+public\.([a-z_][a-z0-9_]*)\s+for\s+(select|insert|update|delete|all)([^;]*?);/gi;

  for (const { sql } of readMigrationSql(directory)) {
    let match: RegExpExecArray | null;
    while ((match = policyPattern.exec(sql)) !== null) {
      const [, name, table, verb, rest] = match;
      const toClause = /\bto\s+([a-z_,\s"]+)/i.exec(rest);
      const roles = toClause === null || /\bpublic\b/i.test(toClause[1])
        ? [...CLIENT_ROLES]
        : CLIENT_ROLES.filter((role) => new RegExp(`\\b${role}\\b`, 'i').test(toClause[1]));

      policies.push({
        name,
        table,
        verbs: verb.toLowerCase() === 'all' ? [...CLIENT_VERBS] : [verb.toLowerCase() as TableVerb],
        roles,
      });
    }
  }

  return policies;
}

export interface RlsCell {
  readonly role: ClientRole;
  readonly verb: TableVerb;
  readonly table: string;
  /** The policy names that admit this combination, if any. */
  readonly policies: readonly string[];
  /** True when at least one permissive policy covers this (role, verb, table). */
  readonly covered: boolean;
  /** Copied from the table: whether its table-level SELECT is revoked (see `PlatformTable`). */
  readonly tableSelectRevoked: boolean;
}

/** The exhaustive matrix: every table × verb × client role. */
export function buildRlsMatrix(
  tables: readonly PlatformTable[] = readPlatformTables(),
  policies: readonly RlsPolicy[] = readRlsPolicies(),
): RlsCell[] {
  const cells: RlsCell[] = [];
  for (const table of tables) {
    for (const verb of CLIENT_VERBS) {
      for (const role of CLIENT_ROLES) {
        const covering = policies.filter(
          (policy) =>
            policy.table === table.name &&
            policy.verbs.includes(verb) &&
            policy.roles.includes(role),
        );
        cells.push({
          role,
          verb,
          table: table.name,
          policies: covering.map((policy) => policy.name),
          covered: covering.length > 0,
          tableSelectRevoked: table.tableSelectRevoked,
        });
      }
    }
  }
  return cells;
}

/** A cell's expected observable answer. */
export type CellExpectation =
  | { readonly kind: 'refused'; readonly code: '42501'; readonly reason: string }
  | { readonly kind: 'filtered'; readonly status: 200 }
  | { readonly kind: 'admitted' };

/**
 * The status PostgREST answers a `42501` refusal with, per client role.
 *
 * Measured, not assumed: the anonymous role is answered `401` (`401` is what
 * the gateway returns for an authorization failure that no credential could
 * make good), the authenticated role `403`. The `42501` code is identical and
 * is asserted for both; only the status is derived here.
 */
export function refusedStatusFor(role: ClientRole): 401 | 403 {
  return role === 'anon' ? 401 : 403;
}

/**
 * The one place the per-verb, per-grant observable is encoded — see this
 * file's header.
 *
 * - covered → `200`, whether or not the policy's `USING` clause matches a row.
 * - uncovered INSERT → `42501`: RLS's default-deny raises for a write.
 * - uncovered INSERT/UPDATE/DELETE on a table whose table-level SELECT is
 *   revoked → `42501` as well, from the grant rather than the policy, because
 *   the mutation's `RETURNING` representation cannot be read back.
 * - any other uncovered cell → `200` with `[]`: Postgres filters the rows and
 *   raises nothing.
 */
export function rlsCellExpectation(cell: RlsCell): CellExpectation {
  if (cell.covered) {
    return { kind: 'admitted' };
  }
  if (cell.verb === 'insert') {
    return {
      kind: 'refused',
      code: '42501',
      reason: 'no permissive INSERT policy admits this role',
    };
  }
  if (cell.tableSelectRevoked) {
    return {
      kind: 'refused',
      code: '42501',
      reason:
        'the table-level SELECT grant is revoked, so the RETURNING representation cannot be read back',
    };
  }
  return { kind: 'filtered', status: 200 };
}

/**
 * The column-level control AC7 calls out. `leaderboard_entries_select_all`
 * admits every *row* to every role, so the policy is not the control at all —
 * the grant is: `revoke select on public.leaderboard_entries from anon,
 * authenticated` followed by `grant select (board_key, display_name,
 * metric_exact, metric_log10, source_revision, updated_at)`. `user_id` is
 * withheld, so `?select=user_id` (and `select=*`, which PostgREST expands to
 * every column) is refused with `42501` while a named-column read succeeds.
 * Exported so the attack-6 test can assert this separately from the row matrix.
 */
export const LEADERBOARD_WITHHELD_COLUMN = 'user_id';
export const LEADERBOARD_ALLOWED_COLUMNS: readonly string[] = [
  'board_key',
  'display_name',
  'metric_exact',
  'metric_log10',
  'source_revision',
  'updated_at',
];

export interface RlsMatrixRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly query: string;
}

/**
 * The PostgREST request that probes one cell, shaped from the cell itself so
 * no table name, verb, or column is written by hand anywhere in the suite.
 *
 * Every request carries a filter on the probe column where one is meaningful,
 * so an UPDATE/DELETE cell that is *admitted* still cannot touch more than the
 * row the suite seeded for that purpose.
 */
export function rlsMatrixRequest(
  table: PlatformTable,
  cell: RlsCell,
  seededRow: Record<string, unknown> | null,
): RlsMatrixRequest {
  const column = table.probeColumn;
  const seededValue = seededRow === null ? null : seededRow[column];

  if (cell.verb === 'select') {
    return { method: 'GET', query: `?select=${column}&limit=1` };
  }

  if (cell.verb === 'insert') {
    // A real, FK-satisfying row where one can be built, so an INSERT that is
    // refused is refused by RLS rather than by a foreign key the migration
    // would have rejected anyway. `0` is not a uuid, so an insert without a
    // seeded id is still refused by RLS first (the policy check precedes the
    // type/FK work) — but every table here has a seedable probe column.
    return {
      method: 'POST',
      query: '',
    };
  }

  const filter =
    seededValue === undefined || seededValue === null
      ? `?${column}=eq.00000000-0000-0000-0000-000000000000`
      : `?${column}=eq.${String(seededValue)}`;

  return { method: cell.verb === 'update' ? 'PATCH' : 'DELETE', query: filter };
}

/**
 * The body a PATCH cell sends: the seeded row's own values, minus any column
 * the migrations declare `generated always as identity`.
 *
 * - **Never empty.** PostgREST answers `400` to an empty `{}` patch, which
 *   would make an un-covered update cell look refused for the wrong reason.
 * - **Never assigning an identity column.** Postgres answers `428C9`/`400` to
 *   `set id = <n>` on `save_audit.id` before RLS is consulted, so naming the
 *   probe column there would probe the identity rule instead of the control
 *   the cell is about.
 * - **A genuine no-op.** Every value is the one the row already holds and every
 *   value is correctly typed for its column, so a covered, own-row cell cannot
 *   be failed by a type error and an admitted cell cannot be changed.
 *
 * The `profiles` special case the first draft carried is gone: re-sending a
 * row's own values works for a table whose probe column is its primary key for
 * exactly the same reason it works everywhere else, so no table is named in
 * this file.
 */
export function rlsMatrixUpdateBody(
  table: PlatformTable,
  seededRow: Readonly<Record<string, unknown>>,
  identityColumns: ReadonlySet<string>,
): Record<string, unknown> {
  const assignable: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(seededRow)) {
    if (identityColumns.has(`${table.name}.${column}`)) {
      continue;
    }
    assignable[column] = value;
  }

  if (Object.keys(assignable).length === 0) {
    throw new Error(
      `rlsMatrixFixture: every column of public.${table.name} is generated, so its UPDATE cells would be probed with an empty patch — which PostgREST refuses with 400 for reasons unrelated to RLS.`,
    );
  }

  return assignable;
}

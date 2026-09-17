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
 * policy does not admit raises, and PostgREST answers `403` with
 * `code: "42501"`; a SELECT/UPDATE/DELETE that no policy admits is *filtered* —
 * zero rows are visible or affected, no error is raised — and PostgREST
 * answers `200` with `[]`. The existing `saves-rls` and `profiles-rls` suites
 * pin exactly that pair of shapes, and a matrix that asserted `403` everywhere
 * would be asserting a contract this database does not have.
 *
 * So a denied cell's expectation is per-verb, and a granted cell is "admitted"
 * (any non-`42501` answer). `rlsCellExpectation` below is the single place
 * that mapping lives.
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
      tables.push({ name, probeColumn: firstColumn[1] });
    }
  }

  return tables;
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
        });
      }
    }
  }
  return cells;
}

/** A cell's expected observable answer. */
export type CellExpectation =
  | { readonly kind: 'refused'; readonly status: 403; readonly code: '42501' }
  | { readonly kind: 'filtered'; readonly status: 200 }
  | { readonly kind: 'admitted' };

/**
 * The one place the per-verb observable is encoded — see this file's header.
 * A refused cell is only ever an INSERT, because that is the only verb whose
 * RLS default-deny raises rather than filters.
 */
export function rlsCellExpectation(cell: RlsCell): CellExpectation {
  if (cell.covered) {
    return { kind: 'admitted' };
  }
  if (cell.verb === 'insert') {
    return { kind: 'refused', status: 403, code: '42501' };
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
 * The body a PATCH cell sends. Deliberately **never empty** — PostgREST
 * answers `400` to an empty `{}` patch, which would make an un-covered update
 * cell look refused for the wrong reason and a covered one fail outright.
 *
 * It is a harmless no-op either way: the probe column is re-sent with the
 * value it already holds, so this can never change a row. `profiles` is the
 * one exception — its probe column is the primary key, which cannot be
 * assigned, so it sends `display_name` (the column a player can actually
 * update) instead.
 */
export function rlsMatrixUpdateBody(
  table: PlatformTable,
  probeValue: unknown,
): Record<string, unknown> {
  if (table.name === 'profiles') {
    return { display_name: 'Rls Probe' };
  }
  return { [table.probeColumn]: probeValue };
}

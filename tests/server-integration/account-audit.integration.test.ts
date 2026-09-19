import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FIXTURE_USER_ID,
  LOCAL_ANON_KEY,
  mintFixtureUserToken,
} from './authFixture';
import {
  deleteAuthUsers,
  querySqlAsSuperuser,
  runSqlAsSuperuser,
  sqlLiteral,
} from './directSqlFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 32: the sparse account/security audit timeline.
 *
 * The database triggers cover identity, recovery issuance, entitlement
 * changes, and save rejections at their write boundary. Recovery redemption
 * is the one deliberate Edge Function write: the code is claimed before the
 * external session mint and may be reverted if that mint fails, so the event
 * is appended only after the successful response can be delivered.
 */
const API_URL = 'http://127.0.0.1:54321';
const REST_URL = `${API_URL}/rest/v1`;
const RECOVERY_URL = `${API_URL}/functions/v1/recovery-code`;
const ACCOUNT_DELETE_URL = `${API_URL}/functions/v1/account-delete/v1/account/delete`;
const PUBLIC_APPLICATION_TABLES = [
  'account_audit',
  'entitlements',
  'leaderboard_entries',
  'profiles',
  'recovery_codes',
  'save_audit',
  'saves',
] as const;
const ACCOUNT_SCOPED_COLUMNS: Readonly<Record<string, string>> = {
  entitlements: 'user_id',
  leaderboard_entries: 'user_id',
  profiles: 'id',
  recovery_codes: 'user_id',
  save_audit: 'user_id',
  saves: 'user_id',
};
const AUDIT_EVENT_TYPES = [
  'identity_added',
  'identity_removed',
  'recovery_code_issued',
  'recovery_code_redeemed',
  'entitlement_granted',
  'entitlement_revoked',
  'save_rejected',
] as const;

interface AccountAuditRow {
  readonly id: number;
  readonly event_type: string;
  readonly user_id: string | null;
  readonly actor_type: string;
  readonly occurred_at: string;
  readonly anonymized_at: string | null;
  readonly retention_until: string | null;
  readonly detail: Record<string, unknown> | null;
}

const admin = createServiceRoleClient(API_URL);

async function allAccountAuditRows(): Promise<AccountAuditRow[]> {
  const { data, error } = await admin
    .from('account_audit')
    .select('id, event_type, user_id, actor_type, occurred_at, anonymized_at, retention_until, detail')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`reading account_audit failed: ${error.message}`);
  }

  return (data ?? []) as AccountAuditRow[];
}

async function accountAuditRowsFor(userId: string): Promise<AccountAuditRow[]> {
  return (await allAccountAuditRows()).filter((row) => row.user_id === userId);
}

async function clearFixtureState(): Promise<void> {
  const { error: entitlementError } = await admin
    .from('entitlements')
    .delete()
    .eq('user_id', FIXTURE_USER_ID);
  expect(entitlementError).toBeNull();

  const { error: recoveryError } = await admin
    .from('recovery_codes')
    .delete()
    .eq('user_id', FIXTURE_USER_ID);
  expect(recoveryError).toBeNull();

  const { error: saveAuditError } = await admin
    .from('save_audit')
    .delete()
    .eq('user_id', FIXTURE_USER_ID);
  expect(saveAuditError).toBeNull();

  // account_audit is append-only to the service role. Test cleanup runs as the
  // local Postgres superuser, never through an application path.
  runSqlAsSuperuser(
    `delete from public.account_audit where user_id = ${sqlLiteral(FIXTURE_USER_ID)};`,
  );
}

async function generateRecoveryCode(): Promise<string> {
  const response = await fetch(`${RECOVERY_URL}/v1/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${mintFixtureUserToken()}`,
      apikey: LOCAL_ANON_KEY,
    },
    signal: AbortSignal.timeout(20_000),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { code?: unknown };
  expect(typeof body.code).toBe('string');
  return body.code as string;
}

describe('account_audit (server-milestone Step 32)', () => {
  let identityUserId: string | null = null;
  let deletionUserId: string | null = null;
  let deletionAuditIds: number[] = [];

  beforeAll(async () => {
    await clearFixtureState();
  });

  afterAll(async () => {
    await clearFixtureState();
    if (identityUserId !== null) {
      runSqlAsSuperuser(
        `delete from public.account_audit where user_id = ${sqlLiteral(identityUserId)};`,
      );
      deleteAuthUsers([identityUserId]);
    }
    if (deletionAuditIds.length > 0) {
      runSqlAsSuperuser(
        `delete from public.account_audit where id in (${deletionAuditIds.join(', ')});`,
      );
    }
    if (deletionUserId !== null) {
      runSqlAsSuperuser(
        `delete from public.account_audit where user_id = ${sqlLiteral(deletionUserId)};`,
      );
      deleteAuthUsers([deletionUserId]);
    }
  });

  it('records every Step 32 event with a server timestamp and actor', async () => {
    const identityEmail = `step32-${randomUUID()}@example.invalid`;
    const { data: identityData, error: identityError } = await admin.auth.admin.createUser({
      email: identityEmail,
      password: `Step32-${randomUUID()}-password`,
      email_confirm: true,
    });
    expect(identityError).toBeNull();
    expect(identityData.user).not.toBeNull();
    identityUserId = identityData.user?.id ?? null;
    expect(identityUserId).not.toBeNull();

    const addedIdentityRows = await accountAuditRowsFor(identityUserId as string);
    expect(addedIdentityRows.some((row) => row.event_type === 'identity_added')).toBe(true);

    // Remove only the provider identity, keeping the account alive so the
    // audit row remains queryable while the trigger records the change.
    runSqlAsSuperuser(
      `delete from auth.identities where user_id = ${sqlLiteral(identityUserId as string)};`,
    );
    const changedIdentityRows = await accountAuditRowsFor(identityUserId as string);
    expect(changedIdentityRows.some((row) => row.event_type === 'identity_removed')).toBe(true);

    const code = await generateRecoveryCode();
    const issuedRows = await accountAuditRowsFor(FIXTURE_USER_ID);
    expect(issuedRows.some((row) => row.event_type === 'recovery_code_issued')).toBe(true);

    const redeemResponse = await fetch(`${RECOVERY_URL}/v1/redeem`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(redeemResponse.status).toBe(200);
    const redeemedRows = await accountAuditRowsFor(FIXTURE_USER_ID);
    expect(redeemedRows.some((row) => row.event_type === 'recovery_code_redeemed')).toBe(true);

    const { error: grantError } = await admin.from('entitlements').insert({
      user_id: FIXTURE_USER_ID,
      entitlement_key: 'cosmetic.supporter_badge',
      granted_by: 'step-32-test',
      source: 'audit-test',
    });
    expect(grantError).toBeNull();

    const { error: revokeError } = await admin
      .from('entitlements')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', FIXTURE_USER_ID)
      .eq('entitlement_key', 'cosmetic.supporter_badge');
    expect(revokeError).toBeNull();

    // Re-activating a revoked grant is another grant boundary, not a silent
    // state change that can evade the timeline.
    const { error: regrantError } = await admin
      .from('entitlements')
      .update({ revoked_at: null, source: 'audit-regrant' })
      .eq('user_id', FIXTURE_USER_ID)
      .eq('entitlement_key', 'cosmetic.supporter_badge');
    expect(regrantError).toBeNull();

    const { error: rejectedSaveError } = await admin.from('save_audit').insert({
      user_id: FIXTURE_USER_ID,
      outcome: 'rejected',
      error_code: 'step32_probe',
      base_revision: null,
      resulting_revision: null,
      document_bytes: 0,
    });
    expect(rejectedSaveError).toBeNull();

    const fixtureRows = await accountAuditRowsFor(FIXTURE_USER_ID);
    const fixtureEvents = new Set(fixtureRows.map((row) => row.event_type));
    for (const eventType of AUDIT_EVENT_TYPES.slice(2)) {
      expect(fixtureEvents.has(eventType)).toBe(true);
    }
    for (const row of [...changedIdentityRows, ...fixtureRows]) {
      expect(row.actor_type).toMatch(/^(user|server|auth)$/);
      expect(Date.parse(row.occurred_at)).not.toBeNaN();
    }
  });

  it('does not expose or accept account audit rows through a client token', async () => {
    const token = mintFixtureUserToken();
    const headers = {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };

    const read = await fetch(`${REST_URL}/account_audit?select=*&limit=1`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual([]);

    const write = await fetch(`${REST_URL}/account_audit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: FIXTURE_USER_ID,
        event_type: 'save_rejected',
        actor_type: 'user',
        detail: null,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(write.status).toBe(403);
    expect((await write.json()).code).toBe('42501');

    const directDelete = await fetch(`${REST_URL}/rpc/delete_account`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user_id: FIXTURE_USER_ID }),
      signal: AbortSignal.timeout(20_000),
    });
    expect([401, 403, 404]).toContain(directDelete.status);
  });

  it('does not make account deletion fail when identity removal is cascaded', async () => {
    const deletionEmail = `step32-delete-${randomUUID()}@example.invalid`;
    const beforeRows = await allAccountAuditRows();
    const { data, error } = await admin.auth.admin.createUser({
      email: deletionEmail,
      password: `Step32-${randomUUID()}-password`,
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    deletionUserId = data.user?.id ?? null;
    expect(deletionUserId).not.toBeNull();

    runSqlAsSuperuser(
      `delete from auth.users where id = ${sqlLiteral(deletionUserId as string)};`,
    );
    deletionUserId = null;

    const newRows = (await allAccountAuditRows()).filter(
      (row) => !beforeRows.some((before) => before.id === row.id),
    );
    deletionAuditIds = newRows.map((row) => row.id);
    expect(
      newRows.some(
        (row) =>
          row.event_type === 'identity_removed' &&
          row.user_id === null &&
          row.anonymized_at !== null &&
          row.retention_until !== null &&
          row.detail === null,
      ),
    ).toBe(true);
  });

  it('deletes every current application table and retains only anonymized audit rows', async () => {
    const tableNames = querySqlAsSuperuser(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;",
    )
      .split('\n')
      .filter((name) => name.length > 0);
    expect(tableNames).toEqual([...PUBLIC_APPLICATION_TABLES].sort());

    const deletionEmail = `step33-${randomUUID()}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email: deletionEmail,
      password: `Step33-${randomUUID()}-password`,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const userId = data.user?.id;
    expect(userId).toBeDefined();
    if (userId === undefined) {
      throw new Error('Step 33 fixture user was not created.');
    }
    deletionUserId = userId ?? null;

    const { error: saveError } = await admin.from('saves').insert({
      user_id: userId,
      revision: 1,
      schema_version: 1,
      document_json: '{}',
    });
    expect(saveError).toBeNull();

    const { error: saveAuditError } = await admin.from('save_audit').insert({
      user_id: userId,
      outcome: 'accepted',
      error_code: null,
      base_revision: null,
      resulting_revision: 1,
      document_bytes: 2,
    });
    expect(saveAuditError).toBeNull();

    const recoveryHash = `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
    const { error: recoveryError } = await admin.from('recovery_codes').insert({
      user_id: userId,
      code_hash: recoveryHash,
    });
    expect(recoveryError).toBeNull();

    const { error: leaderboardError } = await admin.from('leaderboard_entries').insert({
      board_key: 'lifetime-gold',
      user_id: userId,
      display_name: 'To be deleted',
      metric_exact: '1',
      metric_log10: 0,
      source_revision: 1,
    });
    expect(leaderboardError).toBeNull();

    const { error: entitlementError } = await admin.from('entitlements').insert({
      user_id: userId,
      entitlement_key: 'cosmetic.supporter_badge',
      granted_by: 'step-33-test',
      source: 'deletion-test',
    });
    expect(entitlementError).toBeNull();

    const { data: auditData, error: auditError } = await admin
      .from('account_audit')
      .insert({
        user_id: userId,
        event_type: 'save_rejected',
        actor_type: 'user',
        detail: { errorCode: 'seeded-for-deletion' },
      })
      .select('id')
      .single();
    expect(auditError).toBeNull();
    const seededAuditId = auditData?.id as number;

    const beforeDeletionRows = await allAccountAuditRows();
    const identityAdded = beforeDeletionRows.find(
      (row) => row.user_id === userId && row.event_type === 'identity_added',
    );
    expect(identityAdded).toBeDefined();

    const response = await fetch(ACCOUNT_DELETE_URL, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${mintFixtureUserToken({ userId })}`,
        'content-type': 'application/json',
      },
      // The endpoint must ignore this attacker-controlled id and delete only
      // the account represented by the bearer token.
      body: JSON.stringify({ userId: FIXTURE_USER_ID }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    deletionUserId = null;

    expect(querySqlAsSuperuser(
      `select count(*) from auth.users where id = ${sqlLiteral(userId)};`,
    )).toBe('0');

    for (const [tableName, column] of Object.entries(ACCOUNT_SCOPED_COLUMNS)) {
      const { data: rows, error: rowError } = await admin
        .from(tableName)
        .select('*')
        .eq(column, userId);
      expect(rowError, `${tableName} query failed`).toBeNull();
      expect(rows, `${tableName} retained a personal row`).toEqual([]);
    }

    const afterDeletionRows = await allAccountAuditRows();
    const seededAudit = afterDeletionRows.find((row) => row.id === seededAuditId);
    expect(seededAudit).toMatchObject({
      user_id: null,
      detail: null,
    });
    expect(seededAudit?.anonymized_at).not.toBeNull();
    expect(seededAudit?.retention_until).not.toBeNull();
    expect(Date.parse(seededAudit?.retention_until ?? '') - Date.parse(seededAudit?.anonymized_at ?? ''))
      .toBe(30 * 24 * 60 * 60 * 1000);

    const cascadedIdentityRemoval = afterDeletionRows.find(
      (row) =>
        row.event_type === 'identity_removed' &&
        row.id > (identityAdded?.id ?? 0) &&
        row.anonymized_at !== null,
    );
    expect(cascadedIdentityRemoval).toMatchObject({
      user_id: null,
      detail: null,
    });
    expect(cascadedIdentityRemoval?.retention_until).not.toBeNull();

    deletionAuditIds = afterDeletionRows
      .filter((row) => row.anonymized_at !== null)
      .map((row) => row.id);
  });
});

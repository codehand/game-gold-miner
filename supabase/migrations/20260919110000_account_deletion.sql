-- Server-milestone Step 33.
--
-- Account deletion keeps a sparse, non-identifying security timeline for the
-- stated retention period: the account lifetime plus 30 days after deletion.
-- All ordinary application rows still disappear through the auth.users
-- cascades already documented by Step 3. This migration is separate from the
-- Step 32 migration so an existing installation upgrades forward-only.

alter table public.account_audit
  add column anonymized_at timestamptz null,
  add column retention_until timestamptz null;

-- Step 32 could already have recorded an identity-removal event with a null
-- account link before this retention metadata existed. Bring those historical
-- rows into the new invariant before adding its constraint.
update public.account_audit
set anonymized_at = occurred_at,
    retention_until = occurred_at + interval '30 days',
    detail = null
where user_id is null;

alter table public.account_audit
  add constraint account_audit_anonymization_pair
  check (
    (user_id is not null and anonymized_at is null and retention_until is null)
    or (
      user_id is null
      and anonymized_at is not null
      and retention_until is not null
      and retention_until >= anonymized_at
    )
  );

create index account_audit_retention_idx
  on public.account_audit (retention_until)
  where user_id is null;

-- Keep ordinary identity removals linked while the account remains alive. A
-- cascade from auth.users runs after the parent row is gone; that event is
-- inserted anonymous and retained under the same 30-day rule.
create or replace function public.audit_auth_identity_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_at timestamptz;
begin
  if tg_op = 'INSERT' then
    perform public.record_account_audit_event(
      'identity_added',
      new.user_id,
      'auth',
      jsonb_build_object('provider', new.provider)
    );
    return new;
  end if;

  if exists (select 1 from auth.users where auth.users.id = old.user_id) then
    perform public.record_account_audit_event(
      'identity_removed',
      old.user_id,
      'auth',
      jsonb_build_object('provider', old.provider)
    );
  else
    deletion_at := pg_catalog.clock_timestamp();
    insert into public.account_audit (
      event_type,
      user_id,
      actor_type,
      anonymized_at,
      retention_until,
      detail
    )
    values (
      'identity_removed',
      null,
      'auth',
      deletion_at,
      deletion_at + interval '30 days',
      null
    );
  end if;
  return old;
end;
$$;

-- The FK's `on delete set null` action can run before a cascading identity
-- trigger. An account may also be removed by an operator's Auth Admin call,
-- not only through the Edge Function, so anonymization must happen at the
-- parent boundary before PostgreSQL starts any dependent-row actions.
create function public.anonymize_account_audit_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_at timestamptz := pg_catalog.clock_timestamp();
begin
  update public.account_audit
  set user_id = null,
      anonymized_at = deletion_at,
      retention_until = deletion_at + interval '30 days',
      detail = null
  where user_id = old.id;
  return old;
end;
$$;

create trigger auth_user_account_audit_anonymization
  before delete on auth.users
  for each row execute function public.anonymize_account_audit_before_user_delete();

-- Account deletion is one database transaction. The Edge Function authenticates
-- the caller, then invokes this service-only function. It anonymizes every
-- existing audit row before deleting auth.users, so the existing ON DELETE
-- CASCADE relationships remove every ordinary application row. Details are
-- cleared as well; retained rows contain only event type, actor, and timing.
create function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_at timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null then
    raise exception 'account deletion requires a user id';
  end if;

  update public.account_audit
  set user_id = null,
      anonymized_at = deletion_at,
      retention_until = deletion_at + interval '30 days',
      detail = null
  where user_id = p_user_id;

  delete from auth.users
  where id = p_user_id;
end;
$$;

revoke execute on function public.delete_account(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_account(uuid)
  to service_role;

-- The operator's scheduled purge is service-only. An explicit cutoff makes
-- the retention boundary deterministic in the restore/deletion drill and
-- prevents a client from choosing which audit rows disappear.
create function public.purge_expired_account_audit(
  p_before timestamptz default pg_catalog.clock_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from public.account_audit
  where user_id is null
    and retention_until is not null
    and retention_until <= p_before;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke execute on function public.purge_expired_account_audit(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_account_audit(timestamptz)
  to service_role;

-- Server-milestone Step 32.
--
-- The save_audit table answers a different question: what happened to one
-- save-sync request. This table is the sparse account/security timeline for
-- identity changes, recovery-code lifecycle events, entitlement changes, and
-- rejected saves. It is deliberately append-only from every client role and
-- from the service role's ordinary table privileges. Trusted database
-- triggers and the one server-only RPC below are the writers.

create table public.account_audit (
  id          bigint      generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type  text        not null,
  user_id     uuid            null references auth.users(id) on delete set null,
  actor_type  text        not null,
  detail      jsonb           null,
  constraint account_audit_event_type_known
    check (event_type in (
      'identity_added',
      'identity_removed',
      'recovery_code_issued',
      'recovery_code_redeemed',
      'entitlement_granted',
      'entitlement_revoked',
      'save_rejected'
    )),
  constraint account_audit_actor_type_known
    check (actor_type in ('user', 'server', 'auth')),
  constraint account_audit_detail_object
    check (detail is null or jsonb_typeof(detail) = 'object'),
  constraint account_audit_detail_size
    check (detail is null or octet_length(detail::text) <= 4096)
);

create index account_audit_user_time_idx
  on public.account_audit (user_id, occurred_at desc);

create index account_audit_event_time_idx
  on public.account_audit (event_type, occurred_at desc);

alter table public.account_audit enable row level security;

-- No client role can read or write the account timeline because RLS has no
-- policies. The service role may insert so the recovery-code function can
-- record its post-mint event and integration fixtures can seed a valid row;
-- update and delete remain absent, making ordinary service-role access
-- append-only as well.
revoke insert, update, delete on public.account_audit from service_role;
grant select on public.account_audit to service_role;
grant insert (event_type, user_id, actor_type, detail)
  on public.account_audit to service_role;

-- The only public entry point for an Edge Function that needs to append an
-- event. It accepts no timestamp: occurred_at is always database-owned. The
-- detail object must never contain a plaintext recovery code or a credential;
-- callers pass only the small, server-authored facts needed for investigation.
create function public.record_account_audit_event(
  p_event_type text,
  p_user_id uuid,
  p_actor_type text,
  p_detail jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_audit (event_type, user_id, actor_type, detail)
  values (p_event_type, p_user_id, p_actor_type, p_detail);
end;
$$;

revoke execute on function public.record_account_audit_event(text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_account_audit_event(text, uuid, text, jsonb)
  to service_role;

-- Auth owns auth.identities and Google linking does not pass through an Edge
-- Function in this repository. The trigger therefore records provider rows at
-- the database boundary. It stores only the provider, never identity_data,
-- email, access tokens, or provider subject identifiers. When auth.users itself
-- is deleted, its cascade removes auth.identities after the parent row is gone;
-- the removal event therefore keeps a null account link so the audit row does
-- not make account deletion fail its own FK.
create function public.audit_auth_identity_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  perform public.record_account_audit_event(
    'identity_removed',
    case
      when exists (select 1 from auth.users where auth.users.id = old.user_id)
        then old.user_id
      else null
    end,
    'auth',
    jsonb_build_object('provider', old.provider)
  );
  return old;
end;
$$;

create trigger auth_identity_account_audit
  after insert or delete on auth.identities
  for each row execute function public.audit_auth_identity_change();

-- Recovery issuance is transactionally coupled to the row insert. Redemption
-- is intentionally recorded by the recovery Edge Function only after the
-- session mint succeeds: the code is claimed before minting and may be
-- reverted if minting fails, so a table trigger would record a false success.
create function public.audit_recovery_code_issued() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_account_audit_event(
    'recovery_code_issued',
    new.user_id,
    'user',
    null
  );
  return new;
end;
$$;

create trigger recovery_code_issued_account_audit
  after insert on public.recovery_codes
  for each row execute function public.audit_recovery_code_issued();

create function public.audit_entitlement_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_account_audit_event(
      'entitlement_granted',
      new.user_id,
      'server',
      jsonb_build_object(
        'entitlementKey', new.entitlement_key,
        'source', new.source
      )
    );
    return new;
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    perform public.record_account_audit_event(
      'entitlement_revoked',
      new.user_id,
      'server',
      jsonb_build_object('entitlementKey', new.entitlement_key)
    );
  elsif old.revoked_at is not null and new.revoked_at is null then
    perform public.record_account_audit_event(
      'entitlement_granted',
      new.user_id,
      'server',
      jsonb_build_object(
        'entitlementKey', new.entitlement_key,
        'source', new.source
      )
    );
  end if;
  return new;
end;
$$;

create trigger entitlement_change_account_audit
  after insert or update of revoked_at on public.entitlements
  for each row execute function public.audit_entitlement_change();

create function public.audit_rejected_save() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.outcome = 'rejected' then
    perform public.record_account_audit_event(
      'save_rejected',
      new.user_id,
      'user',
      jsonb_build_object(
        'errorCode', new.error_code,
        'baseRevision', new.base_revision,
        'documentBytes', new.document_bytes
      )
    );
  end if;
  return new;
end;
$$;

create trigger rejected_save_account_audit
  after insert on public.save_audit
  for each row execute function public.audit_rejected_save();

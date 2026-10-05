-- One receipt per accepted portfolio command. The service-role RPC below
-- shifts the save and records its response in the same database transaction.
create table public.portfolio_command_receipts (
  user_id            uuid        not null references auth.users(id) on delete cascade,
  idempotency_key    uuid        not null,
  fingerprint        text        not null,
  base_revision      bigint      not null,
  resulting_revision bigint      not null,
  response_json      jsonb       not null,
  created_at         timestamptz not null default now(),
  primary key (user_id, idempotency_key),
  constraint portfolio_command_receipts_fingerprint_format
    check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint portfolio_command_receipts_revisions
    check (base_revision > 0 and resulting_revision = base_revision + 1),
  constraint portfolio_command_receipts_response_size
    check (octet_length(response_json::text) <= 131072)
);

alter table public.portfolio_command_receipts enable row level security;
revoke all on public.portfolio_command_receipts from anon, authenticated;

-- The Edge Function validates the document and computes the command. The RPC
-- serializes commands for an account, checks the save revision against routine
-- uploads, then writes the save and its replay receipt atomically. No client
-- role can execute it or write either table directly.
create function public.apply_portfolio_command(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_fingerprint text,
  p_base_revision bigint,
  p_document_json text,
  p_received_at timestamptz,
  p_result_json jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_save public.saves%rowtype;
  v_receipt public.portfolio_command_receipts%rowtype;
  v_response jsonb;
begin
  if p_user_id is null or p_idempotency_key is null or
     p_fingerprint !~ '^[0-9a-f]{64}$' or
     p_base_revision is null or p_base_revision <= 0 or
     p_document_json is null or p_received_at is null or
     p_result_json is null then
    raise exception 'Invalid portfolio command arguments.' using errcode = '22023';
  end if;

  -- A per-user transaction lock makes a duplicate wait for the first command
  -- to commit before inspecting its receipt. It also serializes distinct
  -- commands, while the saves row lock/CAS handles concurrent routine PUTs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into v_receipt
    from public.portfolio_command_receipts
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.fingerprint <> p_fingerprint then
      return pg_catalog.jsonb_build_object('status', 'key_reused');
    end if;
    return v_receipt.response_json;
  end if;

  select * into v_save from public.saves
    where user_id = p_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'missing_save');
  end if;
  if v_save.revision <> p_base_revision then
    return pg_catalog.jsonb_build_object(
      'status', 'revision_conflict', 'serverRevision', v_save.revision
    );
  end if;
  if (p_document_json::jsonb ->> 'schemaVersion') <> '4' or
     pg_catalog.octet_length(p_document_json) > 65536 or
     p_received_at < v_save.received_at then
    raise exception 'Invalid portfolio command document or receipt time.' using errcode = '22023';
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'status', 'applied',
    'revision', v_save.revision + 1,
    'receivedAt', p_received_at,
    'document', p_document_json::jsonb,
    'result', p_result_json
  );
  update public.saves set
    revision = v_save.revision + 1,
    schema_version = 4,
    document_json = p_document_json,
    received_at = p_received_at,
    previous_revision = v_save.revision,
    previous_document_json = v_save.document_json,
    previous_received_at = v_save.received_at
    where user_id = p_user_id and revision = p_base_revision;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'revision_conflict');
  end if;
  insert into public.portfolio_command_receipts (
    user_id, idempotency_key, fingerprint, base_revision,
    resulting_revision, response_json
  ) values (
    p_user_id, p_idempotency_key, p_fingerprint, p_base_revision,
    v_save.revision + 1, v_response
  );
  return v_response;
end;
$$;

revoke all on function public.apply_portfolio_command(
  uuid, uuid, text, bigint, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_portfolio_command(
  uuid, uuid, text, bigint, text, timestamptz, jsonb
) to service_role;

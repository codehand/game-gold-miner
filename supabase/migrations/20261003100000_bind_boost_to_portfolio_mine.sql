-- Bind the account-wide Boost cooldown to the mine that was foreground when
-- it activated. Existing pre-portfolio activations belong to the Gold Mine.
alter table public.mine_boosts add column mine_id text;
update public.mine_boosts set mine_id = 'gold' where mine_id is null;
alter table public.mine_boosts alter column mine_id set not null;
alter table public.mine_boosts add constraint mine_boosts_mine_known
  check (mine_id in ('gold', 'amethyst', 'ruby', 'sapphire', 'emerald', 'diamond'));

drop function public.activate_mine_boost(uuid);

-- Boost activation, V4 save binding and the replay receipt share one
-- transaction. A timed-out client can retry the same key without consuming a
-- second cooldown or changing the save revision twice.
create function public.activate_portfolio_mine_boost(
  p_user_id uuid,
  p_mine_id text,
  p_base_revision bigint,
  p_idempotency_key uuid,
  p_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_save public.saves%rowtype;
  v_boost public.mine_boosts%rowtype;
  v_receipt public.portfolio_command_receipts%rowtype;
  v_document jsonb;
  v_response jsonb;
begin
  if p_user_id is null or
     p_mine_id not in ('gold', 'amethyst', 'ruby', 'sapphire', 'emerald', 'diamond') or
     p_base_revision is null or p_base_revision <= 0 or
     p_idempotency_key is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid portfolio Boost arguments.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into v_receipt from public.portfolio_command_receipts
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.fingerprint <> p_fingerprint then
      return pg_catalog.jsonb_build_object('status', 'key_reused');
    end if;
    return v_receipt.response_json;
  end if;

  select * into v_save from public.saves where user_id = p_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'missing_save');
  end if;
  if v_save.revision <> p_base_revision then
    return pg_catalog.jsonb_build_object(
      'status', 'revision_conflict', 'serverRevision', v_save.revision
    );
  end if;
  v_document := v_save.document_json::jsonb;
  if v_document ->> 'schemaVersion' is distinct from '4' or
     v_document ->> 'activeMineId' is distinct from p_mine_id or
     not ((v_document -> 'mines') ? p_mine_id) then
    return pg_catalog.jsonb_build_object('status', 'mine_not_active');
  end if;

  select * into v_boost from public.mine_boosts
    where user_id = p_user_id for update;
  if found and v_boost.last_activated_at > v_now - interval '8 hours' then
    return pg_catalog.jsonb_build_object(
      'status', 'cooldown',
      'revision', v_save.revision,
      'receivedAt', v_save.received_at,
      'document', v_document,
      'result', pg_catalog.jsonb_build_object(
        'type', 'boost',
        'mineId', v_boost.mine_id,
        'activatedAtMs', pg_catalog.floor(
          extract(epoch from v_boost.last_activated_at) * 1000
        )::bigint
      )
    );
  end if;

  insert into public.mine_boosts (user_id, mine_id, last_activated_at, updated_at)
  values (p_user_id, p_mine_id, v_now, v_now)
  on conflict (user_id) do update set
    mine_id = excluded.mine_id,
    last_activated_at = excluded.last_activated_at,
    updated_at = excluded.updated_at;

  v_document := pg_catalog.jsonb_set(
    v_document, '{boostMineId}', pg_catalog.to_jsonb(p_mine_id), true
  );
  v_response := pg_catalog.jsonb_build_object(
    'status', 'applied',
    'revision', v_save.revision + 1,
    'receivedAt', v_now,
    'document', v_document,
    'result', pg_catalog.jsonb_build_object(
      'type', 'boost',
      'mineId', p_mine_id,
      'activatedAtMs', pg_catalog.floor(extract(epoch from v_now) * 1000)::bigint
    )
  );

  update public.saves set
    revision = v_save.revision + 1,
    schema_version = 4,
    document_json = v_document::text,
    received_at = v_now,
    previous_revision = v_save.revision,
    previous_document_json = v_save.document_json,
    previous_received_at = v_save.received_at
  where user_id = p_user_id and revision = p_base_revision;

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

revoke all on function public.activate_portfolio_mine_boost(
  uuid, text, bigint, uuid, text
) from public, anon, authenticated;
grant execute on function public.activate_portfolio_mine_boost(
  uuid, text, bigint, uuid, text
) to service_role;

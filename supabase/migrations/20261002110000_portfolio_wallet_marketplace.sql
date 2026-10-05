-- V3 stores the account wallet at state.gold; V4 stores it once at walletGold.
-- These functions are callable only inside service-role RPCs.
create function public.save_wallet_gold(p_document jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare v_gold numeric;
begin
  if p_document ->> 'schemaVersion' = '4' then
    v_gold := (p_document ->> 'walletGold')::numeric;
  else
    v_gold := (p_document #>> '{state,gold}')::numeric;
  end if;
  if v_gold is null or v_gold < 0 then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end if;
  return v_gold;
end;
$$;

create function public.save_with_wallet_gold(p_document jsonb, p_gold numeric) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p_gold is null or p_gold < 0 then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end if;
  if p_document ->> 'schemaVersion' = '4' then
    return pg_catalog.jsonb_set(p_document, '{walletGold}', pg_catalog.to_jsonb(p_gold::text), true);
  end if;
  return pg_catalog.jsonb_set(p_document, '{state,gold}', pg_catalog.to_jsonb(p_gold::text), true);
end;
$$;

create function public.persist_wallet_document(p_user_id uuid, p_document jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.saves set
    previous_revision = revision,
    previous_document_json = document_json,
    previous_received_at = received_at,
    document_json = p_document::text,
    revision = revision + 1,
    schema_version = (p_document ->> 'schemaVersion')::integer,
    received_at = pg_catalog.now()
  where user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end if;
end;
$$;

revoke execute on function public.save_wallet_gold(jsonb) from public, anon, authenticated;
revoke execute on function public.save_with_wallet_gold(jsonb, numeric) from public, anon, authenticated;
revoke execute on function public.persist_wallet_document(uuid, jsonb) from public, anon, authenticated;

-- The relational Collection is authoritative. Every V4 save carries a
-- projection so a routine upload cannot resurrect a traded or assigned cat.
-- Call with p_bump_revision=false after a wallet RPC has already advanced it.
create function public.sync_portfolio_cat_roster(p_user_id uuid, p_bump_revision boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_document jsonb;
  v_cats jsonb;
  v_assignments jsonb;
  v_account public.cat_collection_accounts%rowtype;
begin
  select document_json::jsonb into v_document
  from public.saves where user_id = p_user_id for update;
  if v_document is null or v_document ->> 'schemaVersion' <> '4' then
    return;
  end if;

  select * into v_account from public.cat_collection_accounts
  where user_id = p_user_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'catInstanceId', c.cat_instance_id::text,
    'ownerUserId', p_user_id::text,
    'assetId', c.asset_id,
    'displayName', c.display_name,
    'roleId', c.role_id,
    'rarityTier', c.rarity_tier,
    'level', c.level,
    'attributes', pg_catalog.jsonb_build_object(
      'power', c.power, 'speed', c.speed,
      'capacity', c.capacity, 'efficiency', c.efficiency),
    'calculationVersion', c.calculation_version,
    'availabilityState', case
      when c.owner_user_id = p_user_id and c.renter_user_id is not null then 'Rented'
      when c.renter_user_id = p_user_id and c.availability_state <> 'Assigned' then 'Idle'
      else c.availability_state end,
    'assignedSlotKey', case
      when c.owner_user_id = p_user_id and c.renter_user_id is not null then null
      else c.assigned_slot_key end,
    'updatedAt', pg_catalog.floor(extract(epoch from c.updated_at) * 1000)::bigint
  ) order by c.cat_instance_id), '[]'::jsonb) into v_cats
  from public.cat_instances c
  where c.owner_user_id = p_user_id
     or (c.renter_user_id = p_user_id and c.rental_expires_at > pg_catalog.now());

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'slotKey', a.slot_key, 'catInstanceId', a.cat_instance_id::text
  ) order by a.slot_key), '[]'::jsonb) into v_assignments
  from public.cat_assignments a where a.owner_user_id = p_user_id;

  v_document := pg_catalog.jsonb_set(v_document, '{cats}', v_cats);
  v_document := pg_catalog.jsonb_set(v_document, '{assignments}', v_assignments);
  v_document := pg_catalog.jsonb_set(v_document, '{assignmentRevision}',
    pg_catalog.to_jsonb(coalesce(v_account.assignment_revision, 0)));
  v_document := pg_catalog.jsonb_set(v_document, '{collectionRevision}',
    pg_catalog.to_jsonb(coalesce(v_account.collection_revision, 0)));
  if p_bump_revision then
    perform public.persist_wallet_document(p_user_id, v_document);
  else
    update public.saves set document_json = v_document::text where user_id = p_user_id;
  end if;
end;
$$;
revoke execute on function public.sync_portfolio_cat_roster(uuid, boolean) from public, anon, authenticated;

create or replace function public.purchase_cat_instance(
  p_user_id uuid,
  p_asset_id text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_blueprint public.cat_blueprints%rowtype;
  v_document jsonb;
  v_gold numeric;
  v_new_gold text;
  v_cat uuid;
begin
  select cat_instance_id into v_existing
  from public.cat_purchase_requests
  where owner_user_id = p_user_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_blueprint from public.cat_blueprints where asset_id = p_asset_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_asset';
  end if;

  select document_json::jsonb into v_document
  from public.saves
  where user_id = p_user_id
  for update;
  if v_document is null then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end if;

  begin
    v_gold := public.save_wallet_gold(v_document);
  exception when others then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end;
  if v_gold < v_blueprint.price_exact then
    raise exception using errcode = 'P0001', message = 'insufficient_funds';
  end if;

  v_new_gold := (v_gold - v_blueprint.price_exact)::text;
  v_document := public.save_with_wallet_gold(v_document, v_new_gold::numeric);
  perform public.persist_wallet_document(p_user_id, v_document);

  insert into public.cat_collection_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do update set collection_revision = cat_collection_accounts.collection_revision + 1;

  insert into public.cat_instances (
    owner_user_id, asset_id, display_name, role_id, rarity_tier,
    power, speed, capacity, efficiency
  ) values (
    p_user_id, v_blueprint.asset_id, v_blueprint.display_name, v_blueprint.role_id,
    v_blueprint.rarity_tier, v_blueprint.power, v_blueprint.speed,
    v_blueprint.capacity, v_blueprint.efficiency
  ) returning cat_instance_id into v_cat;

  insert into public.cat_purchase_requests(owner_user_id, idempotency_key, cat_instance_id, price_exact)
  values (p_user_id, p_idempotency_key, v_cat, v_blueprint.price_exact);

  perform public.sync_portfolio_cat_roster(p_user_id, false);

  return v_cat;
end;
$$;

create or replace function public.buy_cat_listing(
  p_buyer_user_id uuid,
  p_listing_id uuid,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.cat_marketplace_requests%rowtype;
  v_listing public.cat_marketplace_listings%rowtype;
  v_cat public.cat_instances%rowtype;
  v_buyer_document jsonb;
  v_seller_document jsonb;
  v_buyer_gold numeric;
  v_seller_gold numeric;
begin
  perform public.settle_due_cat_rentals();

  select * into v_request
  from public.cat_marketplace_requests
  where requester_user_id = p_buyer_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.operation <> 'buy_listing' then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return v_request.result_id;
  end if;

  select * into v_listing
  from public.cat_marketplace_listings
  where listing_id = p_listing_id and listing_type = 'sale'
  for update;
  if not found or v_listing.status <> 'Active' then
    raise exception using errcode = 'P0001', message = 'listing_unavailable';
  end if;
  if v_listing.seller_user_id = p_buyer_user_id then
    raise exception using errcode = 'P0001', message = 'self_trade';
  end if;

  select * into v_cat from public.cat_instances where cat_instance_id = v_listing.cat_instance_id for update;
  if not found or v_cat.owner_user_id <> v_listing.seller_user_id or v_cat.availability_state <> 'Listed' then
    raise exception using errcode = 'P0001', message = 'listing_unavailable';
  end if;

  if p_buyer_user_id < v_listing.seller_user_id then
    select document_json::jsonb into v_buyer_document
    from public.saves where user_id = p_buyer_user_id for update;
    select document_json::jsonb into v_seller_document
    from public.saves where user_id = v_listing.seller_user_id for update;
  else
    select document_json::jsonb into v_seller_document
    from public.saves where user_id = v_listing.seller_user_id for update;
    select document_json::jsonb into v_buyer_document
    from public.saves where user_id = p_buyer_user_id for update;
  end if;
  if v_buyer_document is null or v_seller_document is null then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end if;
  begin
    v_buyer_gold := public.save_wallet_gold(v_buyer_document);
    v_seller_gold := public.save_wallet_gold(v_seller_document);
  exception when others then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end;
  if v_buyer_gold < v_listing.price_exact then
    raise exception using errcode = 'P0001', message = 'insufficient_funds';
  end if;

  v_buyer_document := public.save_with_wallet_gold(v_buyer_document, v_buyer_gold - v_listing.price_exact);
  v_seller_document := public.save_with_wallet_gold(v_seller_document, v_seller_gold + v_listing.price_exact);
  perform public.persist_wallet_document(p_buyer_user_id, v_buyer_document);
  perform public.persist_wallet_document(v_listing.seller_user_id, v_seller_document);

  update public.cat_instances
  set owner_user_id = p_buyer_user_id,
      availability_state = 'Idle',
      assigned_slot_key = null,
      renter_user_id = null,
      rental_expires_at = null,
      updated_at = pg_catalog.now()
  where cat_instance_id = v_listing.cat_instance_id;
  update public.cat_marketplace_listings
  set status = 'Sold', buyer_user_id = p_buyer_user_id, completed_at = pg_catalog.now()
  where listing_id = p_listing_id;

  insert into public.cat_collection_accounts(user_id)
  values (p_buyer_user_id), (v_listing.seller_user_id)
  on conflict (user_id) do update
    set collection_revision = public.cat_collection_accounts.collection_revision + 1;

  insert into public.cat_marketplace_requests(requester_user_id, idempotency_key, operation, result_id)
  values (p_buyer_user_id, p_idempotency_key, 'buy_listing', p_listing_id);
  perform public.sync_portfolio_cat_roster(p_buyer_user_id, false);
  perform public.sync_portfolio_cat_roster(v_listing.seller_user_id, false);
  return p_listing_id;
end;
$$;

create or replace function public.rent_cat_listing(
  p_renter_user_id uuid,
  p_listing_id uuid,
  p_duration_hours integer,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.cat_marketplace_requests%rowtype;
  v_listing public.cat_marketplace_listings%rowtype;
  v_cat public.cat_instances%rowtype;
  v_renter_document jsonb;
  v_owner_document jsonb;
  v_renter_gold numeric;
  v_owner_gold numeric;
  v_total numeric;
  v_rental uuid;
  v_expires_at timestamptz;
begin
  perform public.settle_due_cat_rentals();

  select * into v_request
  from public.cat_marketplace_requests
  where requester_user_id = p_renter_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.operation <> 'rent_listing' then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return v_request.result_id;
  end if;

  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 24 then
    raise exception using errcode = 'P0001', message = 'invalid_duration';
  end if;

  select * into v_listing
  from public.cat_marketplace_listings
  where listing_id = p_listing_id and listing_type = 'rent'
  for update;
  if not found or v_listing.status <> 'Active' then
    raise exception using errcode = 'P0001', message = 'listing_unavailable';
  end if;
  if v_listing.seller_user_id = p_renter_user_id then
    raise exception using errcode = 'self_trade';
  end if;

  select * into v_cat from public.cat_instances where cat_instance_id = v_listing.cat_instance_id for update;
  if not found or v_cat.owner_user_id <> v_listing.seller_user_id or v_cat.availability_state <> 'Listed' then
    raise exception using errcode = 'P0001', message = 'listing_unavailable';
  end if;

  v_total := v_listing.price_exact * p_duration_hours;
  if p_renter_user_id < v_listing.seller_user_id then
    select document_json::jsonb into v_renter_document from public.saves where user_id = p_renter_user_id for update;
    select document_json::jsonb into v_owner_document from public.saves where user_id = v_listing.seller_user_id for update;
  else
    select document_json::jsonb into v_owner_document from public.saves where user_id = v_listing.seller_user_id for update;
    select document_json::jsonb into v_renter_document from public.saves where user_id = p_renter_user_id for update;
  end if;
  if v_renter_document is null or v_owner_document is null then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end if;
  begin
    v_renter_gold := public.save_wallet_gold(v_renter_document);
    v_owner_gold := public.save_wallet_gold(v_owner_document);
  exception when others then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end;
  if v_renter_gold < v_total then
    raise exception using errcode = 'P0001', message = 'insufficient_funds';
  end if;

  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(hours => p_duration_hours);
  v_renter_document := public.save_with_wallet_gold(v_renter_document, v_renter_gold - v_total);
  v_owner_document := public.save_with_wallet_gold(v_owner_document, v_owner_gold + v_total);
  perform public.persist_wallet_document(p_renter_user_id, v_renter_document);
  perform public.persist_wallet_document(v_listing.seller_user_id, v_owner_document);

  insert into public.cat_rentals(
    listing_id, cat_instance_id, owner_user_id, renter_user_id,
    hourly_price_exact, duration_hours, total_price_exact, expires_at
  ) values (
    p_listing_id, v_listing.cat_instance_id, v_listing.seller_user_id, p_renter_user_id,
    v_listing.price_exact, p_duration_hours, v_total, v_expires_at
  ) returning rental_id into v_rental;

  update public.cat_instances
  set availability_state = 'Rented',
      renter_user_id = p_renter_user_id,
      rental_expires_at = v_expires_at,
      updated_at = pg_catalog.now()
  where cat_instance_id = v_listing.cat_instance_id;
  update public.cat_marketplace_listings
  set status = 'Rented', renter_user_id = p_renter_user_id, completed_at = pg_catalog.now()
  where listing_id = p_listing_id;

  insert into public.cat_collection_accounts(user_id)
  values (p_renter_user_id), (v_listing.seller_user_id)
  on conflict (user_id) do update
    set collection_revision = public.cat_collection_accounts.collection_revision + 1;

  insert into public.cat_marketplace_requests(requester_user_id, idempotency_key, operation, result_id)
  values (p_renter_user_id, p_idempotency_key, 'rent_listing', v_rental);
  perform public.sync_portfolio_cat_roster(p_renter_user_id, false);
  perform public.sync_portfolio_cat_roster(v_listing.seller_user_id, false);
  return v_rental;
end;
$$;

alter table public.cat_assignments drop constraint cat_assignments_slot_format;
alter table public.cat_assignments add constraint cat_assignments_slot_format check (
  slot_key = 'elevator:main' or slot_key = 'warehouse:main'
  or slot_key ~ '^miner:[^:]+$' or slot_key ~ '^hauler:[1-5]$'
  or slot_key ~ '^mine:(gold|amethyst|ruby|sapphire|emerald|diamond):(elevator:main|warehouse:main|miner:[^:]+|hauler:[1-5])$'
);

create or replace function public.settle_due_cat_rentals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.cat_rentals%rowtype;
  v_count integer := 0;
begin
  for v_rental in
    select *
    from public.cat_rentals
    where status = 'Active' and expires_at <= pg_catalog.now()
    for update
  loop
    delete from public.cat_assignments where cat_instance_id = v_rental.cat_instance_id;

    update public.cat_instances
    set availability_state = 'Idle',
        assigned_slot_key = null,
        renter_user_id = null,
        rental_expires_at = null
    where cat_instance_id = v_rental.cat_instance_id;

    update public.cat_rentals
    set status = 'Expired'
    where rental_id = v_rental.rental_id;

    update public.cat_marketplace_listings
    set status = 'Expired', renter_user_id = null, completed_at = coalesce(completed_at, pg_catalog.now())
    where listing_id = v_rental.listing_id;

    insert into public.cat_collection_accounts(user_id)
    values (v_rental.owner_user_id)
    on conflict (user_id) do update
      set collection_revision = public.cat_collection_accounts.collection_revision + 1;
    insert into public.cat_collection_accounts(user_id)
    values (v_rental.renter_user_id)
    on conflict (user_id) do update
      set assignment_revision = public.cat_collection_accounts.assignment_revision + 1,
          collection_revision = public.cat_collection_accounts.collection_revision + 1;

    perform public.sync_portfolio_cat_roster(v_rental.owner_user_id);
    perform public.sync_portfolio_cat_roster(v_rental.renter_user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.create_cat_listing(
  p_user_id uuid,
  p_cat_instance_id uuid,
  p_listing_type text,
  p_price_exact numeric,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.cat_marketplace_requests%rowtype;
  v_cat public.cat_instances%rowtype;
  v_listing uuid;
begin
  perform public.settle_due_cat_rentals();

  select * into v_request
  from public.cat_marketplace_requests
  where requester_user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.operation <> 'create_listing' then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return v_request.result_id;
  end if;

  if p_listing_type not in ('sale', 'rent') or p_price_exact is null or p_price_exact <= 0
     or p_price_exact <> pg_catalog.trunc(p_price_exact) or p_price_exact > 1000000000 then
    raise exception using errcode = 'P0001', message = 'invalid_listing';
  end if;

  select * into v_cat
  from public.cat_instances
  where cat_instance_id = p_cat_instance_id
    and owner_user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_cat';
  end if;
  if v_cat.availability_state <> 'Idle' or v_cat.assigned_slot_key is not null or v_cat.renter_user_id is not null then
    raise exception using errcode = 'P0001', message = 'cat_not_listable';
  end if;
  if exists (
    select 1 from public.cat_marketplace_listings
    where cat_instance_id = p_cat_instance_id and status = 'Active'
  ) then
    raise exception using errcode = 'P0001', message = 'listing_exists';
  end if;

  insert into public.cat_marketplace_listings(seller_user_id, cat_instance_id, listing_type, price_exact)
  values (p_user_id, p_cat_instance_id, p_listing_type, p_price_exact)
  returning listing_id into v_listing;

  update public.cat_instances
  set availability_state = 'Listed', updated_at = pg_catalog.now()
  where cat_instance_id = p_cat_instance_id;

  insert into public.cat_marketplace_requests(requester_user_id, idempotency_key, operation, result_id)
  values (p_user_id, p_idempotency_key, 'create_listing', v_listing);
  perform public.sync_portfolio_cat_roster(p_user_id);
  return v_listing;
end;
$$;

create or replace function public.cancel_cat_listing(
  p_user_id uuid,
  p_listing_id uuid,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.cat_marketplace_requests%rowtype;
  v_listing public.cat_marketplace_listings%rowtype;
  v_cat public.cat_instances%rowtype;
begin
  perform public.settle_due_cat_rentals();

  select * into v_request
  from public.cat_marketplace_requests
  where requester_user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.operation <> 'cancel_listing' then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return v_request.result_id;
  end if;

  select * into v_listing
  from public.cat_marketplace_listings
  where listing_id = p_listing_id and seller_user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_listing';
  end if;
  if v_listing.status <> 'Active' then
    raise exception using errcode = 'P0001', message = 'listing_unavailable';
  end if;

  select * into v_cat from public.cat_instances where cat_instance_id = v_listing.cat_instance_id for update;
  if not found or v_cat.owner_user_id <> p_user_id then
    raise exception using errcode = 'P0001', message = 'unknown_cat';
  end if;

  update public.cat_marketplace_listings
  set status = 'Cancelled', completed_at = pg_catalog.now()
  where listing_id = p_listing_id;
  update public.cat_instances
  set availability_state = 'Idle', updated_at = pg_catalog.now()
  where cat_instance_id = v_listing.cat_instance_id;

  insert into public.cat_collection_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do update
    set collection_revision = public.cat_collection_accounts.collection_revision + 1;

  insert into public.cat_marketplace_requests(requester_user_id, idempotency_key, operation, result_id)
  values (p_user_id, p_idempotency_key, 'cancel_listing', p_listing_id);
  perform public.sync_portfolio_cat_roster(p_user_id);
  return p_listing_id;
end;
$$;

create or replace function public.replace_cat_assignment(
  p_user_id uuid,
  p_cat_instance_id uuid,
  p_slot_key text,
  p_expected_assignment_revision bigint
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.cat_collection_accounts%rowtype;
  v_candidate public.cat_instances%rowtype;
  v_current public.cat_assignments%rowtype;
  v_role text;
  v_renter_access boolean := false;
  v_mine_id text;
begin
  perform public.settle_due_cat_rentals();
  insert into public.cat_collection_accounts(user_id)
  values (p_user_id) on conflict (user_id) do nothing;
  select * into v_account from public.cat_collection_accounts
    where user_id = p_user_id for update;
  if v_account.assignment_revision <> p_expected_assignment_revision then
    raise exception using errcode = 'P0001', message = 'stale_revision';
  end if;

  v_mine_id := (pg_catalog.regexp_match(p_slot_key,
    '^mine:(gold|amethyst|ruby|sapphire|emerald|diamond):'))[1];
  if v_mine_id is not null and not exists (
    select 1 from public.saves s
    where s.user_id = p_user_id
      and s.schema_version = 4
      and (s.document_json::jsonb -> 'mines') ? v_mine_id
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_slot';
  end if;
  v_role := case
    when p_slot_key ~ '^(mine:(gold|amethyst|ruby|sapphire|emerald|diamond):)?elevator:main$' then 'elevator'
    when p_slot_key ~ '^(mine:(gold|amethyst|ruby|sapphire|emerald|diamond):)?warehouse:main$' then 'warehouse'
    when p_slot_key ~ '^(mine:(gold|amethyst|ruby|sapphire|emerald|diamond):)?miner:[^:]+$' then 'miner'
    when p_slot_key ~ '^(mine:(gold|amethyst|ruby|sapphire|emerald|diamond):)?hauler:[1-5]$' then 'hauler'
    else null
  end;
  if v_role is null then
    raise exception using errcode = 'P0001', message = 'unknown_slot';
  end if;

  select * into v_current from public.cat_assignments
    where owner_user_id = p_user_id and slot_key = p_slot_key for update;

  if p_cat_instance_id is null then
    if v_role <> 'hauler' then
      raise exception using errcode = 'P0001', message = 'wrong_role';
    end if;
    if v_current.cat_instance_id is null then
      raise exception using errcode = 'P0001', message = 'no_op';
    end if;
    delete from public.cat_assignments
      where owner_user_id = p_user_id and slot_key = p_slot_key;
  else
    select * into v_candidate from public.cat_instances
      where cat_instance_id = p_cat_instance_id and (
        (owner_user_id = p_user_id and renter_user_id is null)
        or (renter_user_id = p_user_id and rental_expires_at > pg_catalog.now())
      ) for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'unknown_cat';
    end if;
    v_renter_access := coalesce(v_candidate.renter_user_id = p_user_id, false);
    if v_candidate.role_id <> v_role then
      raise exception using errcode = 'P0001', message = 'wrong_role';
    end if;
    if v_current.cat_instance_id = p_cat_instance_id then
      raise exception using errcode = 'P0001', message = 'no_op';
    end if;
    if (not v_renter_access and v_candidate.availability_state <> 'Idle')
       or (v_renter_access and v_candidate.availability_state <> 'Rented')
       or v_candidate.assigned_slot_key is not null then
      raise exception using errcode = 'P0001', message = 'cat_not_assignable';
    end if;
    update public.cat_instances
      set availability_state = 'Assigned', assigned_slot_key = p_slot_key,
          updated_at = pg_catalog.now()
      where cat_instance_id = p_cat_instance_id;
    insert into public.cat_assignments(owner_user_id, slot_key, cat_instance_id, assignment_revision)
      values (p_user_id, p_slot_key, p_cat_instance_id, v_account.assignment_revision + 1)
      on conflict (owner_user_id, slot_key) do update
        set cat_instance_id = excluded.cat_instance_id,
            assignment_revision = excluded.assignment_revision;
  end if;

  if v_current.cat_instance_id is not null then
    update public.cat_instances
      set availability_state = case when renter_user_id is null then 'Idle' else 'Rented' end,
          assigned_slot_key = null, updated_at = pg_catalog.now()
      where cat_instance_id = v_current.cat_instance_id;
  end if;
  update public.cat_collection_accounts
    set assignment_revision = assignment_revision + 1,
        collection_revision = collection_revision + 1
    where user_id = p_user_id;
  perform public.sync_portfolio_cat_roster(p_user_id);
  return v_account.assignment_revision + 1;
end;
$$;

-- Live Marketplace trading for player-owned cat listings.
--
-- The browser never writes these tables directly. Listing, sale, rental,
-- cancellation, and expiry state transitions run through service-role RPCs
-- behind the authenticated cat-collection Edge Function.

alter table public.cat_instances
  add column renter_user_id uuid null references auth.users(id) on delete set null,
  add column rental_expires_at timestamptz null;

alter table public.cat_instances
  add constraint cat_instances_rental_pair check (
    (renter_user_id is null) = (rental_expires_at is null)
  ),
  add constraint cat_instances_rental_owner_distinct check (
    renter_user_id is null or renter_user_id <> owner_user_id
  ),
  add constraint cat_instances_rental_state_consistent check (
    renter_user_id is null or availability_state in ('Rented', 'Assigned')
  );

create index cat_instances_renter_state_idx
  on public.cat_instances (renter_user_id, availability_state, rental_expires_at)
  where renter_user_id is not null;

create table public.cat_marketplace_listings (
  listing_id       uuid primary key default gen_random_uuid(),
  seller_user_id   uuid not null references auth.users(id) on delete cascade,
  cat_instance_id  uuid not null references public.cat_instances(cat_instance_id) on delete cascade,
  listing_type     text not null,
  price_exact      numeric not null,
  status           text not null default 'Active',
  buyer_user_id    uuid null references auth.users(id) on delete set null,
  renter_user_id   uuid null references auth.users(id) on delete set null,
  duration_hours   integer null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz null,
  constraint cat_marketplace_listing_type_known check (listing_type in ('sale', 'rent')),
  constraint cat_marketplace_listing_price_valid check (price_exact > 0 and price_exact = pg_catalog.trunc(price_exact) and price_exact <= 1000000000),
  constraint cat_marketplace_listing_status_known check (status in ('Active', 'Sold', 'Rented', 'Cancelled', 'Expired')),
  constraint cat_marketplace_listing_duration_valid check (
    (listing_type = 'sale' and duration_hours is null)
    or (listing_type = 'rent' and duration_hours is null)
  ),
  constraint cat_marketplace_listing_buyer_shape check (
    (status = 'Sold') = (buyer_user_id is not null)
  ),
  constraint cat_marketplace_listing_renter_shape check (
    (status = 'Rented') = (renter_user_id is not null)
  )
);

create unique index cat_marketplace_active_listing_cat_idx
  on public.cat_marketplace_listings (cat_instance_id)
  where status = 'Active';

create index cat_marketplace_active_browse_idx
  on public.cat_marketplace_listings (listing_type, created_at desc)
  where status = 'Active';

create index cat_marketplace_seller_history_idx
  on public.cat_marketplace_listings (seller_user_id, created_at desc);

create trigger cat_marketplace_listings_set_updated_at
  before update on public.cat_marketplace_listings
  for each row execute function public.set_updated_at();

create table public.cat_rentals (
  rental_id          uuid primary key default gen_random_uuid(),
  listing_id         uuid not null unique references public.cat_marketplace_listings(listing_id) on delete cascade,
  cat_instance_id    uuid not null unique references public.cat_instances(cat_instance_id) on delete cascade,
  owner_user_id      uuid not null references auth.users(id) on delete cascade,
  renter_user_id     uuid not null references auth.users(id) on delete cascade,
  hourly_price_exact numeric not null,
  duration_hours     integer not null,
  total_price_exact  numeric not null,
  started_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  status             text not null default 'Active',
  updated_at         timestamptz not null default now(),
  constraint cat_rental_users_distinct check (owner_user_id <> renter_user_id),
  constraint cat_rental_hourly_price_positive check (hourly_price_exact > 0),
  constraint cat_rental_duration_range check (duration_hours between 1 and 24),
  constraint cat_rental_total_price_positive check (total_price_exact > 0),
  constraint cat_rental_expiry_after_start check (expires_at > started_at),
  constraint cat_rental_status_known check (status in ('Active', 'Expired'))
);

create index cat_rentals_renter_state_idx
  on public.cat_rentals (renter_user_id, status, expires_at);

create index cat_rentals_owner_state_idx
  on public.cat_rentals (owner_user_id, status, expires_at);

create trigger cat_rentals_set_updated_at
  before update on public.cat_rentals
  for each row execute function public.set_updated_at();

create table public.cat_marketplace_requests (
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key   text not null,
  operation         text not null,
  result_id         uuid not null,
  created_at        timestamptz not null default now(),
  primary key (requester_user_id, idempotency_key),
  constraint cat_marketplace_request_key_length check (char_length(idempotency_key) between 8 and 128),
  constraint cat_marketplace_request_operation_known check (
    operation in ('create_listing', 'cancel_listing', 'buy_listing', 'rent_listing')
  )
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
  return p_listing_id;
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
    v_buyer_gold := (v_buyer_document #>> '{state,gold}')::numeric;
    v_seller_gold := (v_seller_document #>> '{state,gold}')::numeric;
  exception when others then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end;
  if v_buyer_gold < v_listing.price_exact then
    raise exception using errcode = 'P0001', message = 'insufficient_funds';
  end if;

  v_buyer_document := jsonb_set(v_buyer_document, '{state,gold}', to_jsonb((v_buyer_gold - v_listing.price_exact)::text), true);
  v_seller_document := jsonb_set(v_seller_document, '{state,gold}', to_jsonb((v_seller_gold + v_listing.price_exact)::text), true);
  update public.saves set document_json = v_buyer_document::text, revision = revision + 1, schema_version = 3, received_at = pg_catalog.now() where user_id = p_buyer_user_id;
  update public.saves set document_json = v_seller_document::text, revision = revision + 1, schema_version = 3, received_at = pg_catalog.now() where user_id = v_listing.seller_user_id;

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
    v_renter_gold := (v_renter_document #>> '{state,gold}')::numeric;
    v_owner_gold := (v_owner_document #>> '{state,gold}')::numeric;
  exception when others then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end;
  if v_renter_gold < v_total then
    raise exception using errcode = 'P0001', message = 'insufficient_funds';
  end if;

  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(hours => p_duration_hours);
  v_renter_document := jsonb_set(v_renter_document, '{state,gold}', to_jsonb((v_renter_gold - v_total)::text), true);
  v_owner_document := jsonb_set(v_owner_document, '{state,gold}', to_jsonb((v_owner_gold + v_total)::text), true);
  update public.saves set document_json = v_renter_document::text, revision = revision + 1, schema_version = 3, received_at = pg_catalog.now() where user_id = p_renter_user_id;
  update public.saves set document_json = v_owner_document::text, revision = revision + 1, schema_version = 3, received_at = pg_catalog.now() where user_id = v_listing.seller_user_id;

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
  return v_rental;
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
begin
  perform public.settle_due_cat_rentals();
  insert into public.cat_collection_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  select * into v_account from public.cat_collection_accounts where user_id = p_user_id for update;

  if v_account.assignment_revision <> p_expected_assignment_revision then
    raise exception using errcode = 'P0001', message = 'stale_revision';
  end if;

  v_role := case
    when p_slot_key = 'elevator:main' then 'elevator'
    when p_slot_key = 'warehouse:main' then 'warehouse'
    when p_slot_key like 'miner:%' then 'miner'
    else null
  end;
  if v_role is null then
    raise exception using errcode = 'P0001', message = 'unknown_slot';
  end if;

  select * into v_candidate
  from public.cat_instances
  where cat_instance_id = p_cat_instance_id
    and (
      (owner_user_id = p_user_id and renter_user_id is null)
      or (renter_user_id = p_user_id and rental_expires_at > pg_catalog.now())
    )
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_cat';
  end if;
  v_renter_access := v_candidate.renter_user_id = p_user_id;
  if v_candidate.role_id <> v_role then
    raise exception using errcode = 'P0001', message = 'wrong_role';
  end if;
  if (not v_renter_access and v_candidate.availability_state <> 'Idle')
     or (v_renter_access and (v_candidate.availability_state <> 'Rented' or v_candidate.assigned_slot_key is not null)) then
    raise exception using errcode = 'P0001', message = 'cat_not_assignable';
  end if;

  select * into v_current from public.cat_assignments
  where owner_user_id = p_user_id and slot_key = p_slot_key for update;
  if v_current.cat_instance_id = p_cat_instance_id then
    raise exception using errcode = 'P0001', message = 'no_op';
  end if;

  if v_current.cat_instance_id is not null then
    update public.cat_instances
    set availability_state = case when renter_user_id is null then 'Idle' else 'Rented' end,
        assigned_slot_key = null,
        updated_at = pg_catalog.now()
    where cat_instance_id = v_current.cat_instance_id;
  end if;

  update public.cat_instances
  set availability_state = 'Assigned', assigned_slot_key = p_slot_key, updated_at = pg_catalog.now()
  where cat_instance_id = p_cat_instance_id;

  insert into public.cat_assignments(owner_user_id, slot_key, cat_instance_id, assignment_revision)
  values (p_user_id, p_slot_key, p_cat_instance_id, v_account.assignment_revision + 1)
  on conflict (owner_user_id, slot_key) do update
    set cat_instance_id = excluded.cat_instance_id,
        assignment_revision = excluded.assignment_revision;

  update public.cat_collection_accounts
  set assignment_revision = assignment_revision + 1,
      collection_revision = collection_revision + 1
  where user_id = p_user_id;
  return v_account.assignment_revision + 1;
end;
$$;

revoke all on public.cat_marketplace_listings from anon, authenticated;
revoke all on public.cat_rentals from anon, authenticated;
revoke all on public.cat_marketplace_requests from anon, authenticated;
revoke execute on function public.settle_due_cat_rentals() from public, anon, authenticated;
revoke execute on function public.create_cat_listing(uuid, uuid, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.cancel_cat_listing(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.buy_cat_listing(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.rent_cat_listing(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.settle_due_cat_rentals() to service_role;
grant execute on function public.create_cat_listing(uuid, uuid, text, numeric, text) to service_role;
grant execute on function public.cancel_cat_listing(uuid, uuid, text) to service_role;
grant execute on function public.buy_cat_listing(uuid, uuid, text) to service_role;
grant execute on function public.rent_cat_listing(uuid, uuid, integer, text) to service_role;

alter table public.cat_marketplace_listings enable row level security;
alter table public.cat_rentals enable row level security;
alter table public.cat_marketplace_requests enable row level security;

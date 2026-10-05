-- Cat Collection and Role Assignment v1.
--
-- Ownership and assignment are service-role writes behind the
-- `cat-collection` Edge Function. The client receives a caller-scoped
-- projection, but never writes these tables directly.

create table public.cat_blueprints (
  asset_id       text primary key,
  display_name   text not null,
  role_id        text not null,
  rarity_tier    text not null,
  price_exact    numeric not null,
  power          integer not null,
  speed          integer not null,
  capacity       integer not null,
  efficiency     integer not null,
  constraint cat_blueprints_asset_id_length check (char_length(asset_id) between 1 and 128),
  constraint cat_blueprints_display_name_length check (char_length(display_name) between 1 and 64),
  constraint cat_blueprints_role_known check (role_id in ('elevator', 'warehouse', 'miner')),
  constraint cat_blueprints_rarity_known check (rarity_tier in ('N', 'R', 'SR', 'SSR', 'UR')),
  constraint cat_blueprints_price_positive check (price_exact > 0),
  constraint cat_blueprints_attributes_range check (
    power between 0 and 100 and speed between 0 and 100 and
    capacity between 0 and 100 and efficiency between 0 and 100
  )
);

insert into public.cat_blueprints
  (asset_id, display_name, role_id, rarity_tier, price_exact, power, speed, capacity, efficiency)
values
  ('elevator-cargo-cat:SSR:mofy:idle', 'Mofy', 'elevator', 'SSR', 24000, 74, 91, 80, 83),
  ('elevator-cargo-cat:SSR:elon:idle', 'Elon', 'elevator', 'SSR', 28000, 68, 87, 84, 79),
  ('elevator-cargo-cat:SSR:win:idle', 'Win', 'elevator', 'SSR', 32000, 78, 92, 88, 80),
  ('warehouse-manager:SR:baron:idle', 'Baron', 'warehouse', 'SR', 12000, 85, 65, 90, 78),
  ('warehouse-manager:SR:cipher:idle', 'Cipher', 'warehouse', 'SR', 16000, 62, 84, 76, 88),
  ('warehouse-manager:SR:gauge:idle', 'Gauge', 'warehouse', 'SR', 14500, 72, 70, 87, 73),
  ('warehouse-manager:SSR:nautilus:idle', 'Nautilus', 'warehouse', 'SSR', 30000, 80, 78, 93, 90),
  ('miner:N:mica:idle', 'Mica', 'miner', 'N', 8500, 68, 64, 58, 70),
  ('miner:SSR:forge:idle', 'Forge', 'miner', 'SSR', 36000, 92, 79, 72, 86)
on conflict (asset_id) do nothing;

create table public.cat_collection_accounts (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  assignment_revision  bigint not null default 0,
  collection_revision  bigint not null default 0,
  updated_at           timestamptz not null default now(),
  constraint cat_collection_assignment_revision_non_negative check (assignment_revision >= 0),
  constraint cat_collection_revision_non_negative check (collection_revision >= 0)
);

create trigger cat_collection_accounts_set_updated_at
  before update on public.cat_collection_accounts
  for each row execute function public.set_updated_at();

create table public.cat_instances (
  cat_instance_id    uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references auth.users(id) on delete cascade,
  asset_id           text not null references public.cat_blueprints(asset_id),
  display_name       text not null,
  role_id            text not null,
  rarity_tier        text not null,
  level              integer not null default 1,
  power              integer not null,
  speed              integer not null,
  capacity           integer not null,
  efficiency         integer not null,
  calculation_version integer not null default 1,
  availability_state text not null default 'Idle',
  assigned_slot_key  text null,
  updated_at         timestamptz not null default now(),
  constraint cat_instances_display_name_length check (char_length(display_name) between 1 and 64),
  constraint cat_instances_role_known check (role_id in ('elevator', 'warehouse', 'miner')),
  constraint cat_instances_rarity_known check (rarity_tier in ('N', 'R', 'SR', 'SSR', 'UR')),
  constraint cat_instances_level_positive check (level > 0),
  constraint cat_instances_attributes_range check (
    power between 0 and 100 and speed between 0 and 100 and
    capacity between 0 and 100 and efficiency between 0 and 100
  ),
  constraint cat_instances_calculation_version check (calculation_version = 1),
  constraint cat_instances_state_known check (availability_state in ('Idle', 'Assigned', 'Listed', 'Rented', 'Expired', 'Locked')),
  constraint cat_instances_assigned_state_consistent check (
    (availability_state = 'Assigned') = (assigned_slot_key is not null)
  )
);

create index cat_instances_owner_state_idx
  on public.cat_instances (owner_user_id, availability_state, role_id, updated_at desc);

create trigger cat_instances_set_updated_at
  before update on public.cat_instances
  for each row execute function public.set_updated_at();

create table public.cat_assignments (
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  slot_key            text not null,
  cat_instance_id     uuid not null unique references public.cat_instances(cat_instance_id) on delete cascade,
  assignment_revision bigint not null,
  updated_at          timestamptz not null default now(),
  primary key (owner_user_id, slot_key),
  constraint cat_assignments_slot_format check (
    slot_key = 'elevator:main' or slot_key = 'warehouse:main' or slot_key ~ '^miner:.+$'
  ),
  constraint cat_assignments_revision_positive check (assignment_revision > 0)
);

create index cat_assignments_owner_idx
  on public.cat_assignments (owner_user_id, updated_at desc);

create trigger cat_assignments_set_updated_at
  before update on public.cat_assignments
  for each row execute function public.set_updated_at();

create table public.cat_purchase_requests (
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  idempotency_key     text not null,
  cat_instance_id     uuid not null references public.cat_instances(cat_instance_id) on delete cascade,
  price_exact         numeric not null,
  created_at          timestamptz not null default now(),
  primary key (owner_user_id, idempotency_key),
  constraint cat_purchase_requests_key_length check (char_length(idempotency_key) between 8 and 128),
  constraint cat_purchase_requests_price_positive check (price_exact > 0)
);

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
    v_gold := (v_document #>> '{state,gold}')::numeric;
  exception when others then
    raise exception using errcode = 'P0001', message = 'wallet_unavailable';
  end;
  if v_gold < v_blueprint.price_exact then
    raise exception using errcode = 'P0001', message = 'insufficient_funds';
  end if;

  v_new_gold := (v_gold - v_blueprint.price_exact)::text;
  v_document := jsonb_set(v_document, '{state,gold}', to_jsonb(v_new_gold), true);
  update public.saves
  set document_json = v_document::text,
      revision = revision + 1,
      schema_version = 3,
      received_at = pg_catalog.now()
  where user_id = p_user_id;

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

  return v_cat;
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
begin
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
  where cat_instance_id = p_cat_instance_id and owner_user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_cat';
  end if;
  if v_candidate.role_id <> v_role then
    raise exception using errcode = 'P0001', message = 'wrong_role';
  end if;
  if v_candidate.availability_state <> 'Idle' or v_candidate.assigned_slot_key is not null then
    raise exception using errcode = 'P0001', message = 'cat_not_assignable';
  end if;

  select * into v_current
  from public.cat_assignments
  where owner_user_id = p_user_id and slot_key = p_slot_key
  for update;

  if v_current.cat_instance_id = p_cat_instance_id then
    raise exception using errcode = 'P0001', message = 'no_op';
  end if;

  if v_current.cat_instance_id is not null then
    update public.cat_instances
    set availability_state = 'Idle', assigned_slot_key = null
    where cat_instance_id = v_current.cat_instance_id and owner_user_id = p_user_id;
  end if;

  update public.cat_instances
  set availability_state = 'Assigned', assigned_slot_key = p_slot_key
  where cat_instance_id = p_cat_instance_id and owner_user_id = p_user_id;

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

revoke all on public.cat_blueprints from anon, authenticated;
revoke all on public.cat_collection_accounts from anon, authenticated;
revoke all on public.cat_instances from anon, authenticated;
revoke all on public.cat_assignments from anon, authenticated;
revoke all on public.cat_purchase_requests from anon, authenticated;
revoke execute on function public.purchase_cat_instance(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.replace_cat_assignment(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.purchase_cat_instance(uuid, text, text) to service_role;
grant execute on function public.replace_cat_assignment(uuid, uuid, text, bigint) to service_role;

alter table public.cat_blueprints enable row level security;
alter table public.cat_collection_accounts enable row level security;
alter table public.cat_instances enable row level security;
alter table public.cat_assignments enable row level security;
alter table public.cat_purchase_requests enable row level security;

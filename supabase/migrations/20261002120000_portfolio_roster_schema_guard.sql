-- Legacy and adversarial save rows can omit schemaVersion. SQL NULL must
-- skip V4 roster projection instead of falling through into a save rewrite.
create or replace function public.sync_portfolio_cat_roster(p_user_id uuid, p_bump_revision boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_document jsonb;
  v_cats jsonb;
  v_assignments jsonb;
  v_account public.cat_collection_accounts%rowtype;
begin
  select document_json::jsonb into v_document
  from public.saves where user_id = p_user_id for update;
  if v_document is null or v_document ->> 'schemaVersion' is distinct from '4' then
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

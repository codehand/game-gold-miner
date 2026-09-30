-- The trading-era assignment RPC treated an owner's NULL renter_user_id as
-- SQL NULL (not false). Its availability guard could then be skipped, leaving
-- the unique cat_assignments constraint to raise an opaque server error.
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
  v_renter_access := coalesce(v_candidate.renter_user_id = p_user_id, false);
  if v_candidate.role_id <> v_role then
    raise exception using errcode = 'P0001', message = 'wrong_role';
  end if;
  if (not v_renter_access and v_candidate.availability_state <> 'Idle')
     or (v_renter_access and v_candidate.availability_state <> 'Rented')
     or v_candidate.assigned_slot_key is not null then
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

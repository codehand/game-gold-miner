-- One server-clock Mine Overdrive activation per account per eight hours.
-- The browser has no direct access; the boost Edge Function calls the RPC
-- with the service role after validating the caller's bearer token.

create table public.mine_boosts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_activated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.mine_boosts enable row level security;
revoke all on public.mine_boosts from anon, authenticated;

create or replace function public.activate_mine_boost(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_activated_at timestamptz;
begin
  insert into public.mine_boosts (user_id, last_activated_at, updated_at)
  values (p_user_id, v_now, v_now)
  on conflict (user_id) do update
    set last_activated_at = excluded.last_activated_at,
        updated_at = excluded.updated_at
    where public.mine_boosts.last_activated_at <= v_now - interval '8 hours'
  returning last_activated_at into v_activated_at;

  -- NULL means the account is still on cooldown. The caller reads the row to
  -- return the existing activation; concurrent requests cannot grant twice.
  return v_activated_at;
end;
$$;

revoke all on function public.activate_mine_boost(uuid) from public, anon, authenticated;
grant execute on function public.activate_mine_boost(uuid) to service_role;

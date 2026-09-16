-- Cat Mine Idle server milestone — Step 9.
--
-- Lands the "profiles created by a trigger, never by the client" half of the
-- Step 5 migration's own promise, and of the row-level-security matrix
-- documented in `memory-bank/architecture.md`/`techContext.md`: `profiles`
-- carries a select and an update policy for its own row and, deliberately,
-- no insert policy at all — so a real `public.profiles` row for a freshly
-- created `auth.users` row can only ever come from here.
--
-- `security definer` is required, not decorative: GoTrue inserts into
-- `auth.users` as `supabase_auth_admin`, a role with no privilege on
-- `public.profiles`, so an invoker-rights trigger would fail the very insert
-- it exists to react to. A `security definer` function runs with its
-- owner's privileges — `postgres`, since every migration in this repository
-- runs as that role — and `postgres` owns `public.profiles` without
-- `FORCE ROW LEVEL SECURITY` applied to it, so the owner already bypasses
-- the policies above rather than needing an explicit grant.
--
-- `set search_path = ''` pins name resolution for the same reason
-- `public.set_updated_at()` already does: an unqualified reference would
-- otherwise resolve against whichever search_path the firing role — here,
-- `supabase_auth_admin` — happens to hold, not this function's own.
--
-- Never edit this file after it merges: migrations are forward-only.

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

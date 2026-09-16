-- Server-milestone Step 14 review finding (2026-09-13, optional hardening):
-- both `rotate_recovery_code` and `revert_recovery_code_redemption` are
-- `security invoker` with Postgres's default EXECUTE grant to `public`.
-- `recovery_codes` has row-level security enabled with no policy at all, so
-- `anon`/`authenticated` calling either function through PostgREST's `rpc`
-- endpoint already does nothing today — RLS denies the underlying
-- `update`/`insert`/`select` regardless of who invoked the function. This
-- closes it at the grant layer too, belt-and-braces rather than relying on
-- RLS alone: only `service_role` (`recovery-code`'s own caller, via
-- `admin.rpc(...)`) may execute either function from here on.
--
-- `service_role` is not a Postgres superuser locally (`rolbypassrls` only),
-- so it needs the explicit grant below — confirmed live: without it, the
-- Edge Function's own `admin.rpc('rotate_recovery_code', ...)` call fails
-- with a permission-denied error, not merely a no-op.
--
-- `revoke ... from public` alone is not enough here: Supabase's own bootstrap
-- runs `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role` for this schema, so both functions were
-- created already holding an *individual* execute grant for `anon` and
-- `authenticated` — not merely inherited through `public` — confirmed live
-- by inspecting `pg_proc.proacl` right after `rotate_recovery_code` was
-- first created. Each role's grant has to be revoked explicitly.
revoke execute on function public.rotate_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.rotate_recovery_code(uuid, text) to service_role;

revoke execute on function public.revert_recovery_code_redemption(text) from public, anon, authenticated;
grant execute on function public.revert_recovery_code_redemption(text) to service_role;

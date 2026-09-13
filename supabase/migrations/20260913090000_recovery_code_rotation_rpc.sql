-- Server-milestone Step 14 review finding (2026-09-12): rotating a recovery
-- code was a revoke `update` followed by a separate `insert` — two
-- independent PostgREST requests, not one transaction. An insert failure
-- after a successful revoke left the account with no active code at all,
-- and two concurrent `generate` calls for the same user could both pass the
-- revoke, then race the insert against
-- `recovery_codes_one_active_per_user_idx`. Wrapping both statements in a
-- single `plpgsql` function makes them one transaction: either both apply or
-- neither does, and Postgres serializes concurrent callers on the same
-- `user_id` the same way the redemption `update` already relies on
-- Postgres to serialize concurrent redeemers of the same `code_hash`.
create function public.rotate_recovery_code(p_user_id uuid, p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recovery_codes
  set revoked_at = now()
  where user_id = p_user_id
    and redeemed_at is null
    and revoked_at is null;

  insert into public.recovery_codes (user_id, code_hash) values (p_user_id, p_code_hash);
end;
$$;
